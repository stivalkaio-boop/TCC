import SwiftDiagnostics
import SwiftSyntax
import SwiftSyntaxBuilder
import SwiftSyntaxMacros

/// Member macro applied to an `ExpoView` subclass, binding it to its props type:
///
///   @ExpoView<CardProps>
///   final class CardView: ExpoView {
///     override func didUpdateProps(_ diff: CardProps.Diff) {
///       if diff.changed(.color) {
///         backgroundColor = props.color
///       }
///     }
///   }
///
/// The props type is the attribute's **generic argument**, so it sits in type position: no
/// `.self` metatype to write, and the macro reads it straight off the attribute's
/// `genericArgumentClause`. Core's declaration constrains the parameter
/// (`macro ExpoView<Props: AnyViewProps>()`), so passing a type that isn't a props type is a
/// compile error at the author's own line ("requires that 'X' conform to 'AnyViewProps'")
/// rather than a macro diagnostic. This macro therefore validates nothing about the props type.
///
/// The whole expansion is one line:
///
///   public typealias Props = CardProps
///
/// That is deliberately all of it. There is **no view definition**: no `ViewDefinition`, no
/// `View(…) { }` builder, no `Props(_:)` or `Events(_:)` element. `_synthesizedViewDefinition()`
/// existed only to hand core a DSL value the old registration path could consume, and modules and
/// shared objects already moved to direct hooks. Core reads the props type from this typealias and
/// the event names from the props type's own `_eventNames` (synthesized by `@ViewProps`), both
/// static, neither needing a builder to be evaluated.
///
/// Views also get no `_decorateView` hook in its place: `_decorateModule` and `_decorateSharedObject`
/// exist to bind members into a JS object, and a view has no such object. Props reach a view through
/// Fabric's mounting layer, not a JS call, so a view's runtime entry point is the props update hook.
///
/// `didUpdateProps` is a core-called override, not synthesized here.
public struct ExpoViewMacro: MemberMacro {
  public static func expansion(
    of node: AttributeSyntax,
    providingMembersOf declaration: some DeclGroupSyntax,
    conformingTo protocols: [TypeSyntax],
    in context: some MacroExpansionContext
  ) throws -> [DeclSyntax] {
    guard let classDecl = declaration.as(ClassDeclSyntax.self) else {
      throw MacroExpansionErrorMessage("@ExpoView can only be applied to a class")
    }

    guard inheritsFromAny(classDecl, names: expoViewBaseClassNames) else {
      throw DiagnosticsError(diagnostics: [missingBaseClassDiagnostic(for: classDecl)])
    }

    // A generic view can't be registered: `@ExpoModule(views: [CardView.self])` on a generic type
    // fails with "generic parameter 'T' could not be inferred", and the props type ignores the
    // parameter anyway. Reject it here, at the author's line, rather than at the registration site.
    // `@ViewProps` rejects generic props types for the same reason.
    if classDecl.genericParameterClause != nil {
      throw MacroExpansionErrorMessage(
        "@ExpoView does not support generic classes — a view registered with @ExpoModule(views:) must be concrete"
      )
    }

    // The expansion is a `Props` typealias, so a member of that name already on the class collides.
    // Left alone, the compiler reports "invalid redeclaration of 'Props'" positioned inside the
    // macro expansion, which is code the author never wrote. Name it here instead.
    if let existing = existingPropsMemberKind(in: classDecl) {
      throw MacroExpansionErrorMessage(
        "@ExpoView synthesizes a `Props` typealias, but this class already declares a \(existing) named 'Props'. Rename it"
      )
    }

    // The props type is the attribute's generic argument. Core's declaration is generic, so a bare
    // `@ExpoView` never reaches expansion: it fails type-checking first with "generic parameter
    // 'Props' could not be inferred". This diagnostic covers the case where the macro is declared
    // differently than core declares it, so the author still gets a message naming the attribute.
    guard let propsType = genericArgument(of: node) else {
      throw MacroExpansionErrorMessage(
        "@ExpoView requires its props type as a generic argument, as in `@ExpoView<MyViewProps>`"
      )
    }

    return [
      """
      public typealias Props = \(raw: propsType)
      """
    ]
  }
}

