import SwiftSyntax

/// Recognition of the free-form (`Any`-bearing) boundary types and the conversions the macros emit for
/// them. None of these types can conform to the JS codable protocols (`Any` can't conform to a
/// protocol, and the container conditional conformances require the element/value to conform), so
/// they can't cross the boundary through the usual `T.decode` / `T.encode` path. They convert through
/// the `JavaScriptValue` free-form methods instead: the three free-form shapes (`Any`, `[Any]` and
/// `[String: Any]`), optionally wrapped in one optional, use the dedicated `decodeAny…` and
/// `encodeAny…` methods, and every other type built from `Any`, arrays, `String`-keyed dictionaries and
/// optionals uses the generic `decodeAny(_:as:in:)` and `encodeAny(_:in:)`.
///
/// Shared across the macro pipeline: `@Record` properties and `@JS` arguments, return values and
/// properties convert through `FreeFormConversion` (the `@JS` bindings by way of
/// `MacroHelpers.decodeCall` and `encodeCall`), `TypeConformanceAssertion` skips the free-form shapes,
/// and `JSMacro` uses them for its diagnostics.

/// The free-form boundary types: an untyped value (`Any`), an untyped array (`[Any]`), and an untyped
/// string-keyed dictionary (`[String: Any]`). Matched by whitespace-normalized spelling so
/// `[String: Any]` and `[String : Any]` both count.
private let freeFormBoundaryTypes: Set<String> = ["Any", "[Any]", "[String:Any]"]

/// True when a boundary type (as written) is exactly one of the free-form shapes, ignoring internal
/// whitespace so `[String: Any]` and `[String :Any]` both match. An optional or nested free-form type
/// doesn't match; `freeFormConversion(of:)` recognizes those.
internal func isFreeFormBoundaryType(_ type: String) -> Bool {
  return freeFormBoundaryTypes.contains(normalizedTypeSpelling(type))
}

/// A type spelling with all whitespace removed, so spelling variations of the same type
/// (`[String: Any]` vs `[String :Any]`) compare equal.
private func normalizedTypeSpelling(_ type: String) -> String {
  return type.filter { !$0.isWhitespace }
}

/// How a type that mentions `Any` converts on the JS-value paths. Such a type can't conform to the JS
/// codable protocols, so it converts through the `JavaScriptValue` free-form methods.
internal enum FreeFormConversion {
  /// `Any`, `[Any]` or `[String: Any]`, wrapped in at most one optional: the dedicated methods for
  /// that shape, named by `decodeMethod` and `encodeMethod`. The optional is handled around them.
  case shape(decodeMethod: String, encodeMethod: String, isOptional: Bool, isBareAny: Bool)
  /// Any other type that mentions `Any`: the generic `decodeAny(_:as:in:)` and `encodeAny(_:in:)`.
  case generic

  /// Classifies a type that mentions `Any`; the caller checks `isConvertibleFreeFormType` first.
  init(type: TypeSyntax) {
    let wrapped = optionalWrappedType(type)
    switch freeFormShape(of: wrapped ?? type) {
    case .any:
      self = .shape(
        decodeMethod: "decodeAny",
        encodeMethod: "encodeAny",
        isOptional: wrapped != nil,
        isBareAny: true
      )
    case .array:
      self = .shape(
        decodeMethod: "decodeAnyArray",
        encodeMethod: "encodeAnyArray",
        isOptional: wrapped != nil,
        isBareAny: false
      )
    case .dictionary:
      self = .shape(
        decodeMethod: "decodeAnyDictionary",
        encodeMethod: "encodeAnyDictionary",
        isOptional: wrapped != nil,
        isBareAny: false
      )
    case nil:
      self = .generic
    }
  }

  /// True for `Any` itself, optional or not.
  var isBareAny: Bool {
    guard case .shape(_, _, _, let isBareAny) = self else {
      return false
    }
    return isBareAny
  }

  /// The decode expression, as it appears after `try`, for a `@JS` value read from `valueExpression`
  /// (a `JavaScriptUnownedValue`) into `type` (spelled in expression position). For an optional
  /// free-form shape, `undefined` and `null` map to `nil` around the dedicated method, just like
  /// `Optional.decode`. The generic method takes an owning value, so the borrowed one is copied first.
  func decodeExpression(of valueExpression: String, as type: String) -> String {
    switch self {
    case .shape(let decodeMethod, _, let isOptional, _):
      let call = "JavaScriptValue.\(decodeMethod)(\(valueExpression), in: runtime)"
      return isOptional ? "\(valueExpression).isUndefined() || \(valueExpression).isNull() ? nil : \(call)" : call
    case .generic:
      return "JavaScriptValue.decodeAny(\(valueExpression).copied(in: runtime), as: \(type).self, in: runtime)"
    }
  }

