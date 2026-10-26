import SwiftDiagnostics
import SwiftSyntax
import SwiftSyntaxBuilder
import SwiftSyntaxMacros

/// Member macro applied to a record type. Treats **every stored property** that is not
/// `static`, `private`, `fileprivate`, `lazy` or computed as a property — no `@Field` wrapper
/// needed — and synthesizes the conversion surface from the property's static type:
///
/// - an explicit memberwise `init` (so the static factories have a single construction point),
/// - `decode(_:in:)` and `encode(_:in:)` — the fast paths, reading each property straight off a JS
///   object and writing it straight into one,
/// - `from(object:appContext:)` and `toObject(appContext:)`, which forward to `decode` and `encode`,
/// - `from(dictionary:appContext:)` and `toDictionary(appContext:)` — converting each property from and
///   to a `[String: Any]` dictionary.
///
/// The type is auto-conformed to `Record` (a core protocol whose requirements are this surface); the
/// synthesized methods override `Record`'s reflection-based defaults, and the synthesized `decode` and
/// `encode` replace its default `JavaScriptCodable` witnesses. Author-facing shape — no conformance to
/// spell out:
///
///     @Record
///     struct Options {
///       var name: String          // required (non-optional, no default)
///       var count: Int = 0        // optional (has default)
///       var note: String?         // nullable + optional
///     }
///
/// The JS key is always the property name. Requiredness is inferred from the declaration:
/// a default value makes a property optional (the default applies when the source omits it),
/// an optional type makes it nullable and optional, and a non-optional property without a
/// default is required (the factories throw when the source omits it).
///
/// `decode(_:in:)` and `encode(_:in:)` name each property with a `JavaScriptPropNameID` that each runtime
/// creates once. The names are held by the nested `_PropNames` class, which each runtime caches under one
/// key. A record that is generic or nested in a generic type uses string names, since a generic type can't
/// have static stored properties. The macro can't tell that an extension extends a generic type, so a
/// record declared in one doesn't compile.
///
/// The JS-value paths convert through `JavaScriptDecodable.decode` / `JavaScriptEncodable.encode`
/// (`decode(_:in:)` / `encode(_:in:)`); the native-`Any` dictionary paths still go through the
/// public dynamic-type API — `T.getDynamicType()` plus `cast(_:appContext:)` / `convertToJS(_:appContext:)`
/// (`from(dictionary:)` / `toDictionary(appContext:)`), since `JavaScriptCodable` only converts JS
/// values, not native `Any`. Both spell types as `public` symbols so the synthesized code compiles inside
/// user modules without any internal core symbols. Every property type must therefore conform to both
/// `AnyArgument` and `JavaScriptDecodable & JavaScriptEncodable`.
///
/// A property whose type mentions `Any` (`Any?`, `[String: Any]?`, `[String: [Any]]`, …) can't conform to
/// the JS codable protocols. On the JS-value paths it converts through the `JavaScriptValue` free-form
/// methods instead: `decodeAny`/`decodeAnyArray`/`decodeAnyDictionary` and the matching `encodeAny…`
/// for `Any`, `[Any]` and `[String: Any]` (optional or not), and the generic `decodeAny(_:as:in:)` /
/// `encodeAny(_:in:)` for any other type. Such a property only needs `AnyArgument` for the dictionary
/// paths, and a bare `Any` needs nothing, since the dictionary paths pass it through unchanged.
///
/// A record class must be `final` and have no inheritance clause. The synthesized factories construct
/// `Self` through the memberwise init, which only a final class can do without a `required` init, and
/// the macro can't tell a superclass from a protocol in the clause, so protocol conformances go in an
/// extension.
public struct RecordMacro: MemberMacro, ExtensionMacro {
  public static func expansion(
    of node: AttributeSyntax,
    providingMembersOf declaration: some DeclGroupSyntax,
    conformingTo protocols: [TypeSyntax],
    in context: some MacroExpansionContext
  ) throws -> [DeclSyntax] {
    let typeName: String
    if let structDecl = declaration.as(StructDeclSyntax.self) {
      typeName = structDecl.name.text
    } else if let classDecl = declaration.as(ClassDeclSyntax.self) {
      typeName = classDecl.name.text
    } else {
      throw MacroExpansionErrorMessage("@Record can only be applied to a struct or class")
    }
    let classDiagnostics = unsupportedClassDiagnostics(of: declaration)
    guard classDiagnostics.isEmpty else {
      throw DiagnosticsError(diagnostics: classDiagnostics)
    }

    let properties = try recordProperties(of: declaration)
    let cachesPropNames = !properties.isEmpty && !isInGenericContext(declaration, context: context)

    // The user may hand-write any of the initializers the macro would otherwise synthesize. Emitting
    // a duplicate is a hard "invalid redeclaration" error, so skip anything already declared and let
    // the author's version stand — the factories only need *an* `init(<properties>)` and `Record` only
    // needs *an* `init()`, regardless of who wrote them.
    let existingInitLabels = initializerParameterLabels(of: declaration)

    var members: [DeclSyntax] = []

    // A single never-called member that makes the compiler verify each property type is convertible
    // both ways (the JS-value paths call `decode`/`encode`; the native-`Any` dictionary paths call
    // the dynamic-type API). Each property keeps its own named assertion inside, so the compiler's
    // conformance diagnostic names the offending property (see `typeConformanceAssertions`). Emitted
    // first so that, for a non-conforming type, this clear "requires that '…' conform to '…'" error
    // is reported ahead of the noisier "no member 'decode'"/"getDynamicType" errors from the
    // conversion code below.
    let assertions = properties.map { property in
      // A bare `Any` can't conform to anything and needs no conformance, since every path converts it
      // without one.
      ConformanceAssertion(
        name: property.name,
        types: property.freeForm?.isBareAny == true ? [] : [property.type],
        constraint: property.freeForm != nil ? jsConvertibleProtocolName : nil
      )
    }
    if let assertionMember = typeConformanceAssertions(for: assertions, constraint: recordFieldProtocolName) {
      members.append(assertionMember)
    }

    if !existingInitLabels.contains([]) {
      if let defaultInit = defaultInit(properties: properties) {
        members.append(defaultInit)
      }
    }
    if !existingInitLabels.contains(properties.map { $0.key }) {
      members.append(memberwiseInit(properties: properties))
    }
    members.append(fromJSObjectFactory())
    members.append(fromDictionaryFactory(properties: properties))
    members.append(toDictionaryMethod(properties: properties))
    members.append(toObjectMethod())
    if cachesPropNames {
      members.append(propNamesClass(properties: properties))
    }
    members.append(
      contentsOf: javaScriptCodableWitnesses(
        properties: properties,
        typeName: typeName,
        cachesPropNames: cachesPropNames
      )
    )
    return members
  }

