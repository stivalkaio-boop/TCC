import SwiftSyntax

/// A `@JS func` collected for **direct JSI binding**. Instead of describing the function with a
/// `Function(...)` / `AsyncFunction(...)` DSL entry that the runtime interprets per call, the enclosing
/// macro synthesizes a decorator (`_decorateModule(object:)` / `_decorateSharedObject(prototype:)`) that binds each such
/// function into the JS object via the closure-taking `JavaScriptObject.setProperty(_:)`, with the
/// decode-call-encode body inlined into the closure. This omits the dynamic-call path entirely:
/// every argument is decoded individually by its static type.
///
/// The receiver (see `Receiver`) is the module's `self` for a module binding, or the per-call `_self`
/// unwrapped from the JS `this` for a shared-object binding. An `async` `@JS func` binds through the
/// two-phase async `setProperty(_:)` overload: the closure is the synchronous decode phase (receiver
/// unwrap, arity guard, argument decode, all while `this` and the arguments are still valid)
/// and returns the async body (call and result encode), so nothing JSI-owned crosses the asynchronous
/// boundary and JS gets a promise.
///
/// A synchronous function marked `@JS(.withAsync("name"))` also binds a promise-returning variant
/// under that name (see `asyncVariant`). It decodes and encodes like an `async` function, and calls
/// the function on the concurrent pool.
internal struct JSFunction {
  let swiftName: String
  private(set) var jsName: String
  let parameters: [FunctionParameterSyntax]
  /// The declared return type as written, or `nil` when the function returns `Void`/nothing.
  let returnType: String?
  /// How the return value encodes when its type mentions `Any`, or `nil` for any other type.
  let returnFreeForm: FreeFormConversion?
  let isThrowing: Bool
  private(set) var isAsync: Bool
  /// The function's name in the source, where a JavaScript name collision is reported.
  private(set) var nameToken: TokenSyntax
  /// The name from `.withAsync("name")` and its token, or `nil` when the attribute doesn't list it.
  private var asyncVariantName: (name: String, token: TokenSyntax)?
  /// True for the binding `asyncVariant` returns: it calls the synchronous function on the concurrent
  /// pool instead of on the JavaScript thread.
  private(set) var isAsyncVariant = false

  init(funcDecl: FunctionDeclSyntax, attribute: AttributeSyntax) {
    self.swiftName = funcDecl.name.text
    self.jsName = jsNameArgument(of: attribute) ?? withoutBackticks(funcDecl.name.text)
    self.nameToken = funcDecl.name
    self.parameters = Array(funcDecl.signature.parameterClause.parameters)

    let declaredReturnType = funcDecl.signature.returnClause?.type
    self.returnType = isVoidType(declaredReturnType) ? nil : declaredReturnType?.trimmedDescription
    self.returnFreeForm = declaredReturnType.flatMap(freeFormConversion(of:))

    let effectSpecifiers = funcDecl.signature.effectSpecifiers
    self.isThrowing = effectSpecifiers?.throwsClause?.throwsSpecifier != nil
    self.isAsync = effectSpecifiers?.asyncSpecifier != nil
    self.asyncVariantName = asyncVariantOption(of: attribute).flatMap(asyncVariantName(of:))
  }

  /// The promise-returning binding that `.withAsync("name")` adds next to a synchronous function, or
  /// `nil` when the attribute doesn't list it. An `async` function gets none: `@JS` reports the option
  /// there.
  var asyncVariant: JSFunction? {
    guard let asyncVariantName, !isAsync else {
      return nil
    }
    var variant = self
    variant.jsName = asyncVariantName.name
    variant.nameToken = asyncVariantName.token
    variant.isAsync = true
    variant.isAsyncVariant = true
    variant.asyncVariantName = nil
    return variant
  }

  /// The number of leading parameters that must always be supplied: the total minus the maximal
  /// trailing run of *omittable* parameters (each having a default value or an optional type). A
  /// non-omittable parameter part-way through stops the run, since arguments are positional — a
  /// required parameter after an omittable one forces the earlier one to be supplied too.
  private var requiredArgumentCount: Int {
    var required = parameters.count
    for parameter in parameters.reversed() {
      guard isOmittable(parameter) else {
        break
      }
      required -= 1
    }
    return required
  }

