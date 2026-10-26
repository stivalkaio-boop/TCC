import SwiftDiagnostics
import SwiftSyntax
import SwiftSyntaxMacros

/// A closure parameter of a `@JS` function or initializer, read from its declared type. JS passes a
/// function for it, and the binding wraps that function in a native closure of the declared type.
///
/// A function type can't conform to `JavaScriptDecodable`, so a closure parameter doesn't decode
/// through `decode` like other arguments. The data also moves the other way: the closure's parameters
/// are encoded when native code calls it, and its return value is decoded from what the JS function
/// returns.
internal struct JSClosureType {
  /// The function type as written, under any attributes, parentheses and optional wrapper.
  let functionType: FunctionTypeSyntax
  /// The attributes written on the function type, such as `@escaping` or `@Sendable`.
  let attributes: [AttributeSyntax]
  /// The closure's parameters. Each one is encoded to JS when the closure is called.
  let parameters: [Parameter]
  /// The return type as written, or `nil` for `Void`. It is decoded from the JS function's result.
  let returnType: String?
  let isAsync: Bool
  let isThrowing: Bool
  /// True for an optional closure (`((Int) -> Void)?`): JS `null` and `undefined` become `nil`.
  let isOptional: Bool

  /// Returns `nil` when the type isn't a closure, or is a closure nested in another type such as an
  /// array. One optional layer is accepted around the function type.
  init?(_ type: TypeSyntax) {
    var type = unparenthesized(type)
    var isOptional = false
    if let wrapped = optionalWrappedType(type) {
      isOptional = true
      type = unparenthesized(wrapped)
    }
    var attributes: [AttributeSyntax] = []
    if let attributed = type.as(AttributedTypeSyntax.self) {
      attributes = attributed.attributes.compactMap { $0.as(AttributeSyntax.self) }
      type = unparenthesized(attributed.baseType)
    }
    guard let functionType = type.as(FunctionTypeSyntax.self) else {
      return nil
    }
    self.functionType = functionType
    self.attributes = attributes
    self.parameters = functionType.parameters.map(Parameter.init)
    let returnType = functionType.returnClause.type
    self.returnType = isVoidReturnType(returnType) ? nil : returnType.trimmedDescription
    self.isAsync = functionType.effectSpecifiers?.asyncSpecifier != nil
    self.isThrowing = functionType.effectSpecifiers?.throwsClause != nil
    self.isOptional = isOptional
  }

  /// The type of the wrapper closure as the binding declares it. `@escaping` is left out, since it is
  /// only valid on a parameter.
  var wrapperTypeText: String {
    let kept = attributes.filter { attributeName($0) != "escaping" }.map { $0.trimmedDescription + " " }
    let text = kept.joined() + functionType.trimmedDescription
    return isOptional ? "(\(text))?" : text
  }

  /// One parameter of the closure type.
  struct Parameter {
    /// The parameter's type without its specifiers, such as `borrowing` or `inout`.
    let type: TypeSyntax
    /// The specifiers written before the type, such as `borrowing`, `sending` or `inout`.
    let specifiers: [String]
    /// True for a variadic parameter (`Int...`).
    let isVariadic: Bool

    init(_ element: TupleTypeElementSyntax) {
      let specified = SpecifiedType(element.type)
      self.specifiers = specified.specifiers
      self.type = specified.type
      self.isVariadic = element.ellipsis != nil
    }

    /// The first specifier the wrapper can't support, such as `inout` or `isolated`. The wrapper passes
    /// each parameter on to the callback, so an ownership convention doesn't change what it does.
    var unsupportedSpecifier: String? {
      return specifiers.first { !ownershipSpecifiers.contains($0) }
    }
  }
}

