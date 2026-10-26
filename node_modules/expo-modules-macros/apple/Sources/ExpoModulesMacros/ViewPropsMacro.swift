import SwiftDiagnostics
import SwiftSyntax
import SwiftSyntaxBuilder
import SwiftSyntaxMacros

/// Member + extension macro applied to a view-props type. Like `@Record`, **every stored property**
/// that is not `static`, `private`, `fileprivate`, `lazy` or computed is part of the surface — no
/// `@Field` wrapper — but unlike a record, the properties split into two kinds by their type:
///
/// - a **function-typed** property is an **event** (`var onTap: (TapEvent) -> Void`), dispatched by
///   name through the view's event emitter. No JS function object is ever decoded into it.
/// - every other property is a **value prop**, decoded from the raw props Fabric delivers.
///
/// The macro synthesizes the identity surface the batched reaction model reads:
///
/// - `PropName`: a `String`-backed `CaseIterable` enum, one case per value prop, whose raw value is
///   the wire key. It doubles as the string → prop translation table, so the runtime maps a raw
///   changed key with `PropName(rawValue:)` and names a prop in a log with `prop.rawValue`.
/// - `PropSet`: an `OptionSet` over `UInt64`, one bit per value prop in declaration order. This is the
///   membership currency: the changed set on a diff is a bitmask, so asking what changed costs no
///   allocation and no hashing.
/// - `_eventNames`: the event props' names, verbatim, for core to register at view creation.
/// - `typealias Diff = PropsDiff<Self>`, the nested spelling of core's one generic diff.
///
/// Author-facing shape — no conformance to spell out:
///
///   @ViewProps
///   struct CardProps {
///     var color: UIColor = .red        // value prop, bit 0
///     var radius: CGFloat = 0          // value prop, bit 1
///     var onTap: (TapEvent) -> Void    // event, no bit
///   }
///
/// The diff type itself is deliberately **not** generated. Core's generic
/// `PropsDiff<Props: AnyViewProps>` owns both storage (`old`/`new`/`changedProps`) and behavior
/// (`changed(_:)`, `oldValue(_:)`, `isInitial`, `changedNames`), reaching the per-props types through
/// the conformance's associated types — so the query API can grow without a macro release.
///
/// Event names are emitted **verbatim**, with no `on`-prefix stripping. This differs from `@Event` on
/// modules and shared objects, which strips it (`onStatusChange` → `"statusChange"`): a view event prop
/// is a React prop name that Fabric carries as-is, so the native and JS spellings must match exactly.
public struct ViewPropsMacro: MemberMacro, ExtensionMacro {
  public static func expansion(
    of node: AttributeSyntax,
    providingMembersOf declaration: some DeclGroupSyntax,
    conformingTo protocols: [TypeSyntax],
    in context: some MacroExpansionContext
  ) throws -> [DeclSyntax] {
    let props = try validatedViewProps(of: declaration)

    var members: [DeclSyntax] = []
    members.append(propNameEnum(valueProps: props.valueProps))
    members.append(propSetStruct(valueProps: props.valueProps))
    members.append(eventNamesConstant(eventProps: props.eventProps))
    members.append(diffTypealias())
    return members
  }