  /// Auto-conforms the type to `Record` — the protocol whose requirements are exactly the members
  /// synthesized above (`init()`, the two `from(_:)` factories, and the `toDictionary`/`toObject`
  /// write side), which the synthesized methods satisfy by overriding `Record`'s reflection-based
  /// defaults.
  ///
  /// The conformance is skipped when the type already declares it, and for a class the member role
  /// rejects, which would otherwise get conformance errors for the members it didn't synthesize.
  public static func expansion(
    of node: AttributeSyntax,
    attachedTo declaration: some DeclGroupSyntax,
    providingExtensionsOf type: some TypeSyntaxProtocol,
    conformingTo protocols: [TypeSyntax],
    in context: some MacroExpansionContext
  ) throws -> [ExtensionDeclSyntax] {
    guard declaration.is(StructDeclSyntax.self) || declaration.is(ClassDeclSyntax.self) else {
      return []
    }
    guard unsupportedClassDiagnostics(of: declaration).isEmpty else {
      return []
    }
    if inheritsProtocol(named: "Record", in: declaration) {
      return []
    }

    let ext: DeclSyntax = """
      extension \(type.trimmed): Record {}
      """
    guard let extDecl = ext.as(ExtensionDeclSyntax.self) else {
      return []
    }
    return [extDecl]
  }
}

