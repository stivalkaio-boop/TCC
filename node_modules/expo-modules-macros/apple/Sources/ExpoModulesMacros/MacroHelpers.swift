import SwiftSyntax

/// Reads the first string-literal argument of an attribute, e.g. `@JS("doWork")` -> "doWork".
/// Returns nil if the attribute has no arguments or the first argument is not a string literal.
internal func jsNameArgument(of attribute: AttributeSyntax) -> String? {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self),
    let first = args.first,
    let str = first.expression.as(StringLiteralExprSyntax.self),
    let segment = str.segments.first?.as(StringSegmentSyntax.self)
  else {
    return nil
  }
  return segment.content.text
}

/// Reads a labeled boolean-literal argument of an attribute, e.g. `@Event(sync: true)` -> true.
/// Returns nil if the attribute has no argument with that label or its value isn't a boolean literal.
internal func boolArgument(of attribute: AttributeSyntax, label: String) -> Bool? {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self) else {
    return nil
  }
  for arg in args where arg.label?.text == label {
    guard let literal = arg.expression.as(BooleanLiteralExprSyntax.self) else {
      return nil
    }
    return literal.literal.tokenKind == .keyword(.true)
  }
  return nil
}

/// True if the attribute lists the given `JSOptions` member, e.g. `@JS(.concurrent)` or
/// `@JS("name", [.concurrent])` -> true for "concurrent". Options are written as member-access
/// expressions (`.concurrent`), optionally inside an array literal when more than one is combined, so
/// both spellings are scanned. The leading string literal, when present, is the JS name and is skipped.
internal func hasJSOption(_ attribute: AttributeSyntax, named option: String) -> Bool {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self) else {
    return false
  }
  for arg in args {
    if namesOption(arg.expression, option) {
      return true
    }
    if let array = arg.expression.as(ArrayExprSyntax.self),
      array.elements.contains(where: { namesOption($0.expression, option) })
    {
      return true
    }
  }
  return false
}

/// True when the expression is the member access `.<option>` (or `JSOptions.<option>`).
private func namesOption(_ expression: ExprSyntax, _ option: String) -> Bool {
  guard let member = expression.as(MemberAccessExprSyntax.self) else {
    return false
  }
  return member.declName.baseName.text == option
}

/// True if the `@JS`-marked declaration opted into running off the JavaScript thread with
/// `@JS(.concurrent)`. Such a member is left unstamped and gets `@concurrent` instead, so its body
/// runs on the concurrent pool rather than inheriting the JS thread.
internal func isConcurrentJSMember(_ decl: DeclSyntaxProtocol) -> Bool {
  guard let attribute = memberAttributes(of: decl).firstAttribute(named: "JS") else {
    return false
  }
  return hasJSOption(attribute, named: "concurrent")
}

/// The `.withAsync("name")` option of a `@JS` attribute, e.g. `@JS(.withAsync("loadAsync"))` or
/// `@JS("load", [.withAsync("loadAsync")])`, or `nil` when the attribute doesn't list it. When the
/// option is listed more than once, the first one counts and `@JS` reports the others.
internal func asyncVariantOption(of attribute: AttributeSyntax) -> FunctionCallExprSyntax? {
  return asyncVariantOptions(of: attribute).first
}

/// Every `.withAsync(...)` option of a `@JS` attribute, in source order. Like `hasJSOption`, it scans
/// the arguments and the elements of an array literal.
internal func asyncVariantOptions(of attribute: AttributeSyntax) -> [FunctionCallExprSyntax] {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self) else {
    return []
  }
  return args.flatMap { arg -> [FunctionCallExprSyntax] in
    if let array = arg.expression.as(ArrayExprSyntax.self) {
      return array.elements.compactMap { asyncOptionCall($0.expression) }
    }
    return asyncOptionCall(arg.expression).map { [$0] } ?? []
  }
}

/// The expression as a `.withAsync(...)` call (or `JSOptions.withAsync(...)`), or `nil` for anything
/// else.
private func asyncOptionCall(_ expression: ExprSyntax) -> FunctionCallExprSyntax? {
  guard let call = expression.as(FunctionCallExprSyntax.self),
    let member = call.calledExpression.as(MemberAccessExprSyntax.self),
    member.declName.baseName.text == "withAsync"
  else {
    return nil
  }
  return call
}