  /// The decode-call-encode statements that form the host-function body, indented with the given
  /// prefix. Receiver unwrap (shared objects only), then an arity guard (an exact check when every
  /// parameter is required, otherwise a range check) throwing `Exceptions.ArgumentsRangeMismatch`;
  /// then the decode of the always-present required prefix via `JavaScriptDecodable.decode` on a
  /// zero-copy `arguments.unownedValue(at:)`; then the call and result encode via
  /// `JavaScriptEncodable.encode`. When a trailing run of parameters is omittable the call branches
  /// on `arguments.count`, decoding only the slots that branch actually has — `unownedValue(at:)` is
  /// unchecked, so a slot the caller didn't pass is never indexed.
  private func bodyStatements(receiver: Receiver, indent: String) -> String {
    let required = requiredArgumentCount
    let maximum = parameters.count
    var lines: [String] = []

    if let unwrap = receiver.unwrapStatement {
      lines.append(unwrap)
    }

    if required == maximum {
      lines.append(
        """
        guard arguments.count == \(maximum) else {
          throw Exceptions.ArgumentsRangeMismatch((functionName: "\(jsName)", received: arguments.count, required: \(required), maximum: \(maximum)))
        }
        """
      )
    } else {
      lines.append(
        """
        guard arguments.count >= \(required) && arguments.count <= \(maximum) else {
          throw Exceptions.ArgumentsRangeMismatch((functionName: "\(jsName)", received: arguments.count, required: \(required), maximum: \(maximum)))
        }
        """
      )
    }

    // Decode the required prefix once — these slots are present in every accepted arity, so the
    // decode is shared rather than repeated per branch.
    for index in 0..<required {
      lines.append(contentsOf: decodeLines(at: index))
    }

    if required == maximum {
      // No omittable trailing run: a single flat call with every argument decoded. An async
      // function decodes any remaining slots here (still the synchronous phase) and returns its
      // body; a sync one calls and encodes directly.
      if isAsync {
        for index in required..<maximum {
          lines.append(contentsOf: decodeLines(at: index))
        }
        lines.append(contentsOf: asyncBodyLines(receiver: receiver, arity: maximum))
      } else {
        lines.append(contentsOf: callAndEncodeLines(receiver: receiver, arity: maximum, decodingFrom: required))
      }
    } else if isAsync {
      // One body per accepted arity, branching on `arguments.count`. A branch decodes its trailing
      // slots synchronously and returns the async body for that call shape, so each `return` ends
      // the decode phase for its arity.
      lines.append("switch arguments.count {")
      for arity in required...maximum {
        let label = arity == maximum ? "default:" : "case \(arity):"
        lines.append(label)
        for index in required..<arity {
          lines.append(contentsOf: decodeLines(at: index).map { "  " + $0 })
        }
        lines.append(contentsOf: asyncBodyLines(receiver: receiver, arity: arity).map { "  " + $0 })
      }
      lines.append("}")
    } else {
      // One call shape per accepted arity, branching on `arguments.count`. A branch decodes a
      // trailing slot before the call, so this is a `switch` statement (not an expression): a
      // value-returning function declares `result` up front and each branch assigns it.
      if let returnType {
        lines.append("let result: \(expressionType(returnType))")
      }
      lines.append("switch arguments.count {")
      for arity in required...maximum {
        let label = arity == maximum ? "default:" : "case \(arity):"
        lines.append(label)
        for index in required..<arity {
          lines.append(contentsOf: decodeLines(at: index).map { "  " + $0 })
        }
        let assignment = returnType != nil ? "result = " : ""
        lines.append("  \(assignment)\(callExpression(receiver: receiver, arity: arity))")
      }
      lines.append("}")
      lines.append(contentsOf: encodeResultLines())
    }

    return
      lines
      .flatMap { $0.split(separator: "\n", omittingEmptySubsequences: false) }
      .map { indent + $0 }
      .joined(separator: "\n")
  }

  /// The `return { … }` statement closing an async binding's decode phase: the returned closure is
  /// the function's async body (`AsyncFunctionBody`), awaiting the call and encoding the result. It
  /// captures only what the call needs — the decoded `arg<i>` locals, the receiver, and `runtime`
  /// for the encode — never `this` or the arguments buffer, which are only valid for the duration
  /// of the host call. The `asyncVariant` binding awaits its call on the concurrent pool instead.
  private func asyncBodyLines(receiver: Receiver, arity: Int) -> [String] {
    var lines: [String] = ["return {"]
    let call =
      isAsyncVariant
      ? concurrentCallExpression(receiver: receiver, arity: arity)
      : callExpression(receiver: receiver, arity: arity)
    // The concurrent call spans several lines, so each of its lines is indented into the body.
    let indented = { (statement: String) in
      statement.split(separator: "\n", omittingEmptySubsequences: false).map { "  " + $0 }
    }
    if returnType != nil {
      lines.append(contentsOf: indented("let result = \(call)"))
      lines.append(contentsOf: encodeResultLines().map { "  " + $0 })
    } else {
      lines.append(contentsOf: indented(call))
      lines.append("  return .undefined()")
    }
    lines.append("}")
    return lines
  }