  /// Auto-conforms the type to `AnyViewProps`, supplying the two requirements that can only be written
  /// per-props: `allProps` (every bit set, the changed set on the first application) and
  /// `propSet(for:)` (one name's bit, for folding raw changed keys into the mask).
  ///
  /// A conformance the author already spelled out in the inheritance clause is not repeated.
  public static func expansion(
    of node: AttributeSyntax,
    attachedTo declaration: some DeclGroupSyntax,
    providingExtensionsOf type: some TypeSyntaxProtocol,
    conformingTo protocols: [TypeSyntax],
    in context: some MacroExpansionContext
  ) throws -> [ExtensionDeclSyntax] {
    guard declaration.is(StructDeclSyntax.self) else {
      return []
    }
    // Both roles read the same model, but a validation failure is the member macro's to report:
    // expansion runs each role independently, so throwing here too would surface every diagnostic
    // twice. When the model doesn't validate, the member macro has already emitted the error and
    // there is nothing to extend.
    guard let props = try? validatedViewProps(of: declaration) else {
      return []
    }
    let alreadyConforms = inheritsProtocol(named: viewPropsProtocolName, in: declaration)

    // `allProps` is read on every first application of props, once per view instance, so it's a
    // stored constant with the mask already folded rather than a computed property rebuilding an
    // array literal per call. The macro knows the bit count, so the literal is exact: n props
    // occupy bits 0..<n, which is the low n bits set.
    let allPropsMask =
      props.valueProps.isEmpty
      ? "0"
      : "0b" + String(repeating: "1", count: props.valueProps.count)

    // With no value prop there's nothing to switch over, and an empty `switch` over an uninhabited
    // enum doesn't compile — return the empty set instead.
    let propSetBody: String
    if props.valueProps.isEmpty {
      propSetBody = "    return []"
    } else {
      let cases = props.valueProps
        .map { "    case .\($0.name):\n      return .\($0.name)" }
        .joined(separator: "\n")
      propSetBody = "    switch name {\n\(cases)\n    }"
    }

    let conformanceClause = alreadyConforms ? "" : ": \(viewPropsProtocolName)"
    let ext: DeclSyntax = """
      extension \(type.trimmed)\(raw: conformanceClause) {
        public static let allProps = PropSet(rawValue: \(raw: allPropsMask))

        /// `@inlinable` so core's raw-key fold can inline the lookup across the module boundary:
        /// it runs once per changed key per props batch.
        @inlinable
        public static func propSet(for name: PropName) -> PropSet {
      \(raw: propSetBody)
        }
      }
      """
    guard let extDecl = ext.as(ExtensionDeclSyntax.self) else {
      return []
    }
    return [extDecl]
  }
}

/// The core protocol carrying the `PropName`/`PropSet` associated types plus `allProps` and
/// `propSet(for:)`, through which the generic `PropsDiff` reaches a specific props type.
private let viewPropsProtocolName = "AnyViewProps"

/// The mask is a single `UInt64`, so a props type can carry at most this many value props. Event
/// props take no bit and don't count.
private let maxValueProps = 64

// MARK: - Diagnostics

/// The error for a leftover `@Field`, attached to the attribute itself and carrying a fix-it that
/// deletes it. `@ViewProps` treats every stored property as a prop, so the attribute has no meaning
/// here; left in place it would wrap the value in `Field<T>` and the props type would decode against
/// the wrong type.
private func fieldAttributeDiagnostic(
  for attribute: AttributeSyntax,
  on varDecl: VariableDeclSyntax
) -> Diagnostic {
  // Rebuild the attribute list without this entry, so the fix-it removes the attribute and the
  // trivia it carried rather than leaving a blank line behind.
  var attributes = varDecl.attributes
  if let index = attributes.firstIndex(where: { element in
    guard case .attribute(let candidate) = element else {
      return false
    }
    return candidate == attribute
  }) {
    attributes.remove(at: index)
  }
  let fixIt = FixIt(
    message: ViewPropsFixItMessage("Remove the '@Field' attribute", id: "viewprops-remove-field"),
    changes: [
      .replace(
        oldNode: Syntax(varDecl),
        newNode: Syntax(varDecl.with(\.attributes, attributes))
      )
    ]
  )
  let message = ViewPropsDiagnosticMessage(
    "@Field is no longer used — @ViewProps treats every stored property as a prop. Remove the @Field attribute",
    id: "viewprops-field-attribute"
  )
  return Diagnostic(node: attribute, message: message, fixIts: [fixIt])
}