/// The JavaScript name a `.withAsync("name")` option gives the promise-returning variant, with the
/// token of its string literal, where a name collision is reported. `nil` when the argument isn't a
/// single plain string literal, which `@JS` reports.
internal func asyncVariantName(of option: FunctionCallExprSyntax) -> (name: String, token: TokenSyntax)? {
  guard option.arguments.count == 1,
    let argument = option.arguments.first,
    argument.label == nil,
    let literal = argument.expression.as(StringLiteralExprSyntax.self),
    literal.segments.count == 1,
    let segment = literal.segments.first?.as(StringSegmentSyntax.self)
  else {
    return nil
  }
  return (segment.content.text, segment.content)
}

/// True if the `@JS`-marked declaration lists `.withAsync("name")`. Such a function is left
/// unstamped, because its promise-returning variant calls it on the concurrent pool.
internal func hasAsyncVariant(_ decl: DeclSyntaxProtocol) -> Bool {
  guard let attribute = memberAttributes(of: decl).firstAttribute(named: "JS") else {
    return false
  }
  return asyncVariantOption(of: attribute) != nil
}

/// True if the type is written as an optional: `T?`, `T!`, or the explicit `Optional<T>`. Used to
/// decide argument requiredness (an optional parameter may be omitted) and record-field nullability.
internal func isOptionalType(_ type: TypeSyntax) -> Bool {
  if let attributed = type.as(AttributedTypeSyntax.self) {
    return isOptionalType(attributed.baseType)
  }
  if type.is(OptionalTypeSyntax.self) || type.is(ImplicitlyUnwrappedOptionalTypeSyntax.self) {
    return true
  }
  if let identifier = type.as(IdentifierTypeSyntax.self), identifier.name.text == "Optional" {
    return true
  }
  return false
}

/// A parameter's type split from the specifiers written in front of it (`borrowing`, `consuming`,
/// `sending`, `inout`, `isolated`, ...). The specifiers aren't part of the type: the decode call and
/// the conformance assertion need the bare type (`borrowing Point.decode(...)` isn't valid Swift), and
/// a decoded argument is a fresh owned value, so it can be passed under any ownership convention.
internal struct SpecifiedType {
  /// The type without its specifiers.
  let type: TypeSyntax
  /// The specifiers written before the type, in source order.
  let specifiers: [String]

  init(_ type: TypeSyntax) {
    if let attributed = type.as(AttributedTypeSyntax.self), !attributed.specifiers.isEmpty {
      self.specifiers = attributed.specifiers.map(\.trimmedDescription)
      self.type =
        attributed.attributes.isEmpty
        ? attributed.baseType : TypeSyntax(attributed.with(\.specifiers, []))
    } else {
      self.specifiers = []
      self.type = type
    }
  }

  /// The first specifier a decoded argument can't honor: `inout` (JavaScript can't observe a write
  /// back) or `isolated` (the argument doesn't carry an isolation).
  var unsupportedSpecifier: String? {
    return specifiers.first { !ownershipSpecifiers.contains($0) }
  }
}

/// The ownership specifiers a parameter may carry. They only change how the argument is passed, which
/// a fresh decoded value satisfies either way.
internal let ownershipSpecifiers: Set<String> = ["borrowing", "consuming", "sending", "__shared", "__owned"]

/// The type wrapped by one optional layer (`T?`, `T!` or `Optional<T>`), or `nil` when the type isn't
/// optional.
internal func optionalWrappedType(_ type: TypeSyntax) -> TypeSyntax? {
  if let optional = type.as(OptionalTypeSyntax.self) {
    return optional.wrappedType
  }
  if let implicitlyUnwrapped = type.as(ImplicitlyUnwrappedOptionalTypeSyntax.self) {
    return implicitlyUnwrapped.wrappedType
  }
  if let identifier = type.as(IdentifierTypeSyntax.self),
    identifier.name.text == "Optional",
    let argument = identifier.genericArgumentClause?.arguments.first,
    case .type(let wrapped) = argument.argument
  {
    return wrapped
  }
  return nil
}

/// The element type of `[T]` or `Array<T>`, or `nil` for any other type.
internal func arrayElementType(_ type: TypeSyntax) -> TypeSyntax? {
  if let array = type.as(ArrayTypeSyntax.self) {
    return array.element
  }
  guard let arguments = genericArguments(of: type, named: "Array"), arguments.count == 1 else {
    return nil
  }
  return arguments[0]
}