// MARK: - Diagnostics

/// The error for a class that doesn't name `ExpoView` in its inheritance clause, carrying a fix-it
/// that adds it.
///
/// The fix-it only applies where the edit is unambiguous. With no inheritance clause at all it
/// inserts `: ExpoView`; with an existing clause it prepends `ExpoView` as the first entry, since
/// Swift requires the superclass to come before any protocol. A class that already names some other
/// superclass gets the diagnostic without a fix-it: replacing that superclass is a decision the macro
/// can't make (see the indirect-inheritance note on `expoViewBaseClassNames`).
private func missingBaseClassDiagnostic(for classDecl: ClassDeclSyntax) -> Diagnostic {
  let message = ExpoViewDiagnosticMessage(
    "@ExpoView class must inherit from ExpoView. Add `: ExpoView` to the class declaration.",
    id: "expoview-missing-base-class"
  )
  var fixIts: [FixIt] = []

  if classDecl.inheritanceClause == nil {
    // `class CardView {` → `class CardView: ExpoView {`. The name carries the space before `{` as
    // trailing trivia, so move it onto the clause to keep the spacing.
    let name = classDecl.name
    let clause = InheritanceClauseSyntax(
      colon: .colonToken(trailingTrivia: .space),
      inheritedTypes: InheritedTypeListSyntax([
        InheritedTypeSyntax(type: TypeSyntax(IdentifierTypeSyntax(name: .identifier("ExpoView"))))
      ])
    )
    fixIts.append(
      FixIt(
        message: ExpoViewFixItMessage("Inherit from 'ExpoView'", id: "expoview-add-base-class"),
        changes: [
          .replace(
            oldNode: Syntax(classDecl),
            newNode: Syntax(
              classDecl
                .with(\.name, name.with(\.trailingTrivia, []))
                .with(\.inheritanceClause, clause.with(\.trailingTrivia, name.trailingTrivia))
            )
          )
        ]
      )
    )
  } else if let clause = classDecl.inheritanceClause, inheritsOnlyProtocolsByConvention(clause) {
    // `class CardView: Identifiable {` → `class CardView: ExpoView, Identifiable {`.
    var inherited = clause.inheritedTypes
    if var first = inherited.first {
      first.trailingComma = .commaToken(trailingTrivia: .space)
      first.type = TypeSyntax(IdentifierTypeSyntax(name: .identifier("ExpoView")))
      inherited.insert(first, at: inherited.startIndex)
    }
    fixIts.append(
      FixIt(
        message: ExpoViewFixItMessage("Inherit from 'ExpoView'", id: "expoview-add-base-class"),
        changes: [
          .replace(
            oldNode: Syntax(clause),
            newNode: Syntax(clause.with(\.inheritedTypes, inherited))
          )
        ]
      )
    )
  }

  return Diagnostic(node: classDecl.name, message: message, fixIts: fixIts)
}

/// Whether every entry in the clause looks like a protocol rather than a superclass, by the
/// capitalization-free heuristic that a Swift superclass must come first: if the first entry is one
/// the macro would be replacing, prepending `ExpoView` would produce two superclasses. A macro can't
/// resolve names, so this only reports true when the clause is empty of anything that could be a
/// base class the author chose deliberately. Conservative by design: a wrong guess here would emit a
/// fix-it that doesn't compile.
private func inheritsOnlyProtocolsByConvention(_ clause: InheritanceClauseSyntax) -> Bool {
  // Any entry at all could be a superclass, so only offer the prepend when the author wrote
  // something that is definitely not one: a known protocol-shaped name from the standard library.
  let knownProtocols: Set<String> = [
    "Identifiable", "Equatable", "Hashable", "Codable", "Encodable", "Decodable",
    "Sendable", "CustomStringConvertible", "ObservableObject",
  ]
  return clause.inheritedTypes.allSatisfy { entry in
    guard let name = baseIdentifier(of: entry.type) else {
      return false
    }
    return knownProtocols.contains(name)
  }
}