/// The error for an optional event prop, attached to the declared type and carrying a fix-it that
/// unwraps it. Events are registered once at view creation from a static name list, so there is no
/// shape that could express "sometimes emitted".
private func optionalEventDiagnostic(for type: TypeSyntax, name: String) -> Diagnostic {
  var fixIts: [FixIt] = []
  if let unwrapped = unwrappedOptionalType(type) {
    fixIts.append(
      FixIt(
        message: ViewPropsFixItMessage("Make '\(name)' non-optional", id: "viewprops-unwrap-event"),
        changes: [
          .replace(
            oldNode: Syntax(type),
            newNode: Syntax(unwrapped.with(\.trailingTrivia, type.trailingTrivia))
          )
        ]
      )
    )
  }
  let message = ViewPropsDiagnosticMessage(
    "Event props cannot be optional — '\(name)' is registered once at view creation, so its presence can't vary. Drop the '?'",
    id: "viewprops-optional-event"
  )
  return Diagnostic(node: type, message: message, fixIts: fixIts)
}

/// The type an optional wraps, with the enclosing parentheses of a parenthesized function type kept
/// (`(() -> Void)?` unwraps to `() -> Void`, not to a stray `(() -> Void)`). Returns `nil` for a
/// spelling the fix-it can't rewrite mechanically.
private func unwrappedOptionalType(_ type: TypeSyntax) -> TypeSyntax? {
  guard let wrapped = optionalWrappedType(type) else {
    return nil
  }
  return innerFunctionType(of: wrapped) ?? wrapped
}

/// The function type inside a single-element parenthesized type, so unwrapping `(() -> Void)?`
/// yields `() -> Void` rather than keeping the now-redundant parentheses.
private func innerFunctionType(of type: TypeSyntax) -> TypeSyntax? {
  guard let tuple = type.as(TupleTypeSyntax.self),
    tuple.elements.count == 1,
    let only = tuple.elements.first,
    only.type.is(FunctionTypeSyntax.self)
  else {
    return nil
  }
  return only.type
}

private struct ViewPropsDiagnosticMessage: DiagnosticMessage {
  let message: String
  let diagnosticID: MessageID
  let severity: DiagnosticSeverity = .error