  /// The encode expression, as it appears after `try`, for the `@JS` value `valueExpression`. An
  /// optional free-form shape encodes through the generic `encodeAny(_:in:)`, which encodes `nil` as
  /// `null` and unwraps any other value, so the expression (which may call a computed getter) is
  /// evaluated only once.
  func encodeExpression(of valueExpression: String) -> String {
    switch self {
    case .shape(_, let encodeMethod, false, _):
      return "JavaScriptValue.\(encodeMethod)(\(valueExpression), in: runtime)"
    case .shape(_, _, true, _), .generic:
      // The explicit `as Any` keeps an optional value from warning about its implicit coercion.
      return "JavaScriptValue.encodeAny(\(valueExpression) as Any, in: runtime)"
    }
  }
}

/// The conversion for a boundary type that mentions `Any`, or `nil` when the type doesn't mention
/// `Any`, or holds it in a shape the free-form methods can't convert (see `isConvertibleFreeFormType`),
/// which the caller diagnoses.
internal func freeFormConversion(of type: TypeSyntax) -> FreeFormConversion? {
  guard mentionsFreeFormAny(type), isConvertibleFreeFormType(type) else {
    return nil
  }
  return FreeFormConversion(type: type)
}

/// True when a type mentions `Any` anywhere in its spelling, at any nesting depth: `Any`, `[Any]?`,
/// `[String: Any]`, `Dictionary<String, [Any]>`, `[Int: Any]`, and so on. Such a type can't conform to
/// the JS codable protocols.
internal func mentionsFreeFormAny(_ type: TypeSyntax) -> Bool {
  let finder = AnyTypeFinder(viewMode: .sourceAccurate)
  finder.walk(type)
  return finder.found
}

/// True when a type mentioning `Any` is built only from `Any`, arrays, `String`-keyed dictionaries and
/// optionals, in any nesting (`[String: [Any]]?`, `[[String: Any]]`, …). Those are the only shapes the
/// free-form conversions produce and accept, so any other type holding `Any` (`[Int: Any]`,
/// `Set<[String: Any]>`, a user generic `Box<Any>`) could never convert.
internal func isConvertibleFreeFormType(_ type: TypeSyntax) -> Bool {
  if isAnyType(type) {
    return true
  }
  if let wrapped = optionalWrappedType(type) {
    return isConvertibleFreeFormType(wrapped)
  }
  if let element = arrayElementType(type) {
    return isConvertibleFreeFormType(element)
  }
  if let value = stringKeyedDictionaryValueType(type) {
    return isConvertibleFreeFormType(value)
  }
  return false
}

/// The three free-form shapes that have dedicated conversions.
internal enum FreeFormShape {
  case any
  case array
  case dictionary
}

/// The free-form shape a type has exactly (`Any`, `[Any]` or `[String: Any]`, in any spelling), or
/// `nil` for every other type, including nested and optional ones.
internal func freeFormShape(of type: TypeSyntax) -> FreeFormShape? {
  if isAnyType(type) {
    return .any
  }
  if let element = arrayElementType(type), isAnyType(element) {
    return .array
  }
  if let value = stringKeyedDictionaryValueType(type), isAnyType(value) {
    return .dictionary
  }
  return nil
}

/// True when the type is `Any` itself, spelled `Any` or `Swift.Any` (not `AnyObject`, `AnyHashable` or
/// a generic).
internal func isAnyType(_ type: some SyntaxProtocol) -> Bool {
  if let identifier = type.as(IdentifierTypeSyntax.self) {
    return identifier.name.text == "Any" && identifier.genericArgumentClause == nil
  }
  if let member = type.as(MemberTypeSyntax.self),
    member.name.text == "Any",
    member.genericArgumentClause == nil,
    let base = member.baseType.as(IdentifierTypeSyntax.self)
  {
    return base.name.text == "Swift"
  }
  return false
}

/// Walks a type looking for `Any` (or `Swift.Any`) anywhere inside it.
private final class AnyTypeFinder: SyntaxVisitor {
  var found = false

  override func visit(_ node: IdentifierTypeSyntax) -> SyntaxVisitorContinueKind {
    if isAnyType(node) {
      found = true
      return .skipChildren
    }
    return .visitChildren
  }

  override func visit(_ node: MemberTypeSyntax) -> SyntaxVisitorContinueKind {
    if isAnyType(node) {
      found = true
      return .skipChildren
    }
    return .visitChildren
  }
}