private struct ExpoViewDiagnosticMessage: DiagnosticMessage {
  let message: String
  let diagnosticID: MessageID
  let severity: DiagnosticSeverity = .error

  init(_ message: String, id: String) {
    self.message = message
    self.diagnosticID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

private struct ExpoViewFixItMessage: FixItMessage {
  let message: String
  let fixItID: MessageID

  init(_ message: String, id: String) {
    self.message = message
    self.fixItID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

/// Describes an existing `Props` member on the class, for the collision diagnostic, or `nil` when the
/// name is free. Covers the shapes that would clash with the synthesized typealias: another typealias,
/// and a nested type of any kind.
private func existingPropsMemberKind(in classDecl: ClassDeclSyntax) -> String? {
  for member in classDecl.memberBlock.members {
    let decl = member.decl
    if let typealiasDecl = decl.as(TypeAliasDeclSyntax.self), typealiasDecl.name.text == "Props" {
      return "typealias"
    }
    if let structDecl = decl.as(StructDeclSyntax.self), structDecl.name.text == "Props" {
      return "struct"
    }
    if let nestedClass = decl.as(ClassDeclSyntax.self), nestedClass.name.text == "Props" {
      return "class"
    }
    if let enumDecl = decl.as(EnumDeclSyntax.self), enumDecl.name.text == "Props" {
      return "enum"
    }
    if let actorDecl = decl.as(ActorDeclSyntax.self), actorDecl.name.text == "Props" {
      return "actor"
    }
  }
  return nil
}

/// Base classes an `@ExpoView` may inherit from. The check is syntactic, matching the name in the
/// class's own inheritance clause: both `: ExpoView` and a qualified `: ExpoModulesCore.ExpoView`
/// pass, since `baseIdentifier` reads the trailing name.
///
/// Indirect inheritance does not: a view whose superclass is itself an `ExpoView` subclass
/// (`class Base: ExpoView` then `class CardView: Base`) is rejected, because a macro can't resolve
/// the superclass to check. `@SharedObject` has the same limitation, through the same helper. The
/// workaround is to apply `@ExpoView` to the class that names `ExpoView` directly.
private let expoViewBaseClassNames: Set<String> = ["ExpoView"]

/// The attribute's single generic argument, verbatim (`@ExpoView<CardProps>` → `"CardProps"`), or
/// `nil` when the attribute carries no generic argument clause.
///
/// The type is available syntactically, with no type resolution. Two spellings carry it, mirroring
/// `baseIdentifier`'s handling of the inheritance clause: a bare `@ExpoView<CardProps>` parses as an
/// `IdentifierTypeSyntax`, and a qualified `@ExpoModulesCore.ExpoView<CardProps>` as a
/// `MemberTypeSyntax`. Both have a `genericArgumentClause`, and both are legal at the use site, so
/// reading only the bare form would reject valid code while claiming the author omitted the argument.
///
/// Only the first argument is read: core's declaration has exactly one parameter, so a second is
/// already a compile error at the use site ("specialized with too many type parameters").
private func genericArgument(of attribute: AttributeSyntax) -> String? {
  let arguments: GenericArgumentListSyntax?
  if let identifier = attribute.attributeName.as(IdentifierTypeSyntax.self) {
    arguments = identifier.genericArgumentClause?.arguments
  } else if let member = attribute.attributeName.as(MemberTypeSyntax.self) {
    arguments = member.genericArgumentClause?.arguments
  } else {
    arguments = nil
  }
  guard let first = arguments?.first, case .type(let type) = first.argument else {
    return nil
  }
  return type.trimmedDescription
}