  init(_ message: String, id: String) {
    self.message = message
    self.diagnosticID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

private struct ViewPropsFixItMessage: FixItMessage {
  let message: String
  let fixItID: MessageID

  init(_ message: String, id: String) {
    self.message = message
    self.fixItID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

// MARK: - Property model

/// One stored property of the props type, classified as a value prop or an event.
private struct ViewProp {
  /// The property name as written, backticks included for an escaped name. Every identifier position
  /// in the generated code uses this, since `case default` and `static let default` don't parse.
  let name: String
  /// The property's declared type, verbatim. Retained for the decode surface, which lands with the
  /// core props contract.
  let type: String

  /// The name with any escaping backticks removed: the JS-visible key, so the enum's raw value and
  /// `_eventNames` both read `"default"`, never `` "`default`" ``.
  var wireName: String {
    return withoutBackticks(name)
  }
}

private struct ViewPropsModel {
  /// Value props, in declaration order. The order is the bit order, so it is part of the ABI
  /// between a compiled view and the runtime that fills the mask.
  let valueProps: [ViewProp]
  /// Event props, in declaration order.
  let eventProps: [ViewProp]
}

/// Reads and validates the props type's stored properties, splitting them into value props and events.
///
/// Rejects what can't be expressed: a non-`struct` declaration (the class form is the SwiftUI path and
/// needs the observable protocol, which is deferred), a leftover `@Field` attribute, an optional
/// function type, a property with no determinable type, and more than 64 value props.
private func validatedViewProps(of declaration: some DeclGroupSyntax) throws -> ViewPropsModel {
  guard let structDecl = declaration.as(StructDeclSyntax.self) else {
    throw MacroExpansionErrorMessage(
      "@ViewProps can only be applied to a struct — the class form (for SwiftUI views) is not supported yet"
    )
  }
  // A generic props type can't work: the synthesized extension would have to repeat the generic
  // parameter list and its constraints, and core reaches the props type through a view's static
  // `Props` typealias, which names one concrete type.
  if structDecl.genericParameterClause != nil {
    throw MacroExpansionErrorMessage(
      "@ViewProps does not support generic types — a view's props type must be concrete"
    )
  }

  var valueProps: [ViewProp] = []
  var eventProps: [ViewProp] = []

  for member in declaration.memberBlock.members {
    guard let varDecl = member.decl.as(VariableDeclSyntax.self) else {
      continue
    }
    if isExcludedByModifier(varDecl.modifiers) {
      continue
    }
    // `@Field` is the v1 property wrapper and has no meaning here — every stored property is already
    // part of the surface. Left in place it would wrap the value in `Field<T>`, so the props type
    // would decode against the wrong type. Flag it rather than emit code built on it.
    if let fieldAttribute = varDecl.attributes.firstAttribute(named: "Field") {
      throw DiagnosticsError(diagnostics: [fieldAttributeDiagnostic(for: fieldAttribute, on: varDecl)])
    }

    for binding in varDecl.bindings {
      // A computed property is never a prop, but an accessor block alone doesn't mean computed:
      // `willSet`/`didSet` observers imply stored storage. `bindingIsSettable` draws exactly that
      // line, so a stored property with observers stays part of the surface.
      if binding.accessorBlock != nil && !bindingIsSettable(binding) {
        continue
      }
      // A tuple-destructuring binding (`var (a, b) = (1, 2)`) has no single name to key a prop on,
      // and silently dropping it would leave the props type missing fields the author declared.
      guard let ident = binding.pattern.as(IdentifierPatternSyntax.self) else {
        if binding.pattern.is(TuplePatternSyntax.self) {
          throw MacroExpansionErrorMessage(
            "@ViewProps does not support tuple-destructuring properties — declare each prop separately"
          )
        }
        continue
      }
      // An escaped name (`` var `default`: Int ``) needs both spellings: `identifier.text` keeps the
      // backticks, which every identifier position requires (`case \`default\``), while the wire key
      // and `_eventNames` need the bare name.
      let name = ident.identifier.text

      // Prefer the explicit annotation. When it's omitted, recover the type from a literal default
      // (`var title = ""`). Anything a syntactic macro can't resolve still needs an annotation,
      // since the decode surface names the type.
      let declaredType = binding.typeAnnotation?.type
      let resolvedType =
        declaredType?.trimmedDescription
        ?? binding.initializer.flatMap { inferredLiteralType(of: $0.value) }
      guard let resolvedType else {
        throw MacroExpansionErrorMessage(
          "@ViewProps props must declare an explicit type — '\(name)' has none"
        )
      }

      // A function type means an event. An *optional* function type would make the event's presence
      // dynamic, but events are registered once at view creation from a static name list, so there
      // is no shape that could express "sometimes emitted".
      if let declaredType, isOptionalType(declaredType), underlyingFunctionType(of: declaredType) != nil {
        throw DiagnosticsError(diagnostics: [
          optionalEventDiagnostic(for: declaredType, name: name)
        ])
      }

      let isEvent = declaredType.map { underlyingFunctionType(of: $0) != nil } ?? false
      // `PropSet` stores its mask in `rawValue`, so a value prop of that name would emit a static
      // member shadowing it and the option set would not compile ("circular reference"). The error
      // would point at generated code, so catch it here and name the property.
      if !isEvent && withoutBackticks(name) == "rawValue" {
        throw MacroExpansionErrorMessage(
          "'rawValue' can't be used as a prop name — it collides with the synthesized PropSet's storage. Rename the property"
        )
      }
      let prop = ViewProp(name: name, type: resolvedType)
      if isEvent {
        eventProps.append(prop)
      } else {
        valueProps.append(prop)
      }
    }
  }

  guard valueProps.count <= maxValueProps else {
    throw MacroExpansionErrorMessage(
      "@ViewProps supports at most \(maxValueProps) value props (the changed-props mask is a UInt64), but this type declares \(valueProps.count); '\(valueProps[maxValueProps].name)' is the first over the limit. Event props don't count toward it"
    )
  }
  return ViewPropsModel(valueProps: valueProps, eventProps: eventProps)
}

/// The function type a props property declares, unwrapping any number of enclosing parentheses and an
/// optional wrapper, or `nil` when the type isn't a function. `@Sendable`/`@escaping` and other
/// attributed forms unwrap to the function type underneath.
private func underlyingFunctionType(of type: TypeSyntax) -> FunctionTypeSyntax? {
  if let functionType = type.as(FunctionTypeSyntax.self) {
    return functionType
  }
  if let tuple = type.as(TupleTypeSyntax.self), tuple.elements.count == 1, let only = tuple.elements.first {
    return underlyingFunctionType(of: only.type)
  }
  if let attributed = type.as(AttributedTypeSyntax.self) {
    return underlyingFunctionType(of: attributed.baseType)
  }
  if let optional = type.as(OptionalTypeSyntax.self) {
    return underlyingFunctionType(of: optional.wrappedType)
  }
  if let implicitlyUnwrapped = type.as(ImplicitlyUnwrappedOptionalTypeSyntax.self) {
    return underlyingFunctionType(of: implicitlyUnwrapped.wrappedType)
  }
  // The long spelling of an optional: `Optional<() -> Void>` has to reach the same diagnostic as
  // `(() -> Void)?` and `(() -> Void)!`, or the same declaration would be an event in one spelling
  // and a value prop in another.
  if let identifier = type.as(IdentifierTypeSyntax.self),
    identifier.name.text == "Optional",
    let argument = identifier.genericArgumentClause?.arguments.first,
    case .type(let wrapped) = argument.argument
  {
    return underlyingFunctionType(of: wrapped)
  }
  return nil
}

// MARK: - Synthesized members

/// The `PropName` enum: one case per value prop, `String`-backed so the raw value is the wire key.
/// Emitted even when empty (an uninhabited enum is legal and keeps the conformance's associated type
/// satisfied), so a props type with only events still conforms.
private func propNameEnum(valueProps: [ViewProp]) -> DeclSyntax {
  // An escaped case takes its raw value from the bare identifier already, but spelling it out keeps
  // the wire key visible in the generated source and independent of that implicit rule.
  let cases =
    valueProps
    .map { prop in
      prop.name == prop.wireName
        ? "  case \(prop.name)"
        : "  case \(prop.name) = \"\(prop.wireName)\""
    }
    .joined(separator: "\n")
  if valueProps.isEmpty {
    return """
      public enum PropName: String, CaseIterable {
      }
      """
  }
  return """
    public enum PropName: String, CaseIterable {
    \(raw: cases)
    }
    """
}

/// The `PropSet` option set: one static member per value prop, at its declaration-order bit. This is
/// what a diff's `changedProps` holds, and what `changed(_:)` tests against, so the whole changed set
/// is one machine word.
private func propSetStruct(valueProps: [ViewProp]) -> DeclSyntax {
  let members = valueProps.enumerated()
    .map { index, prop in
      "  public static let \(prop.name) = PropSet(rawValue: 1 << \(index))"
    }
    .joined(separator: "\n")

  if valueProps.isEmpty {
    return """
      public struct PropSet: OptionSet, Sendable {
        public let rawValue: UInt64

        public init(rawValue: UInt64) {
          self.rawValue = rawValue
        }
      }
      """
  }
  return """
    public struct PropSet: OptionSet, Sendable {
      public let rawValue: UInt64

      public init(rawValue: UInt64) {
        self.rawValue = rawValue
      }

    \(raw: members)
    }
    """
}

/// The event props' names, verbatim, for core to register at view creation. Verbatim because a view
/// event prop is a React prop name Fabric carries as-is — unlike `@Event` on a module, which strips
/// the `on` prefix.
private func eventNamesConstant(eventProps: [ViewProp]) -> DeclSyntax {
  let names = eventProps.map { "\"\($0.wireName)\"" }.joined(separator: ", ")
  return """
    public static let _eventNames: [String] = [\(raw: names)]
    """
}

/// The nested spelling of core's one generic diff, so a view writes `MyProps.Diff`.
private func diffTypealias() -> DeclSyntax {
  return """
    public typealias Diff = PropsDiff<Self>
    """
}