/// The value type of `[String: V]` or `Dictionary<String, V>`, or `nil` for any other type, including a
/// dictionary with a different key type.
internal func stringKeyedDictionaryValueType(_ type: TypeSyntax) -> TypeSyntax? {
  if let dictionary = type.as(DictionaryTypeSyntax.self) {
    return isStringType(dictionary.key) ? dictionary.value : nil
  }
  guard let arguments = genericArguments(of: type, named: "Dictionary"), arguments.count == 2 else {
    return nil
  }
  return isStringType(arguments[0]) ? arguments[1] : nil
}

/// The element type of `Set<T>`, or `nil` for any other type.
internal func setElementType(_ type: TypeSyntax) -> TypeSyntax? {
  guard let arguments = genericArguments(of: type, named: "Set"), arguments.count == 1 else {
    return nil
  }
  return arguments[0]
}

/// The type arguments of a generic type spelled `<name><…>` (or `Swift.<name><…>`), or `nil` when the
/// type has another name or no type arguments.
private func genericArguments(of type: TypeSyntax, named name: String) -> [TypeSyntax]? {
  let clause: GenericArgumentClauseSyntax?
  if let identifier = type.as(IdentifierTypeSyntax.self), identifier.name.text == name {
    clause = identifier.genericArgumentClause
  } else if let member = type.as(MemberTypeSyntax.self),
    member.name.text == name,
    member.baseType.as(IdentifierTypeSyntax.self)?.name.text == "Swift"
  {
    clause = member.genericArgumentClause
  } else {
    return nil
  }
  guard let clause else {
    return nil
  }
  var types: [TypeSyntax] = []
  for argument in clause.arguments {
    guard case .type(let type) = argument.argument else {
      return nil
    }
    types.append(type)
  }
  return types
}

/// True when the type is `String` or `Swift.String`.
private func isStringType(_ type: TypeSyntax) -> Bool {
  if let identifier = type.as(IdentifierTypeSyntax.self) {
    return identifier.name.text == "String" && identifier.genericArgumentClause == nil
  }
  if let member = type.as(MemberTypeSyntax.self), member.name.text == "String" {
    return member.baseType.as(IdentifierTypeSyntax.self)?.name.text == "Swift"
  }
  return false
}

/// True when the modifiers make the member type-level (`static` or `class`). A shared object routes
/// such members to its constructor (JS-static) and instance members to its prototype; the `@JS`
/// conformance assertion also uses this to emit its peer in the matching metatype context.
internal func isTypeLevel(_ modifiers: DeclModifierListSyntax) -> Bool {
  return modifiers.contains {
    $0.name.tokenKind == .keyword(.static) || $0.name.tokenKind == .keyword(.class)
  }
}

/// True if a trailing occurrence of this parameter may be omitted by the JS caller: it either has a
/// default value (Swift applies it) or is an optional type (an absent slot becomes `nil`). The arity
/// range and the per-arity call branches are derived from this.
internal func isOmittable(_ parameter: FunctionParameterSyntax) -> Bool {
  return hasDefaultValue(parameter) || isOptionalType(parameter.type)
}

/// True if the parameter declares a default value (`b: Int = 5`). An omitted defaulted slot is left
/// out of the call so Swift fills in the default, distinguishing it from an omitted optional slot
/// (passed `nil`).
internal func hasDefaultValue(_ parameter: FunctionParameterSyntax) -> Bool {
  return parameter.defaultValue != nil
}

/// True if the declaration is a `@Event(sync: true)` property. A sync event dispatches inline on the
/// JS thread instead of scheduling, so `@ExpoModule`/`@SharedObject` stamp it with `@JavaScriptActor`,
/// making "must be called on the JS thread" a compile-time guarantee at the call site. Async events
/// (the default) are deliberately not stamped: their `emit` schedules onto the JS thread itself, so
/// they stay callable from any thread.
internal func isSyncEventMember(_ decl: DeclSyntaxProtocol) -> Bool {
  guard let varDecl = decl.as(VariableDeclSyntax.self),
    let attribute = varDecl.attributes.firstAttribute(named: "Event")
  else {
    return false
  }
  return boolArgument(of: attribute, label: "sync") == true
}