  /// The lines binding `arg<index>`: a decode of the slot at `index` by its static type through
  /// `JavaScriptDecodable.decode` on the borrowed `JavaScriptUnownedValue` — no owning value, no
  /// `jsi::Value` copy, no `Any` boxing, no force-cast; it returns the concrete type directly. A
  /// primitive's `decode` is `@inlinable` and lowers to the same direct accessor a hand-rolled fast
  /// path would use. A closure parameter takes several lines instead, wrapping the JS function.
  private func decodeLines(at index: Int) -> [String] {
    return argumentDecodeStatements(
      type: parameters[index].type,
      into: "arg\(index)",
      from: "arguments.unownedValue(at: \(index))"
    )
  }

  /// The `<callee>.<name>(...)` call for the given arity, with the arguments from `callArguments`.
  private func callExpression(receiver: Receiver, arity: Int) -> String {
    // `try` only for a throwing function. An `async` call that doesn't throw must not get one, or the
    // expansion warns that no throwing call occurs within the `try` expression.
    let tryKeyword = isThrowing ? "try " : ""
    let awaitKeyword = isAsync ? "await " : ""
    return "\(tryKeyword)\(awaitKeyword)\(receiver.callee).\(swiftName)(\(callArguments(arity: arity)))"
  }

  /// The call of the `asyncVariant` binding for the given arity: the synchronous function runs in a
  /// `@concurrent` closure, so it leaves the JavaScript thread, and the body continues once it returns.
  private func concurrentCallExpression(receiver: Receiver, arity: Int) -> String {
    // The closure captures the receiver and the decoded arguments, so Swift 6 requires them to be
    // `Sendable`, as it does for the receiver and arguments of a `.concurrent` call. The signature is
    // spelled out because `@concurrent` needs an `async` closure, and a body without `await` would
    // infer a synchronous one.
    let tryKeyword = isThrowing ? "try " : ""
    let effects = isThrowing ? "async throws" : "async"
    let returnClause = returnType.map { " -> \(expressionType($0))" } ?? ""
    return """
      \(tryKeyword)await { @concurrent () \(effects)\(returnClause) in
        \(tryKeyword)\(receiver.callee).\(swiftName)(\(callArguments(arity: arity)))
      }()
      """
  }

  /// The argument list of a call for the given arity. Slots `0..<arity` are passed their decoded
  /// `arg<i>`; a trailing optional-without-default slot that this arity omits is passed `nil`; a
  /// trailing defaulted slot that this arity omits is dropped entirely so Swift applies its default.
  private func callArguments(arity: Int) -> String {
    var callArguments: [String] = []
    for (index, parameter) in parameters.enumerated() {
      let label = parameter.firstName.text
      let value: String?
      if index < arity {
        value = "arg\(index)"
      } else if hasDefaultValue(parameter) {
        // Omitted defaulted slot: drop it from the call so Swift fills in the default.
        value = nil
      } else {
        // Omitted optional-without-default slot: pass `nil`.
        value = "nil"
      }
      guard let value else {
        continue
      }
      callArguments.append(label == "_" ? value : "\(label): \(value)")
    }
    return callArguments.joined(separator: ", ")
  }

  /// The flat (single-arity) call-and-encode lines used when no trailing parameter is omittable:
  /// `let result = <callee>.f(...)` then the return encode (or just `<callee>.f(...)` for a function
  /// that returns nothing).
  private func callAndEncodeLines(receiver: Receiver, arity: Int, decodingFrom: Int) -> [String] {
    var lines: [String] = []
    for index in decodingFrom..<arity {
      lines.append(contentsOf: decodeLines(at: index))
    }
    if returnType != nil {
      lines.append("let result = \(callExpression(receiver: receiver, arity: arity))")
      lines.append(contentsOf: encodeResultLines())
    } else {
      lines.append(callExpression(receiver: receiver, arity: arity))
    }
    return lines
  }

