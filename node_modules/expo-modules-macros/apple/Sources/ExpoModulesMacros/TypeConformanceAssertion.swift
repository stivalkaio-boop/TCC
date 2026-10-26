import SwiftSyntax
import SwiftSyntaxBuilder

/// The protocol that every type crossing the JS boundary must conform to. Centralized here so the
/// eventual rename (this is a placeholder name) is a single edit, and shared by the macros whose
/// generated conversions go through the dynamic-type API (`@Record`, `@Event`).
internal let jsConvertibleProtocolName = "AnyArgument"

/// The constraint a `@JS` boundary type must satisfy, by direction: an argument (and a settable
/// property's incoming value) is decoded, so it must be `JavaScriptDecodable`; a return value (and a
/// property's outgoing value) is encoded, so it must be `JavaScriptEncodable`. Asserting each
/// direction on its own keeps a decode-only or encode-only type from being over-constrained, and
/// surfaces a missing conformance as a clear "requires that '…' conform to …" diagnostic on the
/// member instead of an opaque error inside the generated closure.
internal let javaScriptDecodableProtocolName = "JavaScriptDecodable"
internal let javaScriptEncodableProtocolName = "JavaScriptEncodable"

/// The constraint a `@Record` property type must satisfy: it must be both `AnyArgument` (the
/// `from(dictionary:)` / `toDictionary(appContext:)` paths still convert native `Any` through the
/// dynamic-type API) and `JavaScriptDecodable & JavaScriptEncodable` (the `from(object:)` /
/// `toObject(appContext:)` paths convert JS values through `decode`/`encode`). A record field has to
/// support both directions, so the assertion requires the intersection.
///
/// The exception is a property whose type mentions `Any` (`[String: Any]?`, `[Any]`, …): it can't
/// conform to the JS codable protocols, so the JS-value paths convert it through the `JavaScriptValue`
/// free-form methods, and it's asserted against `jsConvertibleProtocolName` alone for the dictionary
/// paths.
internal let recordFieldProtocolName = "AnyArgument & JavaScriptDecodable & JavaScriptEncodable"

/// The constraint a `@Union` case payload type must satisfy: the union decodes by trying each payload's
/// `decode` and encodes through the matching payload's `encode`, so every alternative must convert in
/// both directions. Unlike a `@Record` field, a union never crosses the native-`Any` dictionary path, so
/// `AnyArgument` is not required.
internal let unionPayloadProtocolName = "JavaScriptDecodable & JavaScriptEncodable"

/// The protocol a type must conform to for `self.emit(event:…)` to resolve; core conforms
/// `BaseModule` and `SharedObject` to it. Asserted by `@Event` so attaching it to a type that can't
/// emit fails with a conformance diagnostic instead of an opaque "no member 'emit'" error.
internal let eventEmitterProtocolName = "EventEmitter"

/// Types we never assert because they're statically known to conform: the JS primitives. Asserting
/// them would only add noise to the expansion. `isKnownConforming` extends this to the containers built
/// from them.
private let knownConformingPrimitives: Set<String> = ["Bool", "Int", "Double", "String"]

/// One member's worth of conformance assertion: a name (the member it stands for) and the declared
/// types crossing the JS boundary for it. The name surfaces verbatim in the compiler's conformance
/// diagnostic ("local function '<name>' requires that '<Type>' conform to …"), so it identifies the
/// offending member in the error message on top of the location pointing at the user's declaration.
internal struct ConformanceAssertion {
  let name: String
  /// Declared types as written. Composed types (`[Int]`, `String?`, …) are kept verbatim — their
  /// conditional conformances transitively constrain the elements.
  let types: [String]
  /// The constraint for this member's types, overriding the one passed to `typeConformanceAssertions`.
  /// `@Record` uses it to assert only `AnyArgument` for a property that mentions `Any`, which can't be
  /// `JavaScriptDecodable & JavaScriptEncodable`.
  var constraint: String? = nil
}

