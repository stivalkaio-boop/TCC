import SwiftSyntax

/// Extracts the full JS-exported surface of every `@ExpoModule`, `@SharedObject`, and `@Record` type:
/// their `@JS` members and record properties. The deep counterpart to `DetectionVisitor`.
/// Recognition is purely syntactic and re-reads what the macros read (the macro target can't be
/// imported), so it stays in step with `JSFunction` / `JSProperty` / `JSConstructor` /
/// `RecordProperty`.
///
/// Types nested in another type's body, or in a file-scope `extension`, are reported under their
/// qualified Swift name (`Options.Encoding`), so a ref to one can be resolved from the scope it is
/// written in. A type declared in a function body or a closure is local and is not reported.
///
/// Each declaration and member reports the platforms that build it (see `PlatformResolver`), and one
/// that no platform builds is not reported. `#if` is read only where the runtime sees what it holds:
/// around types, `@Event` members, and enum cases. `@ExpoModule`, `@SharedObject`, `@Record`, and
/// `@Union` read only the members written directly in the type body, so `@JS` members, record
/// properties, and union cases in a `#if` clause are never bound and are not reported. An `@Event`
/// expands on its own declaration, and the compiler reads enum cases itself.
final class SurfaceVisitor: SyntaxVisitor {
  private let file: String
  private let platformResolver: PlatformResolver
  private(set) var modules: [ExportedModule] = []
  private(set) var sharedObjects: [ExportedSharedObject] = []
  private(set) var records: [ExportedRecord] = []
  private(set) var enums: [ExportedEnum] = []
  private(set) var unions: [ExportedUnion] = []

  init(file: String, tree: SourceFileSyntax) {
    self.file = file
    self.platformResolver = PlatformResolver(tree: tree)
    super.init(viewMode: .sourceAccurate)
  }

  override func visit(_ node: ClassDeclSyntax) -> SyntaxVisitorContinueKind {
    guard let scope = enclosingTypes(of: node) else {
      return .skipChildren
    }
    classify(node, name: node.name.identifierName, scope: scope)
    // The member walk reads the body itself; the children are visited only to find nested types.
    return .visitChildren
  }

  override func visit(_ node: StructDeclSyntax) -> SyntaxVisitorContinueKind {
    guard let scope = enclosingTypes(of: node) else {
      return .skipChildren
    }
    classify(node, name: node.name.identifierName, scope: scope)
    return .visitChildren
  }

  override func visit(_ node: ActorDeclSyntax) -> SyntaxVisitorContinueKind {
    // No macro the surface reports applies to an actor, but its body can declare types that do.
    enclosingTypes(of: node) == nil ? .skipChildren : .visitChildren
  }

  override func visit(_ node: ExtensionDeclSyntax) -> SyntaxVisitorContinueKind {
    // Only for the types declared in its body. Members an extension adds to a module, shared object,
    // or record are not part of the surface, since the macros only read the type's own body.
    enclosingTypes(of: node) == nil ? .skipChildren : .visitChildren
  }

  // A type declared in a function or accessor body or in a closure is local and never reported, so
  // these are not walked.

  override func visit(_ node: CodeBlockSyntax) -> SyntaxVisitorContinueKind {
    .skipChildren
  }

  override func visit(_ node: AccessorBlockSyntax) -> SyntaxVisitorContinueKind {
    .skipChildren
  }

  override func visit(_ node: ClosureExprSyntax) -> SyntaxVisitorContinueKind {
    .skipChildren
  }

  /// The two kinds of enum the surface reports: a `@Union` by its attribute, an `Enumerable` enum by
  /// its conformance (core converts it with no macro involved, so there is no attribute to key on).
  ///
  /// `@Union` wins when a type carries both. Its cases hold payloads rather than raw values, so there
  /// would be nothing to report as an enum, and listing it in both arrays would describe two
  /// contradictory JS types for one declaration.
  override func visit(_ node: EnumDeclSyntax) -> SyntaxVisitorContinueKind {
    guard let scope = enclosingTypes(of: node) else {
      return .skipChildren
    }
    let name = qualifiedName(node.name.identifierName, in: scope)
    let platforms = platformResolver.platforms(of: node)
    // An enum is often a namespace for other types, so its body is searched too, even when this
    // enum is not reported.
    guard !platforms.isEmpty else {
      return .visitChildren
    }

    if node.attributes.firstAttribute(named: DetectedMacro.union.rawValue) != nil {
      unions.append(
        ExportedUnion(
          name: name,
          members: collectUnionMembers(node.memberBlock.members),
          accessLevel: spelledAccessLevel(of: node.modifiers),
          platforms: platforms,
          file: file
        )
      )
    } else if inherits(from: enumerableConformanceName, in: node.inheritanceClause) {
      let rawType = rawValueType(of: node.inheritanceClause)
      enums.append(
        ExportedEnum(
          name: name,
          rawType: rawType,
          cases: collectEnumCases(node.memberBlock.members, rawType: rawType),
          accessLevel: spelledAccessLevel(of: node.modifiers),
          platforms: platforms,
          file: file
        )
      )
    }
    // An enum is often a namespace for other types, so its body is searched too.
    return .visitChildren
  }

