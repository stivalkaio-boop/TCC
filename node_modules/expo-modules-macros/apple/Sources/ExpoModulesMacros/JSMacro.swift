import SwiftDiagnostics
import SwiftSyntax
import SwiftSyntaxMacros

/// Marker macro applied to module / shared-object members that should be exposed to JavaScript.
/// `@ExpoModule` and `@SharedObject` discover declarations carrying this attribute and bind each one
/// directly into the JS object, with the decode-call-encode body inlined into the binding; that part
/// of the expansion lives in those macros.
///
/// On its own, `@JS` emits one thing: a never-called peer that asserts each type crossing the JS
/// boundary is convertible in the direction it travels — arguments are `JavaScriptDecodable`, return
/// values are `JavaScriptEncodable` (a settable property's value type is both). Because it's a
/// **peer** of the marked member, a non-conforming type produces a compile error located on the
/// user's own `@JS` declaration rather than on the enclosing `@ExpoModule`. The assertion mechanism
/// itself is shared (see `directionalConformanceAssertion`); `@JS` only supplies the boundary types,
/// split by direction, that it reads off the declaration.
///
/// Usage:
///
///   @JS
///   func greet(name: String) -> String { ... }
///
///   @JS("doWork")
///   func performWork() async throws { ... }
///
///   @JS
///   var status: String { "ok" }
public struct JSMacro: PeerMacro {
  public static func expansion(
    of node: AttributeSyntax,
    providingPeersOf declaration: some DeclSyntaxProtocol,
    in context: some MacroExpansionContext
  ) throws -> [DeclSyntax] {
    diagnoseParameterSpecifiers(in: declaration, in: context)
    diagnoseFreeFormTypes(in: declaration, in: context)
    diagnoseClosureTypes(in: declaration, in: context)
    diagnoseConcurrentOption(of: node, on: declaration, in: context)
    diagnoseAsyncVariantOption(of: node, on: declaration, in: context)

    guard let member = boundaryMember(of: declaration),
      let assertion = directionalConformanceAssertion(
        name: member.name,
        decodableTypes: member.decodableTypes,
        encodableType: member.encodableType,
        callbackArgumentTypes: member.callbackArgumentTypes,
        isStatic: member.isStatic
      )
    else {
      return []
    }
    return [assertion]
  }
}

/// Emits the diagnostic for `@JS(.concurrent)` on a member that can't take it. The option maps to
/// Swift's `@concurrent`, which requires an `async` function: a synchronous member has nowhere to
/// suspend, and a property or initializer can't be async at all. Diagnosing here points at the
/// user's own `@JS` attribute rather than at the `@concurrent` the module macro would attach.
private func diagnoseConcurrentOption(
  of node: AttributeSyntax,
  on declaration: some DeclSyntaxProtocol,
  in context: some MacroExpansionContext
) {
  guard hasJSOption(node, named: "concurrent") else {
    return
  }
  if let funcDecl = declaration.as(FunctionDeclSyntax.self) {
    guard funcDecl.signature.effectSpecifiers?.asyncSpecifier == nil else {
      return
    }
    context.diagnose(
      Diagnostic(
        node: node,
        message: JSDiagnosticMessage(
          "'.concurrent' needs an 'async' function: a synchronous @JS member runs on the JavaScript thread by definition. Mark the function 'async' to run its body off that thread.",
          id: "js-concurrent-requires-async",
          severity: .error
        ),
        fixIts: [insertAsyncFixIt(for: funcDecl)]
      )
    )
    return
  }
  context.diagnose(
    Diagnostic(
      node: node,
      message: JSDiagnosticMessage(
        "'.concurrent' applies only to an 'async' @JS function, not to a property or initializer.",
        id: "js-concurrent-requires-function",
        severity: .error
      )
    )
  )
}