// MARK: - Property model

/// A single record property discovered on the type, paired with everything the synthesized
/// conversions need: its property name, its written type, and how the source may omit it.
private struct RecordProperty {
  /// The property name as written, backticks included for an escaped name (`` `default` ``), since
  /// every identifier position in the generated code needs them.
  let name: String
  /// The property's declared type, verbatim (e.g. `String`, `Int`, `String?`). Used to build the
  /// memberwise-init parameter and as the receiver of the per-property `decode`/`encode` (and, on the
  /// dictionary paths, `getDynamicType()`) conversions.
  let type: String
  /// The default-value expression verbatim (`0`, `""`, `[]`), or `nil` when the property has none.
  /// Inlined into the memberwise init and the factories' omitted-property branch so the synthesized
  /// code never needs a throwaway `Self()` to recover defaults.
  let defaultValue: String?
  /// True when the property's type is optional (`T?` / `T!` / `Optional<T>`).
  let isOptional: Bool
  /// How the property converts when its type mentions `Any`, or `nil` for every other type.
  let freeForm: FreeFormConversion?

  /// True when the property declares a default value (`var x: T = …`).
  var hasDefault: Bool {
    return defaultValue != nil
  }

  /// Required properties must be present in the source; omission throws.
  var isRequired: Bool {
    return !hasDefault && !isOptional
  }

  /// The key the property reads from and writes to, in both the JS object and the dictionary: the
  /// name without escaping backticks.
  var key: String {
    return withoutBackticks(name)
  }
}

/// Discovers the record's properties: every stored `var`/`let` binding that is not `static`,
/// `private`, `fileprivate`, `lazy`, or computed. Each property must declare an explicit type
/// annotation, since the synthesized conversions name the type (e.g. `Type.decode(…)`).
private func recordProperties(
  of declaration: some DeclGroupSyntax
) throws -> [RecordProperty] {
  var properties: [RecordProperty] = []

  for member in declaration.memberBlock.members {
    guard let varDecl = member.decl.as(VariableDeclSyntax.self) else {
      continue
    }
    if isExcludedByModifier(varDecl.modifiers) {
      continue
    }
    // `@Field` is the v1 property wrapper and has no meaning here — every stored property is a
    // record property now. Left in place it would wrap the value in `Field<T>` (backing storage
    // `_name`), so the synthesized conversions would be generated against the wrong type. Flag it
    // explicitly rather than emit broken code.
    if varDecl.attributes.firstAttribute(named: "Field") != nil {
      throw MacroExpansionErrorMessage(
        "@Field is no longer used — @Record treats every stored property as a record property. Remove the @Field attribute"
      )
    }
    for binding in varDecl.bindings {
      // Computed properties (and `{ get set }`) carry an accessor block — never properties.
      if binding.accessorBlock != nil {
        continue
      }
      guard let ident = binding.pattern.as(IdentifierPatternSyntax.self) else {
        continue
      }
      // Prefer the explicit annotation. When it's omitted, recover the type from a literal default
      // (Swift's own default-literal type) — covers the common `var name = "foo"` case. Anything
      // whose type a syntactic macro can't determine (calls, collections, member access) still needs
      // an annotation.
      let inferredType =
        binding.typeAnnotation?.type.trimmedDescription
        ?? binding.initializer.flatMap { inferredLiteralType(of: $0.value) }
      guard let type = inferredType else {
        throw MacroExpansionErrorMessage(
          "@Record properties must declare an explicit type — '\(ident.identifier.text)' has none"
        )
      }
      // A literal-inferred type never mentions `Any` or a closure, so only an explicit annotation can.
      let annotatedType = binding.typeAnnotation?.type
      // A closure has no `decode`, `encode` or dynamic type, and the record converts every property both
      // ways. A JavaScript function decodes into a native closure only as a `@JS` argument; a native
      // closure can't be encoded.
      if let functionType = annotatedType.flatMap(firstFunctionType(in:)) {
        throw DiagnosticsError(diagnostics: [
          Diagnostic(
            node: functionType,
            message: RecordDiagnosticMessage(
              "@Record property '\(ident.identifier.text)' can't hold a closure: a record property is also encoded to JavaScript, and a native closure can't be encoded",
              id: "record-closure-property"
            )
          )
        ])
      }
      let freeForm = try annotatedType.flatMap { annotatedType -> FreeFormConversion? in
        guard mentionsFreeFormAny(annotatedType) else {
          return nil
        }
        guard isConvertibleFreeFormType(annotatedType) else {
          throw MacroExpansionErrorMessage(
            "@Record property '\(ident.identifier.text)' can't be typed '\(type)', because a type holding Any converts to and from JavaScript only when it's built from Any, arrays, String-keyed dictionaries and optionals. Use one of those shapes, such as [String: Any], or JavaScriptValue to keep the JavaScript value unconverted"
          )
        }
        return FreeFormConversion(type: annotatedType)
      }
      properties.append(
        RecordProperty(
          name: ident.identifier.text,
          type: type,
          defaultValue: binding.initializer?.value.trimmedDescription,
          isOptional: annotatedType.map(isOptionalType) ?? false,
          freeForm: freeForm
        )
      )
    }
  }
  return properties
}