  /// Routes a class or struct to the right collector based on which Expo macro it carries. A type
  /// carrying none of them is ignored. `@Record` and `@ExpoModule`/`@SharedObject` are mutually
  /// exclusive in practice, so the first match wins.
  ///
  /// `name` is the declared name and `scope` the names of the types enclosing it. The reported `name`
  /// is qualified with the scope, while a default `jsName` is the declared name alone, as the macros
  /// spell it.
  private func classify(_ node: some DeclGroupSyntax, name: String, scope: [String]) {
    let qualified = qualifiedName(name, in: scope)
    let attributes = node.attributes
    let members = node.memberBlock.members
    let accessLevel = spelledAccessLevel(of: node.modifiers)
    let platforms = platformResolver.platforms(of: node)
    guard !platforms.isEmpty else {
      return
    }

    if let attribute = attributes.firstAttribute(named: DetectedMacro.expoModule.rawValue) {
      // Only a file-scope module is reported. Autolinking registers no other (`DetectionVisitor`
      // reads file scope only), so a nested one never loads.
      guard scope.isEmpty else {
        return
      }
      let (functions, properties, events, _) = collectJSMembers(members)
      modules.append(
        ExportedModule(
          name: qualified,
          jsName: stringArgument(of: attribute) ?? name,
          functions: functions,
          properties: properties,
          events: events,
          // `jsName` is filled in by `ExportedSurface.resolvingRefs()`, since the `@SharedObject` can
          // be declared in another file.
          classes: classListArgument(of: attribute, label: "classes").map {
            ExportedClass(name: $0, jsName: nil)
          },
          accessLevel: accessLevel,
          platforms: platforms,
          file: file
        )
      )
      return
    }

    if let attribute = attributes.firstAttribute(named: DetectedMacro.sharedObject.rawValue) {
      let (functions, properties, events, initializer) = collectJSMembers(members)
      sharedObjects.append(
        ExportedSharedObject(
          name: qualified,
          jsName: stringArgument(of: attribute) ?? name,
          initializer: initializer,
          functions: functions,
          properties: properties,
          events: events,
          accessLevel: accessLevel,
          platforms: platforms,
          file: file
        )
      )
      return
    }

    if attributes.firstAttribute(named: DetectedMacro.record.rawValue) != nil {
      records.append(
        ExportedRecord(
          name: qualified,
          properties: collectRecordProperties(members),
          accessLevel: accessLevel,
          platforms: platforms,
          file: file
        )
      )
    }
  }

  /// The exported members of a module / shared-object body: `@JS` functions and properties, `@Event`
  /// events, and the single `@JS init` (`nil` when absent).
  private func collectJSMembers(
    _ members: MemberBlockItemListSyntax
  ) -> (
    functions: [ExportedFunction], properties: [ExportedProperty], events: [ExportedEvent],
    initializer: ExportedInitializer?
  ) {
    var functions: [ExportedFunction] = []
    var properties: [ExportedProperty] = []
    var events: [ExportedEvent] = []
    var initializer: ExportedInitializer?

    // The macros bind only the `@JS` members written directly in the body.
    let directMembers = Set(members.map(\.id))

    for member in flattened(members) {
      let decl = member.decl
      let platforms = platformResolver.platforms(of: decl)
      guard !platforms.isEmpty else {
        continue
      }

      if let varDecl = decl.as(VariableDeclSyntax.self),
        varDecl.attributes.firstAttribute(named: DetectedMacro.js.rawValue) == nil,
        let attribute = varDecl.attributes.firstAttribute(named: DetectedMacro.event.rawValue)
      {
        events.append(contentsOf: makeEvents(varDecl: varDecl, attribute: attribute, platforms: platforms))
        continue
      }

      guard directMembers.contains(member.id) else {
        continue
      }

      if let initDecl = decl.as(InitializerDeclSyntax.self),
        initDecl.attributes.firstAttribute(named: DetectedMacro.js.rawValue) != nil
      {
        // At most one `@JS init`; keep the first if a malformed source has more (the macro errors).
        if initializer == nil {
          initializer = ExportedInitializer(
            parameters: parameters(of: initDecl.signature.parameterClause),
            accessLevel: spelledAccessLevel(of: initDecl.modifiers),
            platforms: platforms
          )
        }
        continue
      }

      if let funcDecl = decl.as(FunctionDeclSyntax.self),
        let attribute = funcDecl.attributes.firstAttribute(named: DetectedMacro.js.rawValue)
      {
        functions.append(contentsOf: makeFunctions(funcDecl: funcDecl, attribute: attribute, platforms: platforms))
        continue
      }

      if let varDecl = decl.as(VariableDeclSyntax.self),
        let attribute = varDecl.attributes.firstAttribute(named: DetectedMacro.js.rawValue)
      {
        properties.append(contentsOf: makeProperties(varDecl: varDecl, attribute: attribute, platforms: platforms))
      }
    }

    return (functions, properties, events, initializer)
  }