/// Reads a labeled array-literal argument of an attribute, e.g. `@ExpoModule(classes: [Foo.self, Bar.self])`,
/// and returns the type names referenced (e.g. `["Foo", "Bar"]`). Each element must be a
/// `<TypeName>.self` member-access expression; non-conforming elements are skipped silently.
internal func classListArgument(of attribute: AttributeSyntax, label: String) -> [String] {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self) else {
    return []
  }
  for arg in args where arg.label?.text == label {
    guard let array = arg.expression.as(ArrayExprSyntax.self) else {
      return []
    }
    return array.elements.compactMap { element -> String? in
      guard let memberAccess = element.expression.as(MemberAccessExprSyntax.self),
        memberAccess.declName.baseName.text == "self",
        let base = memberAccess.base
      else {
        return nil
      }
      // A bare `CardView.self` has a `DeclReferenceExprSyntax` base; a qualified
      // `Outer.CardView.self` has a `MemberAccessExprSyntax` one. Both name a type the generated
      // code can spell, so take the base verbatim rather than only its last component: dropping the
      // qualified form would silently omit the entry, and the type would never be registered.
      if base.is(DeclReferenceExprSyntax.self) || base.is(MemberAccessExprSyntax.self) {
        return base.trimmedDescription
      }
      return nil
    }
  }
  return []
}

/// Returns true if the class's inheritance clause names any of the given identifiers.
/// Matches by base identifier only, so `Module`, `ExpoModulesCore.Module`, and
/// `Module<Foo>` all match an entry of "Module".
internal func inheritsFromAny(_ classDecl: ClassDeclSyntax, names: Set<String>) -> Bool {
  guard let inherited = classDecl.inheritanceClause?.inheritedTypes else {
    return false
  }
  for entry in inherited {
    if let name = baseIdentifier(of: entry.type), names.contains(name) {
      return true
    }
  }
  return false
}

/// Returns the rightmost identifier of a type, e.g. `Foo` for `Foo`, `Foo` for
/// `Module.Foo`, and nil for composed or generic shapes the macro doesn't need to handle.
internal func baseIdentifier(of type: TypeSyntax) -> String? {
  if let identifier = type.as(IdentifierTypeSyntax.self) {
    return identifier.name.text
  }
  if let member = type.as(MemberTypeSyntax.self) {
    return member.name.text
  }
  return nil
}

/// True if the declaration carries a `@JS` attribute. Works for functions, properties, and inits;
/// returns false for any other decl kind.
internal func memberHasJSAttribute(_ decl: DeclSyntaxProtocol) -> Bool {
  if let funcDecl = decl.as(FunctionDeclSyntax.self) {
    return funcDecl.attributes.firstAttribute(named: "JS") != nil
  }
  if let varDecl = decl.as(VariableDeclSyntax.self) {
    return varDecl.attributes.firstAttribute(named: "JS") != nil
  }
  if let initDecl = decl.as(InitializerDeclSyntax.self) {
    return initDecl.attributes.firstAttribute(named: "JS") != nil
  }
  return false
}

/// Decides whether the macro should stamp `@JavaScriptActor` on a `@JS`-marked member.
/// The macro defers to the user when they've already chosen an isolation:
/// - the member opted out with `@JS(.concurrent)`
/// - the member lists `@JS(.withAsync("name"))`, whose variant runs it on the concurrent pool
/// - the `nonisolated` modifier is present on the member
/// - any attribute whose name matches a known global actor (`@MainActor`, `@JavaScriptActor`)
///   or follows the `*Actor` naming convention is present on the member or its enclosing type
/// `async` members are stamped too: an `async` function starts its execution on the JS thread and
/// stays there until the first suspension point, where it may hop to another executor.
internal func shouldStampJavaScriptActor(
  on member: DeclSyntaxProtocol,
  enclosedBy enclosing: some DeclGroupSyntax
) -> Bool {
  if isConcurrentJSMember(member) || hasAsyncVariant(member) {
    return false
  }

  let modifiers = memberModifiers(of: member)
  if modifiers.contains(where: { $0.name.text == "nonisolated" }) {
    return false
  }

  let memberAttributes = memberAttributes(of: member)
  if memberAttributes.contains(where: hasGlobalActorShape) {
    return false
  }

  if enclosing.attributes.contains(where: hasGlobalActorShape) {
    return false
  }

  return true
}

private func memberModifiers(of decl: DeclSyntaxProtocol) -> DeclModifierListSyntax {
  if let funcDecl = decl.as(FunctionDeclSyntax.self) {
    return funcDecl.modifiers
  }
  if let varDecl = decl.as(VariableDeclSyntax.self) {
    return varDecl.modifiers
  }
  if let initDecl = decl.as(InitializerDeclSyntax.self) {
    return initDecl.modifiers
  }
  return DeclModifierListSyntax()
}