// MARK: - Synthesized members

/// The parameterless `init()` required by the `Record` protocol. Nothing in the synthesized code uses
/// it — the factories construct through the memberwise init with defaults inlined — so it's purely a
/// conformance witness. Swift only synthesizes an implicit `init()` for a type that declares no other
/// initializer, but the macro always emits a memberwise `init(…)`, which suppresses it, so the macro
/// must supply `init()` itself.
///
/// When no property is required, the body is empty: every stored property initializes from its own
/// declaration. When a property *is* required there's no value to give it, so the body traps — this `init()`
/// is never reached (the `from(…)` factories don't call it), it exists only to satisfy the requirement.
///
/// Not emitted when there are no properties at all — there the memberwise init already *is* `init()`.
private func defaultInit(properties: [RecordProperty]) -> DeclSyntax? {
  if properties.isEmpty {
    return nil
  }
  if properties.contains(where: { $0.isRequired }) {
    return """
      public init() {
      fatalError("\\(Self.self) has required properties and cannot be created with init(); construct it through the @Record-synthesized from(dictionary:) or from(object:) factories")
      }
      """
  }
  return """
    public init() {
    }
    """
}

/**
 Explicit memberwise initializer over the discovered properties, in declaration order. The factories
 call this as the single construction point. Optional properties default to `nil` for ergonomics; all
 other parameters are required at this level (the factories supply a value for every property, inlining
 each declared default where the source omits it).
 */

private func memberwiseInit(properties: [RecordProperty]) -> DeclSyntax {
  let params = properties.map { property -> String in
    if property.isOptional {
      return "\(property.name): \(property.type) = nil"
    }
    return "\(property.name): \(property.type)"
  }
  let assignments = properties.map { "  self.\($0.name) = \($0.name)" }.joined(separator: "\n")
  let signature = params.joined(separator: ", ")

  return """
    public init(\(raw: signature)) {
    \(raw: assignments)
    }
    """
}