  /// Builds the `ExportedEvent` entries for an `@Event var`, applying the same checks
  /// `EventMacro.validatedEvent(of:on:)` does. A rejected declaration expands to no event, so
  /// reporting one would describe a surface that does not exist. `@JS` on the same property is
  /// caught by the caller, which reaches the `@JS` branch first.
  private func makeEvents(
    varDecl: VariableDeclSyntax,
    attribute: AttributeSyntax,
    platforms: [ExportedPlatform]
  ) -> [ExportedEvent] {
    guard varDecl.bindingSpecifier.tokenKind != .keyword(.let),
      !isTypeLevel(varDecl.modifiers)
    else {
      return []
    }
    let override = stringArgument(of: attribute)
    let isSync = boolArgument(of: attribute, label: "sync") == true
    var result: [ExportedEvent] = []

    for binding in varDecl.bindings {
      // Binding-level checks, in the macro's order: a named binding with a function type that takes
      // at most one payload and returns Void, with no initializer or hand-written accessors.
      guard let ident = binding.pattern.as(IdentifierPatternSyntax.self),
        binding.initializer == nil,
        binding.accessorBlock == nil,
        let functionType = underlyingFunctionType(of: binding.typeAnnotation?.type),
        isVoidEventReturn(functionType.returnClause.type),
        functionType.parameters.count <= 1
      else {
        continue
      }
      let name = ident.identifier.identifierName
      result.append(
        ExportedEvent(
          name: name,
          jsName: override ?? defaultEventName(for: name),
          payload: functionType.parameters.first.map { typeNode(from: $0.type) },
          isSync: isSync,
          accessLevel: spelledAccessLevel(of: varDecl.modifiers),
          platforms: platforms
        )
      )
    }
    return result
  }

  /// Builds the `ExportedFunction` entries for a `@JS func`: JS-name fallback, parameters, a `Void`
  /// return as `nil`, and the effect/static flags. A synchronous function with `.withAsync("name")`
  /// gets a second, `async` entry under that name, for the promise-returning variant the macro binds.
  private func makeFunctions(
    funcDecl: FunctionDeclSyntax,
    attribute: AttributeSyntax,
    platforms: [ExportedPlatform]
  ) -> [ExportedFunction] {
    let effects = funcDecl.signature.effectSpecifiers
    let returnType = funcDecl.signature.returnClause?.type
    let isAsync = effects?.asyncSpecifier != nil
    let exportedParameters = parameters(of: funcDecl.signature.parameterClause)
    let returns = isVoidType(returnType) ? nil : returnType.map { typeNode(from: $0) }
    let makeFunction = { (jsName: String, isAsync: Bool) in
      ExportedFunction(
        name: funcDecl.name.identifierName,
        jsName: jsName,
        parameters: exportedParameters,
        returns: returns,
        isAsync: isAsync,
        isThrowing: effects?.throwsClause?.throwsSpecifier != nil,
        isStatic: isTypeLevel(funcDecl.modifiers),
        accessLevel: spelledAccessLevel(of: funcDecl.modifiers),
        platforms: platforms
      )
    }
    let function = makeFunction(stringArgument(of: attribute) ?? funcDecl.name.identifierName, isAsync)
    // The macro binds no variant for an `async` function: it reports the option there instead.
    guard !isAsync, let variantName = asyncVariantName(of: attribute) else {
      return [function]
    }
    return [function, makeFunction(variantName, true)]
  }

  /// Builds the `ExportedProperty` entries for a `@JS var`/`let`. One declaration can introduce several
  /// bindings (`var a, b: Int`), so this returns an array. The value type is the annotation, else the
  /// literal default's inferred type, else `nil`.
  private func makeProperties(
    varDecl: VariableDeclSyntax,
    attribute: AttributeSyntax,
    platforms: [ExportedPlatform]
  ) -> [ExportedProperty] {
    let isLet = varDecl.bindingSpecifier.tokenKind == .keyword(.let)
    let isStatic = isTypeLevel(varDecl.modifiers)
    let override = stringArgument(of: attribute)
    var result: [ExportedProperty] = []

    for binding in varDecl.bindings {
      guard let ident = binding.pattern.as(IdentifierPatternSyntax.self) else {
        continue
      }
      let name = ident.identifier.identifierName
      let type = valueTypeNode(annotation: binding.typeAnnotation?.type, initializer: binding.initializer?.value)
      result.append(
        ExportedProperty(
          name: name,
          jsName: override ?? name,
          type: type,
          isSettable: isSettable(binding: binding, isLet: isLet),
          isStatic: isStatic,
          // Only a stored property has an initializer; a computed one has none to report.
          defaultValue: binding.initializer?.value.trimmedDescription,
          accessLevel: spelledAccessLevel(of: varDecl.modifiers),
          platforms: platforms
        )
      )
    }
    return result
  }