internal func memberAttributes(of decl: DeclSyntaxProtocol) -> AttributeListSyntax {
  if let funcDecl = decl.as(FunctionDeclSyntax.self) {
    return funcDecl.attributes
  }
  if let varDecl = decl.as(VariableDeclSyntax.self) {
    return varDecl.attributes
  }
  if let initDecl = decl.as(InitializerDeclSyntax.self) {
    return initDecl.attributes
  }
  return AttributeListSyntax()
}

internal func hasGlobalActorShape(_ element: AttributeListSyntax.Element) -> Bool {
  guard let attribute = element.as(AttributeSyntax.self) else {
    return false
  }
  let name = attribute.attributeName.trimmedDescription
  return name.hasSuffix("Actor")
}

/// The Swift default type of a literal expression — `String`, `Double`, `Int`, or `Bool` — or `nil`
/// when the expression isn't one of those literals. Used to recover a property's type when it has no
/// annotation but does have a literal default (`var name = "foo"` → `String`). This matches the type
/// Swift itself would infer for the same un-annotated declaration; expressions whose type a syntactic
/// macro can't know (function calls, collection literals, member access) return `nil`.
internal func inferredLiteralType(of expression: ExprSyntax) -> String? {
  if expression.is(StringLiteralExprSyntax.self) {
    return "String"
  }
  if expression.is(FloatLiteralExprSyntax.self) {
    return "Double"
  }
  if expression.is(IntegerLiteralExprSyntax.self) {
    return "Int"
  }
  if expression.is(BooleanLiteralExprSyntax.self) {
    return "Bool"
  }
  return nil
}

extension AttributeListSyntax {
  internal func firstAttribute(named name: String) -> AttributeSyntax? {
    for element in self {
      if let attr = element.as(AttributeSyntax.self),
        attr.attributeName.trimmedDescription == name
      {
        return attr
      }
    }
    return nil
  }
}

/// A type spelled so it's valid in expression position (before `.decode`/`.encode`, before
/// `.getDynamicType()`, or after `as!`). Implicitly-unwrapped optionals (`T!`) are only allowed in
/// type-annotation position, so a trailing `!` is rewritten to `?` (`T!` and `T?` are both
/// `Optional<T>`, which the conversion layer treats identically). Other type spellings pass through
/// unchanged.
internal func expressionType(_ type: String) -> String {
  guard type.hasSuffix("!") else {
    return type
  }
  return type.dropLast() + "?"
}

/// The decode expression for a boundary type read from `valueExpression` (a `JavaScriptUnownedValue`),
/// as it appears after `try`. A type that mentions `Any` can't conform to `JavaScriptDecodable`, so it
/// decodes through the `JavaScriptValue` free-form methods its `freeForm` conversion names; every other
/// type decodes through its own static `decode`, spelled in expression position (`T!` rewritten to
/// `T?`).
internal func decodeCall(_ type: String, freeForm: FreeFormConversion?, from valueExpression: String) -> String {
  if let freeForm {
    return freeForm.decodeExpression(of: valueExpression, as: expressionType(type))
  }
  return "\(expressionType(type)).decode(\(valueExpression), in: runtime)"
}

/// The encode expression for the native value `valueExpression` of a boundary type, as it appears
/// after `try`. The counterpart of `decodeCall`: a type that mentions `Any` encodes through the
/// `JavaScriptValue` free-form methods, and every other type through its own static `encode`.
internal func encodeCall(_ type: String, freeForm: FreeFormConversion?, of valueExpression: String) -> String {
  if let freeForm {
    return freeForm.encodeExpression(of: valueExpression)
  }
  return "\(expressionType(type)).encode(\(valueExpression), in: runtime)"
}

// MARK: - Escaped names

/// `name` without the backticks that escape it: `` `default` `` becomes `default`. Swift needs the
/// backticks in every identifier position, but a name JavaScript sees (a JS member name, an event
/// name, a record key) is the bare name.
internal func withoutBackticks(_ name: String) -> String {
  var name = Substring(name)
  while name.first == "`" {
    name.removeFirst()
  }
  while name.last == "`" {
    name.removeLast()
  }
  return String(name)
}