/// Emits the diagnostics for `@JS(.withAsync("name"))` on a member that can't take it. The option
/// adds a promise-returning variant that calls the function on the concurrent pool, so it needs a
/// synchronous function without a global actor, and the variant's JavaScript name as a string literal.
private func diagnoseAsyncVariantOption(
  of node: AttributeSyntax,
  on declaration: some DeclSyntaxProtocol,
  in context: some MacroExpansionContext
) {
  guard let option = asyncVariantOption(of: node) else {
    return
  }
  guard let funcDecl = declaration.as(FunctionDeclSyntax.self) else {
    context.diagnose(
      Diagnostic(
        node: node,
        message: JSDiagnosticMessage(
          "'.withAsync' applies only to a synchronous @JS function, not to a property or initializer.",
          id: "js-async-variant-requires-function",
          severity: .error
        )
      )
    )
    return
  }
  if funcDecl.signature.effectSpecifiers?.asyncSpecifier != nil {
    context.diagnose(
      Diagnostic(
        node: node,
        message: JSDiagnosticMessage(
          "'.withAsync' adds a promise-returning variant to a synchronous function, and this function is already 'async'. Remove '.withAsync', and use '.concurrent' to run the function off the JavaScript thread.",
          id: "js-async-variant-on-async-function",
          severity: .error
        )
      )
    )
    return
  }
  for duplicate in asyncVariantOptions(of: node).dropFirst() {
    context.diagnose(
      Diagnostic(
        node: duplicate,
        message: JSDiagnosticMessage(
          "'.withAsync' can be listed only once: a function gets one promise-returning variant.",
          id: "js-async-variant-duplicate",
          severity: .error
        )
      )
    )
  }
  if asyncVariantName(of: option) == nil {
    context.diagnose(
      Diagnostic(
        node: option,
        message: JSDiagnosticMessage(
          "'.withAsync' takes the JavaScript name of the variant as a string literal, for example '.withAsync(\"loadAsync\")'.",
          id: "js-async-variant-name",
          severity: .error
        )
      )
    )
  }
  if let isolation = globalActorIsolation(of: funcDecl, in: context) {
    context.diagnose(
      Diagnostic(
        node: node,
        message: JSDiagnosticMessage(
          isolation.enclosingTypeName.map {
            "'.withAsync' calls the function on the concurrent thread pool, so the function can't inherit '\(isolation.attribute)' from '\($0)'. Mark the function 'nonisolated'."
          }
            ?? "'.withAsync' calls the function on the concurrent thread pool, so the function can't be isolated to '\(isolation.attribute)'.",
          id: "js-async-variant-isolated",
          severity: .error
        )
      )
    )
  }
}

/// The global actor a function is isolated to, written on the function itself or inherited from its
/// enclosing type, or `nil` when it has none or is `nonisolated`. `enclosingTypeName` is set when the
/// isolation is inherited.
private func globalActorIsolation(
  of funcDecl: FunctionDeclSyntax,
  in context: some MacroExpansionContext
) -> (attribute: String, enclosingTypeName: String?)? {
  if let attribute = funcDecl.attributes.first(where: hasGlobalActorShape) {
    return (attribute.trimmedDescription, nil)
  }
  if funcDecl.modifiers.contains(where: { $0.name.text == "nonisolated" }) {
    return nil
  }
  guard let enclosing = context.lexicalContext.first,
    let attribute = enclosing.asProtocol(WithAttributesSyntax.self)?.attributes.first(where: hasGlobalActorShape)
  else {
    return nil
  }
  return (attribute.trimmedDescription, enclosing.asProtocol(NamedDeclSyntax.self)?.name.text)
}