  /// True when a binding is assignable from JS, mirroring the macro's `bindingIsSettable`: a `let` is
  /// never settable; a stored `var` is; a computed `var` is settable iff it declares `set`/`willSet`/
  /// `didSet` (a getter-only `var` is read-only).
  private func isSettable(binding: PatternBindingSyntax, isLet: Bool) -> Bool {
    if isLet {
      return false
    }
    guard let accessorBlock = binding.accessorBlock else {
      // Stored `var`, settable.
      return true
    }
    switch accessorBlock.accessors {
    case .accessors(let list):
      return list.contains { accessor in
        switch accessor.accessorSpecifier.tokenKind {
        case .keyword(.set), .keyword(.willSet), .keyword(.didSet):
          return true
        default:
          return false
        }
      }
    case .getter:
      // `var x: Int { ... }` shorthand getter, read-only.
      return false
    }
  }

  /// The `@Record` properties: every stored, non-excluded `var`/`let` binding, mirroring
  /// `RecordMacro.recordProperties`. Computed and modifier-excluded bindings are skipped, as is one
  /// whose type can't be determined (the macro would error, but the scan stays lenient).
  private func collectRecordProperties(_ members: MemberBlockItemListSyntax) -> [ExportedRecordProperty] {
    var properties: [ExportedRecordProperty] = []

    // `@Record` reads only the properties written directly in the body, so `#if` is not looked into.
    for member in members {
      guard let varDecl = member.decl.as(VariableDeclSyntax.self),
        !isExcludedRecordModifier(varDecl.modifiers)
      else {
        continue
      }
      let platforms = platformResolver.platforms(of: varDecl)
      guard !platforms.isEmpty else {
        continue
      }
      for binding in varDecl.bindings {
        if binding.accessorBlock != nil {
          continue
        }
        guard let ident = binding.pattern.as(IdentifierPatternSyntax.self) else {
          continue
        }
        let annotation = binding.typeAnnotation?.type
        guard let type = valueTypeNode(annotation: annotation, initializer: binding.initializer?.value) else {
          continue
        }
        properties.append(
          ExportedRecordProperty(
            name: ident.identifier.identifierName,
            type: type,
            isOptional: annotation.map { isOptionalType($0) } ?? false,
            defaultValue: binding.initializer?.value.trimmedDescription,
            accessLevel: spelledAccessLevel(of: varDecl.modifiers),
            platforms: platforms
          )
        )
      }
    }
    return properties
  }

  /// The declared cases of an enum, in source order. One `case` declaration can introduce several
  /// cases (`case a, b`), so each element is read separately. A case carrying associated values is
  /// skipped: it has no raw value, so it can't cross the boundary as one.
  ///
  /// A `String`-backed case with no written value takes the case's own name, so those are filled in
  /// here and a `String`-backed enum reports a raw value on every case. `Int` is deliberately left
  /// alone: see `derivedStringRawValue(for:rawType:)`.
  private func collectEnumCases(
    _ members: MemberBlockItemListSyntax,
    rawType: TypeNode?
  ) -> [ExportedEnumCase] {
    var cases: [ExportedEnumCase] = []

    for member in flattened(members) {
      guard let caseDecl = member.decl.as(EnumCaseDeclSyntax.self) else {
        continue
      }
      let platforms = platformResolver.platforms(of: caseDecl)
      guard !platforms.isEmpty else {
        continue
      }
      for element in caseDecl.elements where element.parameterClause == nil {
        let name = element.name.identifierName
        cases.append(
          ExportedEnumCase(
            name: name,
            rawValue: writtenRawValue(of: element) ?? derivedStringRawValue(for: name, rawType: rawType),
            platforms: platforms
          )
        )
      }
    }
    return cases
  }