  /// Encode the `result` local back to JS and return it through `JavaScriptEncodable.encode` (or, for a
  /// type that mentions `Any`, the matching `JavaScriptValue` free-form method). Unlike the decode side
  /// there's no primitive fast path: `encode` produces the same value as the primitive's
  /// `toJavaScriptValue(in:)` except for `Int`/`UInt`, where it range-checks
  /// and throws instead of silently encoding an out-of-safe-range value as a lossy number — the
  /// catchable error is the right behavior, and matches how non-primitive integers already encode. A
  /// no-return function has nothing to encode: its binding closure returns `Void` (see
  /// `decorateStatements(object:receiver:)`).
  ///
  /// For an `async` function the encode must run on the JS thread. An `async` body may suspend and
  /// resume on an arbitrary cooperative-pool thread, and encoding a heap-allocated JS value (a string,
  /// object, array, or typed array) off the JS thread races the engine's garbage collector and
  /// corrupts the heap. `runtime.execute` hops the encode onto the JS thread, running inline when it is
  /// already there (the common case, where the body never truly suspended), so synchronous functions —
  /// which always run on the JS thread — keep encoding directly without the wrapper.
  private func encodeResultLines() -> [String] {
    guard let returnType else {
      return []
    }
    let encode = "try \(encodeCall(returnType, freeForm: returnFreeForm, of: "result"))"
    if isAsync {
      return [
        "return try await runtime.execute {",
        "  return \(encode)",
        "}",
      ]
    }
    return ["return \(encode)"]
  }

  /// The `setProperty` statement that installs this function on the JS object. The decode-call-encode
  /// body is inlined directly into the closure passed to the closure-taking `setProperty` overload
  /// (which creates the host function under the hood) — no separate named binding. For an `async`
  /// function the closure is the synchronous decode phase and returns the async body, which selects
  /// the async `setProperty` overload (so JS receives a promise).
  ///
  /// A module captures its `self` **strong** —
  /// the host-function closure is what keeps the native callable alive for as long as JS can invoke
  /// it; its lifetime is bounded by the JS VM's garbage collection of the object. A shared object
  /// captures nothing of the instance: it recovers the typed receiver from the JS `this` per call.
  func decorateStatements(object: String, receiver: Receiver) -> String {
    // Every `@JS` binding hands `this` in as a borrowed `JavaScriptUnownedValue` instead of
    // allocating an owning `JavaScriptValue` and forming its `weak`-runtime reference on every call,
    // and consumes the arguments buffer — sync and async closures share one parameter shape and
    // differ only in what they return. A module ignores `this`; a shared object unwraps it (still
    // borrowed) — an async binding does so in its synchronous decode phase, before the borrow ends.
    // The parameter list is parenthesized and fully typed, since Swift rejects a type annotation on
    // a shorthand `{ [capture] name, name in }` parameter; for a sync binding the explicit
    // `JavaScriptUnownedValue` also selects the (otherwise `@_disfavoredOverload`) unowned-`this`
    // overload.
    // A sync function that returns nothing binds through the `Void` overload, which leaves JS's
    // result as `undefined` without building and writing a value. The closure declares `-> Void`
    // because a body of several statements without a `return` is otherwise ambiguous between the
    // two unowned-`this` overloads.
    let captures = receiver.captureClause
    let parameters = "(this: borrowing JavaScriptUnownedValue, arguments: consuming JavaScriptValuesBuffer)"
    let returnClause = returnType == nil && !isAsync ? " -> Void" : ""

    return """
        \(object).setProperty("\(jsName)") { \(captures)\(parameters)\(returnClause) in
      \(bodyStatements(receiver: receiver, indent: "    "))
        }
      """
  }
}

/// A `@JS var` collected for **direct JSI binding**. Instead of describing the property with a
/// `Property(...)` DSL entry, the enclosing macro synthesizes a get/set accessor into the JS object
/// inside its decorator (`_decorateModule(object:)` / `_decorateSharedObject(prototype:)`): it builds a descriptor object
/// (`enumerable` + `get`, and `set` when the property is settable) and installs it with
/// `object.defineProperty(name, descriptor:)`.
/// The `get`/`set` host functions are installed the same way `@JS func`s are — the closure-taking
/// `setProperty(_:)` overload, with the read/write body inlined into the closure.
///
/// The receiver (see `Receiver`) is the module's `self` for a module binding, or the per-call `_self`
/// unwrapped from the JS `this` for a shared object. The getter reads `<callee>.<name>` and the setter
/// writes `<callee>.<name> = …`. Decode/encode of the value go through `JavaScriptDecodable.decode` /
/// `JavaScriptEncodable.encode` (or the free-form methods for a type that mentions `Any`), the same
/// path as functions.
internal struct JSProperty {
  let swiftName: String
  let jsName: String
  /// The property's value type as written, or `nil` when it couldn't be inferred (no annotation and
  /// no literal default). When `nil` the getter still works (the encode infers from `self.<name>`)
  /// but the setter uses an untyped closure parameter.
  let valueType: String?
  /// How the value converts when its type mentions `Any`, or `nil` for any other type.
  let freeForm: FreeFormConversion?
  /// Whether the property is settable from JS: `true` for a stored `var` or a computed `var` with an
  /// explicit `set` accessor; `false` for a getter-only computed `var` or a `let`.
  let isSettable: Bool
  /// The property's name in the source, where a JavaScript name collision is reported.
  let nameToken: TokenSyntax