/// `from(object:appContext:)`, which forwards to the record's own unowned `decode(_:in:)` witness (see
/// `javaScriptCodableWitnesses`), where the property reads are.
private func fromJSObjectFactory() -> DeclSyntax {
  // The record declares only the unowned `decode`, so the call lends the value unowned. With an owning
  // value it would reach an owning `decode` default, and `Record`'s converts through this factory.
  return """
    @JavaScriptActor
    public static func from(object: borrowing JavaScriptObject, appContext: AppContext) throws -> Self {
      let runtime = try appContext.runtime
      return try object.asValue().withUnownedValue(in: runtime) { unownedValue in
        return try decode(unownedValue, in: runtime)
      }
    }
    """
}

/// `from(dictionary:appContext:)` — same as the JS path but reads from `[String: Any]` and
/// uses the `Any?` cast overload; a missing key is `dictionary[key] == nil`.
private func fromDictionaryFactory(properties: [RecordProperty]) -> DeclSyntax {
  let body = factoryBody(properties: properties, readLines: dictionaryReadLines(properties: properties))
  return """
    public static func from(dictionary: [String: Any], appContext: AppContext) throws -> Self {
    \(raw: body)
    }
    """
}

/// Builds a factory body: per-property reads into locals, then a single call to the synthesized
/// memberwise init. Each property's declared default expression is captured at parse time and inlined
/// directly into the omitted-property branch (see the read-line builders), so the factory needs neither
/// a throwaway `Self()` nor the record's `init()`.
private func factoryBody(properties: [RecordProperty], readLines: [String]) -> String {
  var lines: [String] = []
  lines.append(contentsOf: readLines)
  let initArgs = properties.enumerated().map { "\($1.name): \(fieldLocal($0))" }.joined(separator: ", ")
  lines.append("  return Self(\(initArgs))")
  return lines.joined(separator: "\n")
}

/// The local that holds the value of the property at `index` in a factory. It's numbered rather than
/// named after the property, so no property can collide with it or with the factory's other parameters
/// and locals (`object`, `runtime`, `dictionary`, `appContext`).
private func fieldLocal(_ index: Int) -> String {
  return "field\(index)"
}

/// Per-property read statements, each producing a `let field<index>` from the property of the JS object
/// named `object`. The property is lent to a closure as a `JavaScriptUnownedValue` and decoded there the
/// same way as a `@JS` argument (see `decodeCall`), so the read doesn't allocate a `JavaScriptValue`.
/// Only the generic free-form decode copies the value into one.
private func jsObjectReadLines(properties: [RecordProperty], cachesPropNames: Bool) -> [String] {
  var lines: [String] = []
  for (index, property) in properties.enumerated() {
    let valueVar = derivedIdentifier(from: property.name, suffix: "JSValue")
    let decode = "try \(decodeCall(property.type, freeForm: property.freeForm, from: valueVar))"
    let propName = propNameArgument(for: property, at: index, cached: cachesPropNames)
    lines.append("  let \(fieldLocal(index)) = try object.withUnownedProperty(\(propName)) { \(valueVar) in")
    if property.isRequired {
      lines.append("    guard !\(valueVar).isUndefined() else {")
      lines.append("      throw RecordPropertyRequiredException(\"\(property.key)\")")
      lines.append("    }")
      lines.append("    return \(decode)")
    } else if property.isOptional {
      // `Optional.decode` (and the free-form decodes of optional shapes) already map `undefined` and
      // `null` to `nil`, so the read is a plain decode.
      lines.append("    return \(decode)")
    } else {
      lines.append("    return \(valueVar).isUndefined() ? \(property.defaultValue!) : \(decode)")
    }
    lines.append("  }")
  }
  return lines
}