  /// The alternatives of a `@Union`, in declaration order (the decode depends on it). Skips the cases
  /// `UnionMacro.validatedUnion(of:)` rejects (no associated value, more than one, or a default), since
  /// those don't exist at runtime. The scanner never diagnoses, it just declines to report.
  ///
  /// A generic `@Union` is rejected wholesale by the macro but still reported, since the declaration
  /// names a type a consumer may meet.
  private func collectUnionMembers(_ members: MemberBlockItemListSyntax) -> [ExportedUnionMember] {
    var result: [ExportedUnionMember] = []

    // `@Union` reads only the cases written directly in the body, so `#if` is not looked into.
    for member in members {
      guard let caseDecl = member.decl.as(EnumCaseDeclSyntax.self) else {
        continue
      }
      let platforms = platformResolver.platforms(of: caseDecl)
      guard !platforms.isEmpty else {
        continue
      }
      for element in caseDecl.elements {
        guard let parameters = element.parameterClause?.parameters,
          parameters.count == 1, let parameter = parameters.first,
          parameter.defaultValue == nil
        else {
          continue
        }
        result.append(
          ExportedUnionMember(
            name: element.name.identifierName,
            type: typeNode(from: parameter.type),
            platforms: platforms
          )
        )
      }
    }
    return result
  }

  /// Projects a parameter clause into `ExportedParameter`s: label = first name, name = second (else
  /// first), `optional` when it has a default value or an optional type, and the default as written.
  private func parameters(of clause: FunctionParameterClauseSyntax) -> [ExportedParameter] {
    clause.parameters.map { parameter in
      let label = parameter.firstName.identifierName
      let name = parameter.secondName?.identifierName ?? label
      return ExportedParameter(
        label: label,
        name: name,
        type: typeNode(from: parameter.type),
        isOptional: parameter.defaultValue != nil || isOptionalType(parameter.type),
        defaultValue: parameter.defaultValue?.value.trimmedDescription
      )
    }
  }

  /// The names of the types enclosing a declaration, outermost first: empty at file scope, and `nil`
  /// when the declaration is local to a function body or a closure.
  ///
  /// File scope uses the same rule as `DetectionVisitor.isTopLevel`: the declaration's item sits in
  /// the source file's top-level item list, directly or through `#if` clauses. A member is reached
  /// from its type through `MemberBlockItemSyntax`, also directly or through `#if` clauses; an
  /// `extension` contributes its extended type as written (without backticks), so its spelling may
  /// already be qualified.
  private func enclosingTypes(of node: some SyntaxProtocol) -> [String]? {
    if let item = node.parent?.as(CodeBlockItemSyntax.self) {
      return isAtFileScope(item) ? [] : nil
    }
    guard let item = node.parent?.as(MemberBlockItemSyntax.self),
      let parent = declaration(owning: item),
      let scope = enclosingTypes(of: parent)
    else {
      return nil
    }
    if let decl = parent.as(ExtensionDeclSyntax.self) {
      // Without backticks, like every other reported name.
      return scope + [String(decl.extendedType.trimmedDescription.filter { $0 != "`" })]
    }
    // A class, struct, enum, or actor. A protocol body cannot declare types.
    guard !parent.is(ProtocolDeclSyntax.self), let decl = parent.asProtocol(NamedDeclSyntax.self) else {
      return nil
    }
    return scope + [decl.name.identifierName]
  }
}

/// True when a code block item is in the source file's top-level item list, directly or in a clause
/// of a top-level `#if`.
private func isAtFileScope(_ item: CodeBlockItemSyntax) -> Bool {
  guard let list = item.parent?.as(CodeBlockItemListSyntax.self) else {
    return false
  }
  if list.parent?.is(SourceFileSyntax.self) == true {
    return true
  }
  guard let ifConfigItem = enclosingIfConfig(of: list)?.parent?.as(CodeBlockItemSyntax.self) else {
    return false
  }
  return isAtFileScope(ifConfigItem)
}

/// The type or extension whose body holds a member, looking through the `#if` clauses the member may
/// be written in.
private func declaration(owning item: MemberBlockItemSyntax) -> Syntax? {
  guard let list = item.parent?.as(MemberBlockItemListSyntax.self) else {
    return nil
  }
  if let block = list.parent?.as(MemberBlockSyntax.self) {
    return block.parent
  }
  guard let ifConfigItem = enclosingIfConfig(of: list)?.parent?.as(MemberBlockItemSyntax.self) else {
    return nil
  }
  return declaration(owning: ifConfigItem)
}

/// The `#if` declaration whose clause holds `elements`, or `nil` when they are not in a clause.
private func enclosingIfConfig(of elements: some SyntaxProtocol) -> IfConfigDeclSyntax? {
  return elements.parent?.as(IfConfigClauseSyntax.self)?.parent?.parent?.as(IfConfigDeclSyntax.self)
}