/// The fix-it offered alongside the synchronous-function diagnostic: insert `async` into the
/// signature so `@JS(.concurrent)` becomes valid. The macro can't add the keyword itself (no macro
/// role rewrites the declaration it's attached to), but Xcode can apply this in one click.
///
/// `async` goes at the front of the effect specifiers, ahead of any `throws`, which is the only
/// order Swift accepts. When the signature has no effect specifiers yet, the new clause inherits
/// what the parameter clause had trailing it and the parameter clause is left with a single space,
/// so `() -> Int` becomes `() async -> Int` rather than `() async-> Int`.
private func insertAsyncFixIt(for funcDecl: FunctionDeclSyntax) -> FixIt {
  let signature = funcDecl.signature
  var newSignature = signature

  if var effectSpecifiers = signature.effectSpecifiers {
    effectSpecifiers.asyncSpecifier = .keyword(.async, trailingTrivia: .space)
    newSignature.effectSpecifiers = effectSpecifiers
  } else {
    newSignature.effectSpecifiers = FunctionEffectSpecifiersSyntax(
      asyncSpecifier: .keyword(.async, trailingTrivia: signature.parameterClause.trailingTrivia)
    )
    newSignature.parameterClause.trailingTrivia = .space
  }

  return FixIt(
    message: JSFixItMessage("Mark the function 'async'", id: "js-concurrent-insert-async"),
    changes: [.replace(oldNode: Syntax(signature), newNode: Syntax(newSignature))]
  )
}

/// Reports a function or constructor parameter whose specifier a decoded argument can't honor: an
/// `inout` parameter expects its writes to reach the caller, and an `isolated` one expects an actor,
/// while a `@JS` argument is a fresh value decoded from JavaScript. Ownership specifiers (`borrowing`,
/// `consuming`, `sending`) are fine: the binding passes the decoded value under whichever convention
/// the parameter asks for. The specifier is left off the decode and the assertion (see
/// `SpecifiedType`); a parameter reported here is also left out of the assertion.
private func diagnoseParameterSpecifiers(
  in declaration: some DeclSyntaxProtocol,
  in context: some MacroExpansionContext
) {
  let parameters: FunctionParameterListSyntax
  if let funcDecl = declaration.as(FunctionDeclSyntax.self) {
    parameters = funcDecl.signature.parameterClause.parameters
  } else if let initDecl = declaration.as(InitializerDeclSyntax.self) {
    parameters = initDecl.signature.parameterClause.parameters
  } else {
    return
  }
  for parameter in parameters {
    guard let specifier = SpecifiedType(parameter.type).unsupportedSpecifier else {
      continue
    }
    context.diagnose(
      Diagnostic(
        node: parameter.type,
        message: JSDiagnosticMessage(
          "A @JS parameter can't be '\(specifier)': its argument is a value decoded from JavaScript, which can't be written back or carry an isolation.",
          id: "js-parameter-specifier",
          severity: .error
        )
      )
    )
  }
}

/// Emits the free-form (`Any`-bearing) diagnostics for a `@JS` declaration.
///
/// A type built from `Any`, arrays, `String`-keyed dictionaries and optionals converts through the
/// `JavaScriptValue` free-form methods in every position (see `FreeFormConversion`). That means:
/// - a free-form argument, return value or property needs no diagnostic: it decodes through
///   `decodeAny…` and encodes through `encodeAny…`;
/// - a type that holds `Any` in any other shape (`[Int: Any]`, `Set<[String: Any]>`) is an error in
///   every position, since the free-form methods never produce or accept it.
///
/// Types are matched on the type node, so the diagnostic points at the offending type in the user's
/// source. A closure type is left to `diagnoseClosureTypes`.
private func diagnoseFreeFormTypes(
  in declaration: some DeclSyntaxProtocol,
  in context: some MacroExpansionContext
) {
  var types: [TypeSyntax] = []
  if let funcDecl = declaration.as(FunctionDeclSyntax.self) {
    types = funcDecl.signature.parameterClause.parameters.map { SpecifiedType($0.type).type }
    if let returnType = funcDecl.signature.returnClause?.type {
      types.append(returnType)
    }
  } else if let initDecl = declaration.as(InitializerDeclSyntax.self) {
    // A constructor decodes its arguments exactly like a function and has no return value.
    types = initDecl.signature.parameterClause.parameters.map { SpecifiedType($0.type).type }
  } else if let varDecl = declaration.as(VariableDeclSyntax.self),
    let type = varDecl.bindings.first?.typeAnnotation?.type
  {
    types = [type]
  }

  for type in types
  where mentionsFreeFormAny(type) && !isConvertibleFreeFormType(type) && !containsFunctionType(type) {
    context.diagnose(
      Diagnostic(node: type, message: unconvertibleFreeFormError(for: type.trimmedDescription))
    )
  }
}