  /// The statements that install this property's accessor on the JS object, indented for the
  /// decorator body. Builds a descriptor object (`enumerable` + `get`, and `set` when settable) via
  /// the closure-taking `setProperty(_:)` overload — with the read/write body inlined into each
  /// closure — and installs it with `object.defineProperty(name, descriptor:)`. Capture matches the
  /// function bindings: a module captures `self` strong, a shared object captures nothing of the
  /// instance. Getter and setter are gated independently.
  func decorateStatements(object: String, receiver: Receiver) -> String {
    let descriptorName = derivedIdentifier(from: swiftName, suffix: "Descriptor")
    let callee = receiver.callee
    // A shared object's accessors unwrap the JS `this` into `_self` before reading/writing; a module
    // reads `self` directly. The unwrap leads each accessor body. Property accessors are synchronous, so
    // they take the borrowed unowned `this`.
    let unwrap = receiver.unwrapStatement.map { "\($0)\n" } ?? ""
    var lines: [String] = []

    lines.append("let \(descriptorName) = runtime.createObject()")
    lines.append("\(descriptorName).setProperty(\"enumerable\", value: true)")

    // Getter: read `<callee>.<name>` and encode the result back to JS through `encode`. When the value
    // type couldn't be inferred (no annotation and no literal default, rare for a stored var) there's
    // no static type to call `encode` on, so the value's own `toJavaScriptValue(in:)` is the fallback.
    let getEncode: String
    if let valueType {
      getEncode = "return try \(encodeCall(valueType, freeForm: freeForm, of: "\(callee).\(swiftName)"))"
    } else {
      getEncode = "return \(callee).\(swiftName).toJavaScriptValue(in: runtime)"
    }
    lines.append(
      accessorClosure(descriptorName, "get", receiver: receiver, body: "\(unwrap)\(getEncode)")
    )

    // Setter: decode argument 0 by the static type through `decode` and write `<callee>.<name>`. A
    // typed setter needs a known value type; when the type couldn't be inferred the property is bound
    // getter-only (a settable var with neither an annotation nor a literal default is rare and can't
    // be decoded).
    if isSettable, let valueType {
      let decode = decodeCall(valueType, freeForm: freeForm, from: "arguments.unownedValue(at: 0)")
      let setDecode = "\(callee).\(swiftName) = try \(decode)"
      lines.append(
        accessorClosure(
          descriptorName,
          "set",
          receiver: receiver,
          returnsVoid: true,
          body: "\(unwrap)\(setDecode)"
        )
      )
    }

    lines.append("\(object).defineProperty(\"\(jsName)\", descriptor: \(descriptorName))")

    return
      lines
      .flatMap { $0.split(separator: "\n", omittingEmptySubsequences: false) }
      .map { "  " + $0 }
      .joined(separator: "\n")
  }

  /// One `descriptor.setProperty("get"/"set") { … }` accessor entry. The capture list follows the
  /// receiver: a module captures `self` strong; a shared object captures nothing of the instance.
  /// A setter passes `returnsVoid`, so its closure declares `-> Void` and binds through the `Void`
  /// overload, like a function that returns nothing.
  private func accessorClosure(
    _ descriptorName: String,
    _ key: String,
    receiver: Receiver,
    returnsVoid: Bool = false,
    body: String
  ) -> String {
    let captures = receiver.captureClause
    // Indent each line of a (possibly multi-line) body to sit one level inside the closure; a bare
    // `\(body)` interpolation would only indent the first line.
    let indentedBody =
      body
      .split(separator: "\n", omittingEmptySubsequences: false)
      .map { "  \($0)" }
      .joined(separator: "\n")
    // Property `get`/`set` accessors are always synchronous, so they bind through the unowned-`this`
    // `setProperty` overload like sync functions. The parameter list is parenthesized and fully typed
    // because Swift rejects a type annotation on a shorthand closure parameter; the explicit
    // `borrowing JavaScriptUnownedValue` selects the unowned-`this` overload. A module ignores `this`;
    // a shared object unwraps it in the body.
    let parameters = "(this: borrowing JavaScriptUnownedValue, arguments: consuming JavaScriptValuesBuffer)"
    let returnClause = returnsVoid ? " -> Void" : ""
    return """
      \(descriptorName).setProperty("\(key)") { \(captures)\(parameters)\(returnClause) in
      \(indentedBody)
      }
      """
  }
}