/// The members of a type body in source order, with the members of every clause of each `#if` in
/// place of the `#if`. Whether a platform builds a member is left to `PlatformResolver`.
private func flattened(_ members: MemberBlockItemListSyntax) -> [MemberBlockItemSyntax] {
  return members.flatMap { member -> [MemberBlockItemSyntax] in
    guard let ifConfig = member.decl.as(IfConfigDeclSyntax.self) else {
      return [member]
    }
    return ifConfig.clauses.flatMap { clause -> [MemberBlockItemSyntax] in
      guard case .decls(let decls) = clause.elements else {
        return []
      }
      return flattened(decls)
    }
  }
}

/// A declared name qualified with the names of its enclosing types: `Options.Encoding`.
private func qualifiedName(_ name: String, in scope: [String]) -> String {
  (scope + [name]).joined(separator: ".")
}

// MARK: - Syntactic helpers (shared spelling with the macros)

extension TokenSyntax {
  /// The name a token spells, without the backticks Swift requires around a reserved word used as
  /// a name: `` `default` `` reads as `default`. Tokens that aren't identifiers, such as the `_`
  /// wildcard label, read as written.
  var identifierName: String {
    identifier?.name ?? text
  }
}

/// True when the modifiers make a member type-level (`static` or `class`).
// MARK: - `@Event` helpers

// The macro target can't be imported, so these are deliberate copies of `EventMacro`'s logic. They
// must stay in step with it: a drift changes the reported surface without failing any build.

/// The Swift name with a conventional `on` prefix stripped and the remainder decapitalized
/// (`onStatusChange` -> `statusChange`); names without the prefix pass through verbatim. A drift
/// from the macro's copy would produce listener names the module never emits.
func defaultEventName(for swiftName: String) -> String {
  guard swiftName.hasPrefix("on") else {
    return swiftName
  }
  let rest = swiftName.dropFirst(2)
  guard let first = rest.first, first.isUppercase else {
    return swiftName
  }
  return decapitalized(String(rest))
}

/// Lowercases the leading uppercase run the way Swift's API importer does: a single leading capital
/// is lowercased, and a longer acronym run keeps its last capital when a lowercase letter follows it
/// (`StatusChange` -> `statusChange`, `URLChange` -> `urlChange`, `URL` -> `url`).
private func decapitalized(_ name: String) -> String {
  let runEnd = name.firstIndex { !$0.isUppercase } ?? name.endIndex
  if name[..<runEnd].count > 1 && runEnd != name.endIndex {
    let lastCapital = name.index(before: runEnd)
    return name[..<lastCapital].lowercased() + name[lastCapital...]
  }
  return name[..<runEnd].lowercased() + name[runEnd...]
}

/// The function type underlying a property's type annotation, unwrapping attributes
/// (`@Sendable (P) -> Void`) and single-element parentheses (`((P) -> Void)`). `nil` when the
/// annotation is missing or isn't a function type.
private func underlyingFunctionType(of type: TypeSyntax?) -> FunctionTypeSyntax? {
  guard let type else {
    return nil
  }
  if let attributed = type.as(AttributedTypeSyntax.self) {
    return underlyingFunctionType(of: attributed.baseType)
  }
  if let tuple = type.as(TupleTypeSyntax.self),
    tuple.elements.count == 1, let element = tuple.elements.first, element.firstName == nil
  {
    return underlyingFunctionType(of: element.type)
  }
  return type.as(FunctionTypeSyntax.self)
}

/// True when an event's function type returns `Void`. The shared `isVoidType` is not reused: it
/// accepts neither `Swift.Void` nor a parenthesized `(Void)`, so it would drop valid events.
private func isVoidEventReturn(_ type: TypeSyntax) -> Bool {
  if let tuple = type.as(TupleTypeSyntax.self), tuple.elements.count == 1,
    let element = tuple.elements.first, element.firstName == nil
  {
    return isVoidEventReturn(element.type)
  }
  let text = type.trimmedDescription
  return text == "Void" || text == "()" || text == "Swift.Void"
}

/// The value of a labeled boolean macro argument (`@Event(sync: true)`), or `nil` when absent.
private func boolArgument(of attribute: AttributeSyntax, label: String) -> Bool? {
  guard let arguments = attribute.arguments?.as(LabeledExprListSyntax.self) else {
    return nil
  }
  for argument in arguments where argument.label?.text == label {
    guard let literal = argument.expression.as(BooleanLiteralExprSyntax.self) else {
      return nil
    }
    return literal.literal.tokenKind == .keyword(.true)
  }
  return nil
}