/// A generated identifier built from a member's name, such as `countDescriptor` from `count`. The
/// affixes join the bare name, and an escaped name keeps the backticks around the whole result
/// (`` `class` `` gives `` `classDescriptor` ``), since the bare name may not be an identifier on
/// its own.
internal func derivedIdentifier(from name: String, prefix: String = "", suffix: String = "") -> String {
  let bareName = withoutBackticks(name)
  let identifier = prefix + bareName + suffix
  return bareName == name ? identifier : "`\(identifier)`"
}

// MARK: - @JS property collection

/// Collects the `@JS var` bindings of a declaration into `JSProperty` values for direct JSI binding.
/// Shared between `@ExpoModule` and `@SharedObject` — the resulting properties are receiver-agnostic;
/// the decorator that emits them picks the receiver (module `self` vs. shared-object `_self`).
internal func collectProperties(
  varDecl: VariableDeclSyntax,
  attribute: AttributeSyntax
) -> [JSProperty] {
  let jsNameOverride = jsNameArgument(of: attribute)
  // A `let` is never settable; only `var` bindings can carry a setter.
  let isVar = varDecl.bindingSpecifier.tokenKind == .keyword(.var)

  return varDecl.bindings.compactMap { binding in
    guard let ident = binding.pattern.as(IdentifierPatternSyntax.self) else {
      return nil
    }
    let swiftName = ident.identifier.text
    // Prefer the explicit annotation; recover the type from a literal default (`var x = false`)
    // when there's none. `nil` falls back to inference at the use site.
    let valueType =
      binding.typeAnnotation?.type.trimmedDescription
      ?? binding.initializer.flatMap { inferredLiteralType(of: $0.value) }
    return JSProperty(
      swiftName: swiftName,
      jsName: jsNameOverride ?? withoutBackticks(swiftName),
      valueType: valueType,
      // A literal-inferred type never mentions `Any`, so only an explicit annotation can be free-form.
      freeForm: binding.typeAnnotation.flatMap { freeFormConversion(of: $0.type) },
      isSettable: isVar && bindingIsSettable(binding),
      nameToken: ident.identifier
    )
  }
}

/// Whether a `var` binding is settable from JS. A stored property (no accessor block) is settable;
/// a computed property is settable only when it declares an explicit `set` accessor. A getter-only
/// computed property (`{ get }` or a single getter body) stays read-only. `willSet`/`didSet`
/// observers imply stored storage, which is also settable.
internal func bindingIsSettable(_ binding: PatternBindingSyntax) -> Bool {
  guard let accessorBlock = binding.accessorBlock else {
    return true
  }
  switch accessorBlock.accessors {
  case .accessors(let accessors):
    return accessors.contains { accessor in
      switch accessor.accessorSpecifier.tokenKind {
      case .keyword(.set), .keyword(.willSet), .keyword(.didSet):
        return true
      default:
        return false
      }
    }
  case .getter:
    return false
  }
}

/// True if the variable declaration carries a modifier that excludes it from being a stored property
/// of the surface: `static`, `class` (type-level storage), `private`, `fileprivate`, or `lazy`.
/// Shared by `@Record` and `@ViewProps`, which apply the same "every stored property counts" rule.
internal func isExcludedByModifier(_ modifiers: DeclModifierListSyntax) -> Bool {
  for modifier in modifiers {
    switch modifier.name.tokenKind {
    case .keyword(.static), .keyword(.class), .keyword(.private), .keyword(.fileprivate), .keyword(.lazy):
      return true
    default:
      continue
    }
  }
  return false
}

/// True if the type's inheritance clause already lists a protocol with the given name. Matches
/// either the bare identifier (`Record`) or a qualified member access ending in the name
/// (`ExpoModulesCore.Record`). Used by the extension macros to skip a conformance the author already
/// spelled out. Works for `struct`, `class`, and `enum` declarations; any other declaration kind has no
/// inheritance clause to read and reports `false`.
internal func inheritsProtocol(named name: String, in declaration: some DeclGroupSyntax) -> Bool {
  let inheritanceClause: InheritanceClauseSyntax?
  if let structDecl = declaration.as(StructDeclSyntax.self) {
    inheritanceClause = structDecl.inheritanceClause
  } else if let classDecl = declaration.as(ClassDeclSyntax.self) {
    inheritanceClause = classDecl.inheritanceClause
  } else if let enumDecl = declaration.as(EnumDeclSyntax.self) {
    inheritanceClause = enumDecl.inheritanceClause
  } else {
    return false
  }
  guard let inherited = inheritanceClause?.inheritedTypes else {
    return false
  }
  return inherited.contains { baseIdentifier(of: $0.type) == name }
}