/// The body shared by every decorator phase: every `@JS func` bound via an inlined `setProperty`
/// closure and every `@JS var` via a `defineProperty` accessor, joined for the function body. `object`
/// is the local the bindings decorate (matching the entry point's argument label); `receiver` selects
/// how each binding reaches its Swift value (module `self`, shared-object instance `_self`, or the
/// metatype for a static member).
private func decorateBody(
  functions: [JSFunction],
  properties: [JSProperty],
  object: String,
  receiver: Receiver
) -> String {
  let functionBody = functions.map { $0.decorateStatements(object: object, receiver: receiver) }
  let propertyBody = properties.map { $0.decorateStatements(object: object, receiver: receiver) }
  return (functionBody + propertyBody).joined(separator: "\n")
}

/// The module decorator: a `_decorateModule(object:)` that binds every `@JS func` (via an inlined
/// `setProperty` closure) and every `@JS var` (via a `defineProperty` accessor) into the module's own
/// JS object. Core supplies the object; the bindings call into the module `self`. It's an *instance*
/// method (a module is a singleton, satisfying the `AnyModule` requirement of the same name), with a
/// `borrowing` object parameter (it mutates through the reference without reassigning or taking
/// ownership). Only emitted when there's at least
/// one member to bind. Uses the shared body generation with the module `object:` phase and `self`
/// receiver; the shared-object counterpart is `buildDecorateSharedObjectPhase`.
internal func buildDecorateJavaScriptObject(functions: [JSFunction], properties: [JSProperty]) -> DeclSyntax {
  let body = decorateBody(
    functions: functions,
    properties: properties,
    object: Phase.object.rawValue,
    receiver: .module
  )
  return """
    @JavaScriptActor
    public func _decorateModule(object: borrowing JavaScriptObject, in runtime: JavaScriptRuntime) throws {
    \(raw: body)
    }
    """
}

/// A shared-object decorator phase, a label overload of `_decorateSharedObject` overriding the matching
/// `open class func` on the `SharedObject` base so core can dispatch through the concrete type's
/// metatype. The `prototype:` overload binds the type's instance `@JS func`/`var` members onto the class
/// prototype (the original hook, unchanged); the `constructor:` overload binds the `static`/`class` ones
/// onto the constructor function itself (a new, additive overload, so introducing it isn't a breaking
/// core change). Both are *static* (a shared object has no singleton `self`). An instance binding
/// recovers its typed receiver from the JS `this` per call (`SharedObject.native(from:as:)`); a static
/// binding calls the Swift member on the type and ignores `this` (which, on the static side, is the
/// constructor). The constructor *object* the static members decorate is distinct from the `@JS init`,
/// which builds an instance and is emitted separately (see `JSConstructor.buildConstructor`). Each phase
/// is emitted only when the type has a member for it.
internal func buildDecorateSharedObjectPhase(
  phase: Phase,
  functions: [JSFunction],
  properties: [JSProperty],
  typeName: String
) -> DeclSyntax {
  let receiver: Receiver =
    phase == .constructor
    ? .staticMember(typeName: typeName)
    : .sharedObject(typeName: typeName)
  let body = decorateBody(
    functions: functions,
    properties: properties,
    object: phase.rawValue,
    receiver: receiver
  )
  return """
    @JavaScriptActor
    public override class func _decorateSharedObject(\(raw: phase.rawValue): borrowing JavaScriptObject, in runtime: JavaScriptRuntime) throws {
    \(raw: body)
    }
    """
}

/// True when a return clause is absent or written as `Void` / `()` — i.e. the function returns
/// nothing JS-visible, so the binding closure returns `Void`.
private func isVoidType(_ type: TypeSyntax?) -> Bool {
  guard let type else {
    return true
  }
  let text = type.trimmedDescription
  return text == "Void" || text == "()"
}