/// A directional conformance-assertion peer for a `@JS` member: a never-called `private func` whose
/// body asserts each argument type is `JavaScriptDecodable` and the return/getter type is
/// `JavaScriptEncodable`, matching how the generated binding converts each (decode on the way in,
/// encode on the way out). The check is a single member-named nested helper with one `A0…` generic
/// parameter per asserted argument and a single `Return` parameter for the value, called once with
/// every type's metatype; naming the helper after the member puts the member in the compiler's
/// diagnostic, and the per-slot constraint reports the offending type against the protocol for *its*
/// direction.
///
/// `decodableTypes` are the argument types (and a settable property's value type); `encodableType` is
/// the single return type (or a property's value type on read), or `nil` when there's none.
/// `callbackArgumentTypes` are the parameter types of closure arguments, which are encoded when native
/// code calls the closure. Types known to conform are dropped from each; when nothing is left in any of
/// them, returns `nil` so the caller emits no peer. `isStatic` mirrors a `static`/`class` member so the
/// peer sits in the right metatype context.
internal func directionalConformanceAssertion(
  name: String,
  decodableTypes: [String],
  encodableType: String?,
  callbackArgumentTypes: [String] = [],
  isStatic: Bool
) -> DeclSyntax? {
  let decodables = distinctAssertableTypes(decodableTypes, constraint: javaScriptDecodableProtocolName)
  let callbackArguments = distinctAssertableTypes(callbackArgumentTypes, constraint: javaScriptEncodableProtocolName)
  let encodable = encodableType.flatMap { assertableBoundaryType($0, constraint: javaScriptEncodableProtocolName) }
  guard !decodables.isEmpty || !callbackArguments.isEmpty || encodable != nil else {
    return nil
  }

  // Build the generic parameter list and the matching call arguments in lockstep: one `A0…` slot
  // constrained `JavaScriptDecodable` per argument, one `E0…` slot constrained `JavaScriptEncodable`
  // per closure-argument parameter, and a single `Return` slot constrained `JavaScriptEncodable` for
  // the return/getter value (there's only ever one, so it isn't indexed). Every slot suppresses
  // `Copyable`, so a non-copyable boundary type such as `JavaScriptValue` can fill it.
  var parameters: [String] = []
  var typeParameters: [String] = []
  var arguments: [String] = []
  for (index, type) in decodables.enumerated() {
    parameters.append("A\(index): \(javaScriptDecodableProtocolName) & ~Copyable")
    typeParameters.append("_: A\(index).Type")
    arguments.append("\(type).self")
  }
  for (index, type) in callbackArguments.enumerated() {
    parameters.append("E\(index): \(javaScriptEncodableProtocolName) & ~Copyable")
    typeParameters.append("_: E\(index).Type")
    arguments.append("\(type).self")
  }
  if let encodable {
    parameters.append("Return: \(javaScriptEncodableProtocolName) & ~Copyable")
    typeParameters.append("_: Return.Type")
    arguments.append("\(encodable).self")
  }

  let helper = "func \(name)<\(parameters.joined(separator: ", "))>(\(typeParameters.joined(separator: ", "))) {}"
  let call = "\(name)(\(arguments.joined(separator: ", ")))"
  let staticKeyword = isStatic ? "static " : ""
  let peerName = derivedIdentifier(from: name, prefix: "_assertTypesConformance_")
  return """
    private \(raw: staticKeyword)func \(raw: peerName)() {
    \(raw: helper)
    \(raw: call)
    }
    """
}

/// One conformance-assertion peer covering several members' assertions at once — used by `@Record`,
/// which folds every property into a single `_assertTypesConformance()` rather than emitting a peer
/// per property. Each assertion keeps its own named nested helper, so the per-member naming in the
/// diagnostic is preserved even though they share one peer.
///
/// Returns `nil` when no assertion has anything left to verify (all known to conform / empty), so the
/// caller emits nothing.
internal func typeConformanceAssertions(
  for assertions: [ConformanceAssertion],
  constraint: String = jsConvertibleProtocolName
) -> DeclSyntax? {
  let bodies = assertions.compactMap { conformanceAssertionBody($0, constraint: $0.constraint ?? constraint) }
  guard !bodies.isEmpty else {
    return nil
  }
  return """
    private func _assertTypesConformance() {
    \(raw: bodies.joined(separator: "\n"))
    }
    """
}