/// The statements that bind `name` to the native value of a `@JS` argument read from
/// `valueExpression` (a `JavaScriptUnownedValue`). A closure gets a wrapper around the JS function,
/// and every other type decodes through `decodeCall`.
internal func argumentDecodeStatements(
  type: TypeSyntax,
  into name: String,
  from valueExpression: String
) -> [String] {
  // A specifier such as `borrowing` belongs to the parameter, not to the type that decodes.
  let type = SpecifiedType(type).type
  guard let closure = JSClosureType(type) else {
    let decode = decodeCall(type.trimmedDescription, freeForm: freeFormConversion(of: type), from: valueExpression)
    return ["let \(name) = try \(decode)"]
  }
  return closureArgumentStatements(closure, into: name, from: valueExpression)
}

/// Binds `name` to a closure that calls the JS function in `valueExpression`. The
/// `JavaScriptCallback` keeps the JS function alive and does the thread hops, so the closure can be
/// stored and called from any thread.
private func closureArgumentStatements(
  _ closure: JSClosureType,
  into name: String,
  from valueExpression: String
) -> [String] {
  let callback = "\(name)Callback"
  let wrapper = closureLiteralLines(closure, callback: callback)

  guard closure.isOptional else {
    var lines = ["let \(callback) = try JavaScriptCallback.decode(\(valueExpression), in: runtime)"]
    lines.append("let \(name): \(closure.wrapperTypeText) = " + wrapper[0])
    lines.append(contentsOf: wrapper.dropFirst())
    return lines
  }

  var lines = [
    "let \(name): \(closure.wrapperTypeText)",
    "if let \(callback) = try JavaScriptCallback.decodeIfPresent(\(valueExpression), in: runtime) {",
    "  \(name) = " + wrapper[0],
  ]
  lines.append(contentsOf: wrapper.dropFirst().map { "  " + $0 })
  lines.append("} else {")
  lines.append("  \(name) = nil")
  lines.append("}")
  return lines
}

/// The closure literal `{ p0, p1 in … }` that passes its parameters to the `JavaScriptCallback`,
/// which encodes them, calls the function and decodes the result. The closure's effects pick the
/// method:
/// - a non-throwing `Void` closure doesn't wait for JS (`invokeDetached`);
/// - a sync closure that throws blocks until JS returns (`invokeBlocking`);
/// - an `async` closure suspends instead (`invokeAsync`), and the callback awaits a returned promise.
private func closureLiteralLines(_ closure: JSClosureType, callback: String) -> [String] {
  // `@Sendable` keeps the literal from taking the binding's `@JavaScriptActor` isolation: native code
  // may call it from any thread, and it captures only the callback.
  let parameters = closure.parameters.indices.map { "p\($0)" }
  let header = parameters.isEmpty ? "{ @Sendable in" : "{ @Sendable \(parameters.joined(separator: ", ")) in"

  var arguments = parameters
  if let returnType = closure.returnType {
    arguments.append("returning: \(expressionType(returnType)).self")
  }
  let argumentList = arguments.joined(separator: ", ")

  let call: String
  if closure.isAsync {
    call = "try await \(callback).invokeAsync(\(argumentList))"
  } else if closure.isThrowing || closure.returnType != nil {
    call = "try \(callback).invokeBlocking(\(argumentList))"
  } else {
    call = "\(callback).invokeDetached(\(argumentList))"
  }

  guard closure.isAsync && !closure.isThrowing else {
    return [header, "  " + call, "}"]
  }
  // The closure can't throw, so an error from JS goes to the callback's error reporting.
  return [
    header,
    "  do {",
    "    " + call,
    "  } catch {",
    "    \(callback).reportError(error)",
    "  }",
    "}",
  ]
}

// MARK: - Diagnostics