/// Per-property read statements for the dictionary factory, each producing a `let field<index>` from the
/// raw dictionary value in `entry<index>`. A bare `Any` property has no dynamic type to cast through, and
/// the dictionary value already is an `Any`, so it's read unchanged.
private func dictionaryReadLines(properties: [RecordProperty]) -> [String] {
  var lines: [String] = []
  for (index, property) in properties.enumerated() {
    let field = fieldLocal(index)
    let entry = "entry\(index)"
    let exprType = expressionType(property.type)
    let isBareAny = property.freeForm?.isBareAny == true
    let cast =
      isBareAny
      ? entry
      : "try \(exprType).getDynamicType().cast(\(entry), appContext: appContext) as! \(exprType)"
    lines.append("  let \(entry) = dictionary[\"\(property.key)\"]")
    if property.isRequired {
      lines.append("  guard let \(entry) else {")
      lines.append("    throw RecordPropertyRequiredException(\"\(property.key)\")")
      lines.append("  }")
      lines.append("  let \(field) = \(cast)")
    } else if property.isOptional {
      lines.append("  let \(field): \(property.type) = (\(entry) == nil || \(entry)! is NSNull) ? nil : \(cast)")
    } else {
      lines.append("  let \(field) = \(entry) == nil ? \(property.defaultValue!) : \(isBareAny ? entry + "!" : cast)")
    }
  }
  return lines
}

/// `toDictionary(appContext:)` — converts each property back to a JS-compatible value via the
/// dynamic type and assembles a `[String: Any]`.
private func toDictionaryMethod(properties: [RecordProperty]) -> DeclSyntax {
  var lines = ["  var dictionary: [String: Any] = [:]"]
  for property in properties {
    lines.append("  dictionary[\"\(property.key)\"] = self.\(property.name)")
  }
  lines.append("  return dictionary")
  return """
    public func toDictionary(appContext: AppContext? = nil) -> [String: Any] {
    \(raw: lines.joined(separator: "\n"))
    }
    """
}

/// `toObject(appContext:)`, which forwards to the record's own `encode(_:in:)` witness (see
/// `javaScriptCodableWitnesses`), where the property writes are.
private func toObjectMethod() -> DeclSyntax {
  return """
    @JavaScriptActor
    public func toObject(appContext: AppContext) throws -> JavaScriptObject {
      return try Self.encode(self, in: appContext.runtime).asObject()
    }
    """
}

/// The record's own `JavaScriptDecodable` and `JavaScriptEncodable` witnesses, which convert in the
/// runtime they're given. Without them the record would convert through `Record`'s default witnesses,
/// which recover the app context from the runtime and convert in the app context's runtime.
///
/// `decode` reads each property off the JS object into a local, then constructs the record through the
/// memberwise init. Required properties throw when undefined; defaulted properties fall back to the
/// property's declared default (inlined) when undefined; optional properties become `nil` when
/// undefined/null. It's the unowned overload: an owning value decodes through `JavaScriptDecodable`'s
/// default, which forwards to it. `encode` builds the JS object, writing each property. Its parameter
/// names the type, because a class can't take `Self` as a parameter type.
private func javaScriptCodableWitnesses(
  properties: [RecordProperty],
  typeName: String,
  cachesPropNames: Bool
) -> [DeclSyntax] {
  // An empty record still decodes only from an object, but has no property to read off it.
  let objectLine =
    properties.isEmpty
    ? "  _ = try value.asObject(in: runtime)"
    : "  let object = try value.asObject(in: runtime)"
  let lookupLines = cachesPropNames ? propNamesLookupLines() : []
  let readLines = lookupLines + jsObjectReadLines(properties: properties, cachesPropNames: cachesPropNames)
  let decodeBody = objectLine + "\n" + factoryBody(properties: properties, readLines: readLines)
  let encodeLines =
    ["  let object = runtime.createObject()"]
    + lookupLines
    + objectWriteLines(properties: properties, of: "value", cachesPropNames: cachesPropNames)
    + ["  return object.asValue()"]
  return [
    """
    @JavaScriptActor
    public static func decode(_ value: borrowing JavaScriptUnownedValue, in runtime: borrowing JavaScriptRuntime) throws -> Self {
    \(raw: decodeBody)
    }
    """,
    """
    @JavaScriptActor
    public static func encode(_ value: \(raw: typeName), in runtime: borrowing JavaScriptRuntime) throws -> JavaScriptValue {
    \(raw: encodeLines.joined(separator: "\n"))
    }
    """,
  ]
}