private func unconvertibleFreeFormError(for type: String) -> JSDiagnosticMessage {
  return JSDiagnosticMessage(
    "A @JS member can't use the type '\(type)': a type holding 'Any' converts to and from JavaScript only when it's built from 'Any', arrays, String-keyed dictionaries and optionals. Use one of those shapes, such as '[String: Any]', or 'JavaScriptValue' to keep the JavaScript value unconverted.",
    id: "js-free-form-unsupported",
    severity: .error
  )
}

private struct JSDiagnosticMessage: DiagnosticMessage {
  let message: String
  let diagnosticID: MessageID
  let severity: DiagnosticSeverity

  init(_ message: String, id: String, severity: DiagnosticSeverity) {
    self.message = message
    self.diagnosticID = MessageID(domain: "ExpoModulesMacros", id: id)
    self.severity = severity
  }
}

private struct JSFixItMessage: FixItMessage {
  let message: String
  let fixItID: MessageID

  init(_ message: String, id: String) {
    self.message = message
    self.fixItID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

/// What an assertion peer needs about the `@JS` member it sits beside: a name (to keep the peer unique
/// among siblings), the boundary types split by conversion direction, and whether the member is
/// type-level. Arguments (and a settable property's incoming value) are decoded; return values (and a
/// property's outgoing value) are encoded, so each is asserted against the protocol for its direction.
private struct BoundaryMember {
  let name: String
  /// Types decoded from JS: function/constructor arguments, a settable property's value type, and the
  /// return types of closure arguments.
  let decodableTypes: [String]
  /// The single type encoded to JS: a function's return type, or a property's value type on read;
  /// `nil` when the member produces nothing JS-visible (a `Void` function).
  let encodableType: String?
  /// The parameter types of closure arguments, encoded to JS when native code calls the closure.
  var callbackArgumentTypes: [String] = []
  /// True for `static`/`class` members, so the peer is emitted in the same metatype context.
  let isStatic: Bool
}

/// Reads the boundary member off a `@JS` declaration, splitting its types by conversion direction. A
/// function contributes its parameter types (decodable) and its return type when non-Void (encodable);
/// an initializer contributes its parameter types; a property contributes its value type as encodable
/// (the getter) and also as decodable when settable (the setter). Composed types (`[Int]`, `String?`,
/// …) are kept verbatim, their conditional conformances transitively constraining the elements. A type
/// that mentions `Any` is left out: it converts through the free-form methods, or is diagnosed by
/// `diagnoseFreeFormTypes`. Returns `nil` for declaration kinds `@JS` doesn't read types from, a
/// property whose type isn't spelled out (a syntactic macro can't recover it), or one whose type
/// mentions `Any`.
private func boundaryMember(of declaration: some DeclSyntaxProtocol) -> BoundaryMember? {
  if let funcDecl = declaration.as(FunctionDeclSyntax.self) {
    let argumentTypes = argumentBoundaryTypes(of: funcDecl.signature.parameterClause.parameters)
    let returnType = funcDecl.signature.returnClause?.type
    let encodableType = returnType.flatMap {
      isVoidType($0) || containsFunctionType($0) || mentionsFreeFormAny($0) ? nil : $0.trimmedDescription
    }
    return BoundaryMember(
      name: funcDecl.name.text,
      decodableTypes: argumentTypes.decodable,
      encodableType: encodableType,
      callbackArgumentTypes: argumentTypes.callbackArguments,
      isStatic: isTypeLevel(funcDecl.modifiers)
    )
  }

  if let initDecl = declaration.as(InitializerDeclSyntax.self) {
    // A constructor decodes its arguments like a function does, and the instance it returns isn't
    // encoded. The name is escaped because it also names the assertion's nested helper, and `init` is
    // a keyword.
    let argumentTypes = argumentBoundaryTypes(of: initDecl.signature.parameterClause.parameters)
    return BoundaryMember(
      name: "`init`",
      decodableTypes: argumentTypes.decodable,
      encodableType: nil,
      callbackArgumentTypes: argumentTypes.callbackArguments,
      isStatic: false
    )
  }

  if let varDecl = declaration.as(VariableDeclSyntax.self),
    let binding = varDecl.bindings.first,
    let identifier = binding.pattern.as(IdentifierPatternSyntax.self),
    let type = binding.typeAnnotation?.type,
    !containsFunctionType(type)
  {
    // A `let`, or a `var` with no setter, is read-only (encodable only). A settable `var` is also
    // decoded on write, so its value type is asserted in both directions. A type that mentions `Any`
    // converts through the free-form methods instead, so it isn't asserted at all.
    guard !mentionsFreeFormAny(type) else {
      return nil
    }
    let typeText = type.trimmedDescription
    let isVar = varDecl.bindingSpecifier.tokenKind == .keyword(.var)
    let isSettable = isVar && bindingIsSettable(binding)
    return BoundaryMember(
      name: identifier.identifier.text,
      decodableTypes: isSettable ? [typeText] : [],
      encodableType: typeText,
      isStatic: isTypeLevel(varDecl.modifiers)
    )
  }

  return nil
}

/// The boundary types of a function's or constructor's arguments: an argument is decoded from JS, and
/// a closure argument instead contributes its parameter types (encoded when native code calls it) and
/// its return type (decoded).
private func argumentBoundaryTypes(
  of parameters: FunctionParameterListSyntax
) -> (decodable: [String], callbackArguments: [String]) {
  // A closure argument moves data the other way: JS receives its parameters and returns its result.
  // A closure in any other position is diagnosed by `diagnoseClosureTypes` and left out here, since
  // its metatype isn't a valid expression in the assertion.
  var decodableTypes: [String] = []
  var callbackArgumentTypes: [String] = []
  for parameter in parameters {
    // The specifier isn't part of the asserted type, and a parameter with one the binding can't honor
    // is reported by `diagnoseParameterSpecifiers` and not asserted.
    let specified = SpecifiedType(parameter.type)
    guard specified.unsupportedSpecifier == nil else {
      continue
    }
    guard let closure = JSClosureType(specified.type) else {
      if !containsFunctionType(specified.type) && !mentionsFreeFormAny(specified.type) {
        decodableTypes.append(specified.type.trimmedDescription)
      }
      continue
    }
    // A closure type that mentions `Any` is reported by `diagnoseClosureTypes` instead.
    for parameter in closure.parameters
    where !containsFunctionType(parameter.type) && !mentionsFreeFormAny(parameter.type) {
      callbackArgumentTypes.append(parameter.type.trimmedDescription)
    }
    let closureReturnType = closure.functionType.returnClause.type
    if let returnType = closure.returnType,
      !containsFunctionType(closureReturnType) && !mentionsFreeFormAny(closureReturnType)
    {
      decodableTypes.append(returnType)
    }
  }
  return (decodableTypes, callbackArgumentTypes)
}

/// True when a return clause is written as `Void` / `()` — nothing crosses the boundary, so it needs
/// no conformance assertion. (A missing return clause never reaches here: `returnClause` is `nil`.)
private func isVoidType(_ type: TypeSyntax) -> Bool {
  let text = type.trimmedDescription
  return text == "Void" || text == "()"
}