/// The name in a `@JS` attribute's `.withAsync("name")` option, in the arguments or inside an array
/// literal (`@JS("load", [.withAsync("loadAsync")])`), or `nil` when the option is absent or its
/// argument isn't a plain string literal. Mirrors `asyncVariantOption` and `asyncVariantName` in the
/// macros.
private func asyncVariantName(of attribute: AttributeSyntax) -> String? {
  guard let arguments = attribute.arguments?.as(LabeledExprListSyntax.self) else {
    return nil
  }
  let expressions = arguments.flatMap { argument -> [ExprSyntax] in
    if let array = argument.expression.as(ArrayExprSyntax.self) {
      return array.elements.map(\.expression)
    }
    return [argument.expression]
  }
  for expression in expressions {
    guard let call = expression.as(FunctionCallExprSyntax.self),
      let member = call.calledExpression.as(MemberAccessExprSyntax.self),
      member.declName.baseName.text == "withAsync"
    else {
      continue
    }
    guard call.arguments.count == 1,
      let argument = call.arguments.first,
      argument.label == nil,
      let literal = argument.expression.as(StringLiteralExprSyntax.self),
      literal.segments.count == 1,
      let segment = literal.segments.first?.as(StringSegmentSyntax.self)
    else {
      return nil
    }
    return segment.content.text
  }
  return nil
}

private func isTypeLevel(_ modifiers: DeclModifierListSyntax) -> Bool {
  modifiers.contains {
    $0.name.tokenKind == .keyword(.static) || $0.name.tokenKind == .keyword(.class)
  }
}

/// True when a modifier excludes a property from being a `@Record` field (`static`, `class`,
/// `private`, `fileprivate`, `lazy`), mirroring `RecordMacro.isExcludedByModifier`.
private func isExcludedRecordModifier(_ modifiers: DeclModifierListSyntax) -> Bool {
  modifiers.contains { modifier in
    switch modifier.name.tokenKind {
    case .keyword(.static), .keyword(.class), .keyword(.private), .keyword(.fileprivate), .keyword(.lazy):
      return true
    default:
      return false
    }
  }
}

/// The protocol whose conformance marks an enum as convertible at the JS boundary. Core converts such
/// an enum through `Coding/…+Enumerable`, keyed on this conformance, so the scanner keys on it too.
let enumerableConformanceName = "Enumerable"

/// True when an inheritance clause names `name`. Matched on the trailing component of the written
/// spelling, so a qualified `ExpoModulesCore.Enumerable` counts. Purely syntactic: a conformance added
/// in a separate `extension`, or inherited through another protocol, is invisible to a scan and so is
/// not reported.
func inherits(from name: String, in clause: InheritanceClauseSyntax?) -> Bool {
  guard let clause else {
    return false
  }
  return clause.inheritedTypes.contains { inherited in
    inherited.type.trimmedDescription.split(separator: ".").last.map(String.init) == name
  }
}

/// The raw value a case writes, or `nil` when it writes none.
///
/// A string literal is reported **decoded**: `case a = "act"` yields `act`, with no quotes, because a
/// `String` raw value is always fully known (see `derivedStringRawValue(for:rawType:)`) and a consumer
/// should not have to unquote it. Every other expression is reported as **source text**, since an
/// integer raw value may be any literal expression the scanner can't evaluate. Which of the two a
/// `rawValue` holds follows from the enum's `rawType`, and `ExportedEnumCase` documents that contract.
///
/// A literal this can't decode is treated as writing no raw value rather than reported half-read: an
/// interpolated string (`case a = "x\(y)"`, not a legal raw value anyway), or one whose segment carries
/// a backslash escape, which would need real unescaping to turn into its value. A `String` case then
/// falls back to the derived name, keeping that invariant intact.
private func writtenRawValue(of element: EnumCaseElementSyntax) -> String? {
  guard let value = element.rawValue?.value else {
    return nil
  }
  guard let literal = value.as(StringLiteralExprSyntax.self) else {
    // Not a string: an integer literal, a negative value, or an expression. Source text verbatim.
    return value.trimmedDescription
  }
  guard literal.segments.count == 1,
    let segment = literal.segments.first?.as(StringSegmentSyntax.self)
  else {
    return nil
  }
  // The segment's text is the literal's content with its delimiters already stripped, so a plain
  // `"act"` and a raw `#"act"#` both read as `act`. An escape is left to the fallback rather than
  // emitted raw, since `\n` here is two characters, not a newline.
  let content = segment.content.text
  return content.contains("\\") ? nil : content
}

/// The raw value Swift gives a `String`-backed case that writes none: the case's own name.
///
/// Only `String` is derived. Its defaulting is per-case and carry-free, so a case that can't be read
/// can't affect any other, and every legal spelling is a single-segment literal. That closes the case
/// and lets a `String`-backed enum report a raw value on *every* case. `Int` continues
/// from the preceding case's value (`case a = 1; case b` makes `b` 2), whether that value was written
/// or itself derived, so one unreadable expression would corrupt every case after it. Deriving it
/// partially would be worse than not deriving it, so integer-backed enums report only what's written
/// and the consumer applies the continuation rule.
private func derivedStringRawValue(for caseName: String, rawType: TypeNode?) -> String? {
  // `String` is a `.primitive`, but a qualified `Swift.String` parses as a `.ref`, and both are legal
  // raw types. Matching the trailing component covers each, the same way the conformance check does.
  let name: String?
  switch rawType {
  case .primitive(let spelling, _), .ref(let spelling, _, _):
    name = spelling.split(separator: ".").last.map(String.init)
  default:
    name = nil
  }
  guard name == "String" else {
    return nil
  }
  // Decoded, matching how a written string literal is reported: the value, not its source spelling.
  return caseName
}