/// The statements that write each property of `record` (`self` or the `encode` parameter) into the
/// `object` local, encoding it with `JavaScriptEncodable.encode` or, for a free-form property, the
/// matching `JavaScriptValue` free-form method.
private func objectWriteLines(properties: [RecordProperty], of record: String, cachesPropNames: Bool) -> [String] {
  return properties.enumerated().map { index, property in
    let value = "\(record).\(property.name)"
    let encode: String
    switch property.freeForm {
    case .shape(_, let encodeMethod, let isOptional, _):
      encode =
        isOptional
        ? "\(value) == nil ? .null() : try JavaScriptValue.\(encodeMethod)(\(value)!, in: runtime)"
        : "try JavaScriptValue.\(encodeMethod)(\(value), in: runtime)"
    case .generic:
      // The explicit `as Any` keeps an optional property from warning about its implicit coercion.
      encode = "try JavaScriptValue.encodeAny(\(value) as Any, in: runtime)"
    case nil:
      encode = "try \(expressionType(property.type)).encode(\(value), in: runtime)"
    }
    let propName = propNameArgument(for: property, at: index, cached: cachesPropNames)
    return "  object.setProperty(\(propName), value: \(encode))"
  }
}

/// The name of the nested class that holds the property names (see `propNamesClass`).
private let propNamesTypeName = "_PropNames"

/// A nested class that holds the `JavaScriptPropNameID` of each property, `_name<index>` for the property
/// at `index`, and the runtime cache key for its instances. Each runtime creates one instance, so the
/// whole record takes one cache key.
private func propNamesClass(properties: [RecordProperty]) -> DeclSyntax {
  let storedProperties = properties.indices.map { index in
    "  let \(propNameMember(index)): JavaScriptPropNameID"
  }
  let assignments = properties.enumerated().map { index, property in
    "    self.\(propNameMember(index)) = JavaScriptPropNameID(runtime, string: \"\(property.key)\")"
  }
  return """
    private final class \(raw: propNamesTypeName) {
      static let _key = JavaScriptRuntime.Cache.Key<\(raw: propNamesTypeName)>()

    \(raw: storedProperties.joined(separator: "\n"))

      init(_ runtime: borrowing JavaScriptRuntime) {
    \(raw: assignments.joined(separator: "\n"))
      }
    }
    """
}

private func propNameMember(_ index: Int) -> String {
  return "_name\(index)"
}

/// The statements that get the record's property names from the runtime cache into `_propNames`, at the
/// start of `decode` and `encode`.
private func propNamesLookupLines() -> [String] {
  return [
    "  let _propNames = runtime.cached(\(propNamesTypeName)._key) {",
    "    return \(propNamesTypeName)(runtime)",
    "  }",
  ]
}

/// The first argument of the `withUnownedProperty` and `setProperty` calls for the property at `index`:
/// its name from `_propNames`, or the key as a string literal when the record can't hold the cache key.
private func propNameArgument(for property: RecordProperty, at index: Int, cached: Bool) -> String {
  return cached ? "_propNames.\(propNameMember(index))" : "\"\(property.key)\""
}

/// True when the record or a type that encloses it is generic. Swift doesn't support static stored
/// properties in generic types, so the record can't hold the cache key.
private func isInGenericContext(_ declaration: some DeclGroupSyntax, context: some MacroExpansionContext) -> Bool {
  // The lexical context of a member macro usually starts with the type it's attached to, but the
  // declaration is checked on its own too.
  return ([Syntax(declaration)] + context.lexicalContext).contains { node in
    return node.asProtocol(WithGenericParametersSyntax.self)?.genericParameterClause != nil
  }
}

// MARK: - Helpers