/// Emits the closure diagnostics for a `@JS` declaration. A closure is supported only as a parameter
/// of a function or initializer, where JS passes a function in. Every other position would need a
/// native closure encoded to a JS function, which isn't supported.
internal func diagnoseClosureTypes(
  in declaration: some DeclSyntaxProtocol,
  in context: some MacroExpansionContext
) {
  if let funcDecl = declaration.as(FunctionDeclSyntax.self) {
    diagnoseClosureParameters(funcDecl.signature.parameterClause.parameters, in: context)
    if let returnType = funcDecl.signature.returnClause?.type, let nested = firstFunctionType(in: returnType) {
      context.diagnose(
        Diagnostic(
          node: nested,
          message: ClosureDiagnosticMessage(
            "A @JS function can't return a closure: a native closure can't be encoded to a JavaScript function.",
            id: "js-closure-return"
          )
        )
      )
    }
    return
  }
  if let initDecl = declaration.as(InitializerDeclSyntax.self) {
    diagnoseClosureParameters(initDecl.signature.parameterClause.parameters, in: context)
    return
  }
  if let varDecl = declaration.as(VariableDeclSyntax.self),
    let type = varDecl.bindings.first?.typeAnnotation?.type,
    let nested = firstFunctionType(in: type)
  {
    context.diagnose(
      Diagnostic(
        node: nested,
        message: ClosureDiagnosticMessage(
          "A @JS property can't have a closure type: a native closure can't be encoded to a JavaScript function.",
          id: "js-closure-property"
        )
      )
    )
  }
}

private func diagnoseClosureParameters(
  _ parameters: FunctionParameterListSyntax,
  in context: some MacroExpansionContext
) {
  for parameter in parameters {
    guard let closure = JSClosureType(parameter.type) else {
      if let nested = firstFunctionType(in: parameter.type) {
        context.diagnose(
          Diagnostic(
            node: nested,
            message: ClosureDiagnosticMessage(
              "A closure in a @JS argument must be the argument's own type, optionally wrapped in an optional. Closures inside other types, such as arrays or dictionaries, aren't supported.",
              id: "js-closure-nested-in-type"
            )
          )
        )
      }
      continue
    }
    diagnoseClosure(closure, in: context)
  }
}

private func diagnoseClosure(_ closure: JSClosureType, in context: some MacroExpansionContext) {
  let functionType = closure.functionType

  for attribute in closure.attributes {
    let name = attributeName(attribute)
    guard name != "escaping" && name != "Sendable" else {
      continue
    }
    context.diagnose(
      Diagnostic(
        node: attribute,
        message: ClosureDiagnosticMessage(
          "'@\(name)' isn't supported on a @JS closure argument. The closure calls JavaScript through its own thread hop, so only '@escaping' and '@Sendable' are allowed.",
          id: "js-closure-attribute"
        )
      )
    )
  }

  if let throwsClause = functionType.effectSpecifiers?.throwsClause, throwsClause.type != nil {
    context.diagnose(
      Diagnostic(
        node: throwsClause,
        message: ClosureDiagnosticMessage(
          "A @JS closure argument can't use typed throws: the error from JavaScript can be any error. Write 'throws' without a type.",
          id: "js-closure-typed-throws"
        )
      )
    )
  }

  for parameter in closure.parameters {
    if let specifier = parameter.unsupportedSpecifier {
      context.diagnose(
        Diagnostic(
          node: parameter.type,
          message: ClosureDiagnosticMessage(
            "A @JS closure argument can't take an '\(specifier)' parameter: its value is encoded and sent to JavaScript, which can't write it back or share its isolation.",
            id: "js-closure-parameter-specifier"
          )
        )
      )
    }
    if parameter.isVariadic {
      context.diagnose(
        Diagnostic(
          node: parameter.type,
          message: ClosureDiagnosticMessage(
            "A @JS closure argument can't take a variadic parameter. Use an array instead.",
            id: "js-closure-variadic-parameter"
          )
        )
      )
    }
  }

  // The closure's parameters are encoded and its result is decoded, so neither can be another
  // closure or a type that mentions `Any`, in any shape.
  let returnType = functionType.returnClause.type
  for type in closure.parameters.map(\.type) + [returnType] {
    if let nested = firstFunctionType(in: type) {
      context.diagnose(
        Diagnostic(
          node: nested,
          message: ClosureDiagnosticMessage(
            "A @JS closure argument can't take or return another closure.",
            id: "js-closure-nested"
          )
        )
      )
    } else if mentionsFreeFormAny(type) {
      context.diagnose(
        Diagnostic(
          node: type,
          message: ClosureDiagnosticMessage(
            "A @JS closure argument can't use the free-form '\(type.trimmedDescription)'. Use a concrete type, or 'JavaScriptValue' to pass a JS value through unchanged.",
            id: "js-closure-free-form"
          )
        )
      )
    }
  }

  if closure.returnType != nil && !closure.isThrowing {
    context.diagnose(
      Diagnostic(
        node: functionType,
        message: ClosureDiagnosticMessage(
          "A @JS closure argument that returns a value must be 'throws': when the JavaScript function throws, the closure has no value to return.",
          id: "js-closure-requires-throws"
        ),
        fixIts: [insertThrowsFixIt(for: functionType)]
      )
    )
  }
}