/// Protocols an `Enumerable` enum commonly adopts, which a syntactic scan would otherwise mistake for
/// a raw value type when one is written ahead of the conformance (`enum E: Codable, Enumerable`, which
/// has no raw type). Only the first inherited entry is ever tested against this, so the list needs to
/// name just what can legally precede `Enumerable`, not every protocol in existence.
private let knownNonRawValueProtocols: Set<String> = [
  "CaseIterable", "Codable", "Decodable", "Encodable", "Equatable", "Error", "Hashable",
  "Identifiable", "Sendable", enumerableConformanceName,
]

/// The raw value type of an enum, or `nil` when it declares none.
///
/// Swift allows a raw type only in first position, so nothing after the first entry can be one. The
/// first entry is still not necessarily a raw type: `enum E: Codable, Enumerable` is a legal
/// raw-value-less enum, and a scan can't resolve a bare name to tell a protocol from a type. It's
/// matched against `knownNonRawValueProtocols` instead, which covers what an `Enumerable` enum
/// realistically adopts. An unlisted protocol written first would still be misreported as a raw type;
/// that is the residual limit of reading this syntactically.
func rawValueType(of clause: InheritanceClauseSyntax?) -> TypeNode? {
  guard let first = clause?.inheritedTypes.first?.type,
    let trailing = first.trimmedDescription.split(separator: ".").last.map(String.init),
    !knownNonRawValueProtocols.contains(trailing)
  else {
    return nil
  }
  return typeNode(from: first)
}

/// True when a type is written as an optional: `T?`, `T!`, or `Optional<T>`, mirroring the macros'
/// `isOptionalType`.
private func isOptionalType(_ type: TypeSyntax) -> Bool {
  if type.is(OptionalTypeSyntax.self) || type.is(ImplicitlyUnwrappedOptionalTypeSyntax.self) {
    return true
  }
  if let identifier = type.as(IdentifierTypeSyntax.self), identifier.name.text == "Optional" {
    return true
  }
  return false
}

/// The first attribute whose spelled name matches `name`. A local copy of the macros' helper (the
/// macro target can't be imported here).
extension AttributeListSyntax {
  fileprivate func firstAttribute(named name: String) -> AttributeSyntax? {
    for element in self {
      if let attribute = element.as(AttributeSyntax.self),
        attribute.attributeName.trimmedDescription == name
      {
        return attribute
      }
    }
    return nil
  }
}

/// The type names in an attribute's `label: [A.self, B.self]` argument, in source order. A qualified
/// `Outer.A.self` keeps its full spelling. Returns an empty array when the argument is absent or isn't
/// an array literal. A local copy of the macros' helper (the macro target can't be imported here).
private func classListArgument(of attribute: AttributeSyntax, label: String) -> [String] {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self),
    let array = args.first(where: { $0.label?.text == label })?.expression.as(ArrayExprSyntax.self)
  else {
    return []
  }
  return array.elements.compactMap { element in
    guard let memberAccess = element.expression.as(MemberAccessExprSyntax.self),
      memberAccess.declName.baseName.text == "self",
      let base = memberAccess.base,
      base.is(DeclReferenceExprSyntax.self) || base.is(MemberAccessExprSyntax.self)
    else {
      return nil
    }
    return base.trimmedDescription
  }
}

/// The node for a property/field value type: the annotation, else the literal default's inferred
/// primitive (`var n = 1` -> `Int`), else `nil`.
private func valueTypeNode(annotation: TypeSyntax?, initializer: ExprSyntax?) -> TypeNode? {
  if let annotation {
    return typeNode(from: annotation)
  }
  return initializer.flatMap(inferredLiteralType)
}

/// The node for a simple literal default (`var n = 1` -> `Int`); `nil` for anything non-literal.
private func inferredLiteralType(of expression: ExprSyntax) -> TypeNode? {
  switch expression.kind {
  case .stringLiteralExpr:
    return .primitive(name: "String", jsType: .string)
  case .integerLiteralExpr:
    return .primitive(name: "Int", jsType: .number)
  case .floatLiteralExpr:
    return .primitive(name: "Double", jsType: .number)
  case .booleanLiteralExpr:
    return .primitive(name: "Bool", jsType: .boolean)
  default:
    return nil
  }
}