/// The parameter-label list of every initializer the type already declares, used to avoid emitting a
/// duplicate of one the author hand-wrote. Each entry is the ordered external argument labels of one
/// `init` — e.g. `init(name: String, count: Int)` → `["name", "count"]`, and `init()` → `[]`. A
/// parameter written with `_` or with no external label contributes its internal name's absence as an
/// empty-string label, which simply won't match the macro's always-labeled signatures (a safe miss).
private func initializerParameterLabels(of declaration: some DeclGroupSyntax) -> [[String]] {
  var signatures: [[String]] = []
  for member in declaration.memberBlock.members {
    guard let initDecl = member.decl.as(InitializerDeclSyntax.self) else {
      continue
    }
    let labels = initDecl.signature.parameterClause.parameters.map { parameter in
      // `firstName` is the external label (or `_`); fall back to the internal name when omitted.
      let label = withoutBackticks(parameter.firstName.text)
      return label == "_" ? "" : label
    }
    signatures.append(labels)
  }
  return signatures
}

/// The errors for a class the macro can't synthesize a record for: one that isn't `final`, or one
/// with an inheritance clause. Empty for a struct and for a supported class.
private func unsupportedClassDiagnostics(of declaration: some DeclGroupSyntax) -> [Diagnostic] {
  guard let classDecl = declaration.as(ClassDeclSyntax.self) else {
    return []
  }
  let name = classDecl.name.text
  var diagnostics: [Diagnostic] = []
  if !classDecl.modifiers.contains(where: { $0.name.tokenKind == .keyword(.final) }) {
    // An `open` class can't also be `final`, so changing its access level is left to the author.
    let isOpen = classDecl.modifiers.contains(where: { $0.name.tokenKind == .keyword(.open) })
    diagnostics.append(
      Diagnostic(
        node: classDecl.classKeyword,
        message: RecordDiagnosticMessage(
          "@Record class '\(name)' must be final, because the macro doesn't support subclasses of a record",
          id: "record-class-not-final"
        ),
        fixIts: isOpen ? [] : [markFinalFixIt(for: classDecl)]
      )
    )
  }
  if let inheritanceClause = classDecl.inheritanceClause {
    diagnostics.append(
      Diagnostic(
        node: inheritanceClause,
        message: RecordDiagnosticMessage(
          "@Record class '\(name)' can't have an inheritance clause: a record class can't have a superclass, and the macro can't tell a superclass from a protocol. Declare protocol conformances in an extension",
          id: "record-class-inheritance"
        )
      )
    )
  }
  return diagnostics
}

/// The fix-it for a record class that isn't `final`: add the modifier right before `class`.
private func markFinalFixIt(for classDecl: ClassDeclSyntax) -> FixIt {
  // The new modifier takes over the leading trivia of `class` (the line break after the attribute
  // when no other modifier comes first), so it lands where `class` started.
  let classKeyword = classDecl.classKeyword
  var modifiers = classDecl.modifiers
  modifiers.append(
    DeclModifierSyntax(name: .keyword(.final, leadingTrivia: classKeyword.leadingTrivia, trailingTrivia: .space))
  )
  let newDecl =
    classDecl
    .with(\.modifiers, modifiers)
    .with(\.classKeyword, classKeyword.with(\.leadingTrivia, []))
  return FixIt(
    message: RecordFixItMessage("Mark the class 'final'", id: "record-class-insert-final"),
    changes: [.replace(oldNode: Syntax(classDecl), newNode: Syntax(newDecl))]
  )
}

private struct RecordDiagnosticMessage: DiagnosticMessage {
  let message: String
  let diagnosticID: MessageID
  let severity: DiagnosticSeverity = .error

  init(_ message: String, id: String) {
    self.message = message
    self.diagnosticID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

private struct RecordFixItMessage: FixItMessage {
  let message: String
  let fixItID: MessageID

  init(_ message: String, id: String) {
    self.message = message
    self.fixItID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}