/// The type to assert against `constraint` for a boundary type as written, or `nil` when nothing needs
/// asserting: an exactly-free-form type (converted through the `JavaScriptValue` free-form methods) and
/// a type known to conform (see `isKnownConforming`) both return `nil`; everything else is unwrapped of
/// trailing optionals and asserted. Shared with `@Event`, where an *optional* free-form type
/// (`[String: Any]?`) is kept and asserted for a clean diagnostic. `@JS` leaves out every type that
/// mentions `Any` before it gets here.
internal func assertableBoundaryType(_ type: String, constraint: String) -> String? {
  guard !isFreeFormBoundaryType(type) else {
    return nil
  }
  guard !isKnownConforming(TypeSyntax(stringLiteral: type), setsConform: setsConform(to: constraint)) else {
    return nil
  }
  return unwrappedOptional(type)
}

/// True when `type` is known to conform without an assertion: a JS primitive, or an optional, array,
/// `String`-keyed dictionary or set of such a type, at any depth (`[[Int]]`, `[String: [Double]]?`,
/// `Set<String>`). Each of these containers conforms whenever its element does. A set counts only when
/// `setsConform` is true. Anything else, such as a dictionary with another key type, returns `false`.
private func isKnownConforming(_ type: TypeSyntax, setsConform: Bool) -> Bool {
  if let identifier = type.as(IdentifierTypeSyntax.self), identifier.genericArgumentClause == nil {
    return knownConformingPrimitives.contains(identifier.name.text)
  }
  if let element = optionalWrappedType(type) ?? arrayElementType(type) ?? stringKeyedDictionaryValueType(type) {
    return isKnownConforming(element, setsConform: setsConform)
  }
  if setsConform, let element = setElementType(type) {
    return isKnownConforming(element, setsConform: setsConform)
  }
  return false
}

/// True when `Set` conforms to `constraint`. Core conforms it to the JS codable protocols but not to
/// `AnyArgument`.
private func setsConform(to constraint: String) -> Bool {
  return !constraint.split(separator: "&").contains { protocolName in
    protocolName.filter { !$0.isWhitespace } == jsConvertibleProtocolName
  }
}

/// The assertion's body fragment: a nested generic helper named after the member, plus one call per
/// distinct type that needs an assertion. Nesting the helper keeps the constraint entirely local — no
/// shared symbol, nothing to collide, nothing left in the type's namespace — and naming it after the
/// member puts the member's name in the compiler's conformance diagnostic. Returns `nil` when every
/// type was known to conform or the list was empty.
private func conformanceAssertionBody(
  _ assertion: ConformanceAssertion,
  constraint: String = jsConvertibleProtocolName
) -> String? {
  let distinct = distinctAssertableTypes(assertion.types, constraint: constraint)
  guard !distinct.isEmpty else {
    return nil
  }

  var lines = ["func \(assertion.name)<T: \(constraint)>(_: T.Type) {}"]
  lines.append(contentsOf: distinct.map { "\(assertion.name)(\($0).self)" })
  return lines.joined(separator: "\n")
}

/// The distinct types to assert against `constraint` from a list, mapping each through
/// `assertableBoundaryType` (which drops what needs no assertion) and deduping in first-seen order.
private func distinctAssertableTypes(_ types: [String], constraint: String) -> [String] {
  var seen: Set<String> = []
  var distinct: [String] = []
  let assertable = types.compactMap { assertableBoundaryType($0, constraint: constraint) }
  for type in assertable where seen.insert(type).inserted {
    distinct.append(type)
  }
  return distinct
}

/// Strips every trailing optional marker (`?`/`!`) so the assertion targets the core wrapped type.
/// `Optional<W>: AnyArgument` holds exactly when `W: AnyArgument` (and `T!` is just `T?`), so each
/// layer is conformance-equivalent to its wrapped type. Asserting the core gives a cleaner diagnostic
/// (the direct `requires that '<type>' conform`, not the conditional-conformance phrasing through
/// `Optional`) and sidesteps that `T!.self` is invalid in metatype position. Only *trailing* markers
/// are stripped, so `[Int?]` keeps its inner `?`; a longhand `Optional<W>` isn't peeled but is still
/// asserted whole, which remains correct.
private func unwrappedOptional(_ type: String) -> String {
  var result = Substring(type)
  while result.hasSuffix("?") || result.hasSuffix("!") {
    result = result.dropLast()
  }
  return String(result)
}