/// The fix-it for a non-throwing closure that returns a value: insert `throws` after the parameter
/// list, or after `async` when the type has it. The inserted keyword takes over the trivia that
/// followed the token before it, so `(Int) -> Int` becomes `(Int) throws -> Int`.
private func insertThrowsFixIt(for functionType: FunctionTypeSyntax) -> FixIt {
  var newType = functionType
  if var effectSpecifiers = functionType.effectSpecifiers, let asyncSpecifier = effectSpecifiers.asyncSpecifier {
    effectSpecifiers.throwsClause = ThrowsClauseSyntax(
      throwsSpecifier: .keyword(.throws, trailingTrivia: asyncSpecifier.trailingTrivia)
    )
    effectSpecifiers.asyncSpecifier = asyncSpecifier.with(\.trailingTrivia, .space)
    newType.effectSpecifiers = effectSpecifiers
  } else {
    newType.effectSpecifiers = TypeEffectSpecifiersSyntax(
      throwsClause: ThrowsClauseSyntax(
        throwsSpecifier: .keyword(.throws, trailingTrivia: functionType.rightParen.trailingTrivia)
      )
    )
    newType.rightParen = functionType.rightParen.with(\.trailingTrivia, .space)
  }
  return FixIt(
    message: ClosureFixItMessage("Mark the closure 'throws'", id: "js-closure-insert-throws"),
    changes: [.replace(oldNode: Syntax(functionType), newNode: Syntax(newType))]
  )
}

// MARK: - Helpers

/// True when `type` is a function type or has one anywhere inside it.
internal func containsFunctionType(_ type: TypeSyntax) -> Bool {
  return firstFunctionType(in: type) != nil
}

/// The first function type in `type` or anywhere inside it, in source order.
internal func firstFunctionType(in type: some SyntaxProtocol) -> FunctionTypeSyntax? {
  if let functionType = type.as(FunctionTypeSyntax.self) {
    return functionType
  }
  for child in type.children(viewMode: .sourceAccurate) {
    if let found = firstFunctionType(in: child) {
      return found
    }
  }
  return nil
}

/// The type inside any number of single-element, unlabeled parentheses: `((Int) -> Void)` is the
/// same type as `(Int) -> Void`.
private func unparenthesized(_ type: TypeSyntax) -> TypeSyntax {
  if let tuple = type.as(TupleTypeSyntax.self), tuple.elements.count == 1,
    let element = tuple.elements.first, element.firstName == nil
  {
    return unparenthesized(element.type)
  }
  return type
}

/// True when a closure's return type is `Void`, `()` or `Swift.Void`, also inside parentheses.
private func isVoidReturnType(_ type: TypeSyntax) -> Bool {
  let type = unparenthesized(type)
  let text = type.trimmedDescription
  return text == "Void" || text == "()" || text == "Swift.Void"
}

private func attributeName(_ attribute: AttributeSyntax) -> String {
  return attribute.attributeName.trimmedDescription
}

private struct ClosureDiagnosticMessage: DiagnosticMessage {
  let message: String
  let diagnosticID: MessageID
  let severity: DiagnosticSeverity = .error

  init(_ message: String, id: String) {
    self.message = message
    self.diagnosticID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

private struct ClosureFixItMessage: FixItMessage {
  let message: String
  let fixItID: MessageID

  init(_ message: String, id: String) {
    self.message = message
    self.fixItID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}
