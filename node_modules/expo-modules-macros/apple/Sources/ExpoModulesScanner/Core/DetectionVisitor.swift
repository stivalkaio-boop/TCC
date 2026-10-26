import SwiftDiagnostics
import SwiftIfConfig
import SwiftSyntax

/// Walks a parsed source file and records top-level declarations carrying `@ExpoModule`, `@JS`,
/// `@SharedObject`, or `@Record`. Only file-scope declarations are considered: these macros apply to
/// top-level types, so descending into type and function bodies would only surface false positives.
/// Recognition mirrors the macros themselves — a purely syntactic match on the spelled attribute
/// name — so it sees the same declarations the compiler would hand the plugin, without compiling
/// anything.
///
/// `#if` blocks are handled according to the scan's configuration. With a `ScanBuildConfiguration`,
/// only the active clause of each `#if` is visited, so a declaration inside `#if os(tvOS)` is
/// recorded exactly when the scan targets tvOS, and conditions the configuration cannot answer make
/// their region inactive and surface as warnings. With a `nil` configuration every clause of every
/// `#if` is visited, so a declaration in any branch is recorded and nothing is evaluated; the
/// per-platform aggregation in `scanModules` builds on both walks.
final class DetectionVisitor: SyntaxVisitor {
  private let file: String
  private let converter: SourceLocationConverter
  /// Only these macros are recorded; the rest are ignored. Lets a `modules` scan report just
  /// `@ExpoModule` while an `exports` scan covers them all.
  private let detectedMacros: Set<DetectedMacro>
  /// The configuration `#if` conditions are evaluated against, or `nil` to visit every branch.
  private let configuration: ScanBuildConfiguration?
  private var diagnostics: [Diagnostic] = []
  private(set) var detections: [Detection] = []

  init(
    file: String,
    tree: SourceFileSyntax,
    detectedMacros: Set<DetectedMacro>,
    configuration: ScanBuildConfiguration?
  ) {
    self.file = file
    self.converter = SourceLocationConverter(fileName: file, tree: tree)
    self.detectedMacros = detectedMacros
    self.configuration = configuration
    super.init(viewMode: .sourceAccurate)
  }

  /// The accumulated `#if` warnings as `Detection`-style locations plus the message, ready for the
  /// scan report. These come from conditions the configuration cannot answer statically.
  var warnings: [ScanWarning] {
    return diagnostics.map { diagnostic in
      let location = diagnostic.location(converter: converter)
      return ScanWarning(message: diagnostic.message, file: file, line: location.line)
    }
  }

  override func visit(_ node: IfConfigDeclSyntax) -> SyntaxVisitorContinueKind {
    guard let configuration else {
      // Every branch is visited, so a declaration in any clause is recorded.
      return .visitChildren
    }
    let (clause, clauseDiagnostics) = node.activeClause(in: configuration)
    diagnostics.append(contentsOf: clauseDiagnostics)
    if let elements = clause?.elements {
      // A nested `#if` inside the active clause comes back through this method.
      walk(elements)
    }
    return .skipChildren
  }

  override func visit(_ node: ClassDeclSyntax) -> SyntaxVisitorContinueKind {
    if isTopLevel(node) {
      record(attributes: node.attributes, modifiers: node.modifiers, name: node.name.text, kind: "class", at: node)
    }
    // Members live in the type body; we never report them, so there's no reason to descend.
    return .skipChildren
  }

  override func visit(_ node: StructDeclSyntax) -> SyntaxVisitorContinueKind {
    if isTopLevel(node) {
      record(attributes: node.attributes, modifiers: node.modifiers, name: node.name.text, kind: "struct", at: node)
    }
    return .skipChildren
  }

  /// True when the declaration sits at file scope: its parent chain reaches the source file through
  /// only code-block items and `#if` structure. Members of a type are nested in a
  /// `MemberBlockItemSyntax` instead, so they don't match. The `#if` wrappers are allowed because a
  /// top-level declaration inside an (active) `#if` clause is still a top-level declaration.
  ///
  /// TODO: decide whether to support nested types. A macro on a type nested in another type/enum/
  /// extension is valid Swift but missed here; supporting it means descending into type bodies and
  /// recording the enclosing path for a qualified name (e.g. `Namespace.InnerModule`).
  private func isTopLevel(_ node: some SyntaxProtocol) -> Bool {
    guard node.parent?.is(CodeBlockItemSyntax.self) == true else {
      return false
    }
    var current = node.parent?.parent
    while let node = current {
      if node.is(SourceFileSyntax.self) {
        return true
      }
      guard
        node.is(CodeBlockItemListSyntax.self)
          || node.is(CodeBlockItemSyntax.self)
          || node.is(IfConfigClauseSyntax.self)
          || node.is(IfConfigClauseListSyntax.self)
          || node.is(IfConfigDeclSyntax.self)
      else {
        return false
      }
      current = node.parent
    }
    return false
  }

  /// Emits one detection per recognized Expo attribute on the declaration. A declaration can in
  /// principle carry more than one (uncommon), so each is recorded independently.
  private func record(
    attributes: AttributeListSyntax,
    modifiers: DeclModifierListSyntax,
    name: String,
    kind: String,
    at node: some SyntaxProtocol
  ) {
    for element in attributes {
      guard let attribute = element.as(AttributeSyntax.self),
        let macro = DetectedMacro(rawValue: attribute.attributeName.trimmedDescription),
        detectedMacros.contains(macro)
      else {
        continue
      }
      let location = converter.location(for: node.positionAfterSkippingLeadingTrivia)
      detections.append(
        Detection(
          macro: macro,
          name: name,
          declarationKind: kind,
          accessLevel: accessLevel(of: modifiers),
          jsName: stringArgument(of: attribute),
          arguments: arguments(of: attribute),
          file: file,
          line: location.line,
          column: location.column
        )
      )
    }
  }
}

/// The spelled access modifiers, in the order Swift defines them. Other modifiers (`final`,
/// `static`, …) are not access levels and are skipped when resolving one.
private let accessModifierNames: Set<String> = ["open", "public", "package", "internal", "fileprivate", "private"]

/// The declaration's access level: the first spelled access modifier, or Swift's default of
/// `internal` when none is written. A declaration can spell at most one, so first is the only one.
private func accessLevel(of modifiers: DeclModifierListSyntax) -> String {
  for modifier in modifiers where accessModifierNames.contains(modifier.name.text) {
    return modifier.name.text
  }
  return "internal"
}

/// Every argument passed to the attribute, in source order, each as a label (or `nil` when
/// positional) plus the value expression's source text. Returns an empty array when the attribute
/// is written bare (`@ExpoModule`) or with empty parens.
private func arguments(of attribute: AttributeSyntax) -> [MacroArgument] {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self) else {
    return []
  }
  return args.map { arg in
    MacroArgument(label: arg.label?.text, value: arg.expression.trimmedDescription)
  }
}

/// The first string-literal argument of an attribute, e.g. `@JS("doWork")` -> "doWork". Returns
/// `nil` when there's no argument or it isn't a plain string literal. (Same shape the
/// `jsNameArgument` helper reads inside the macros.) Shared with the `scan-exports` surface visitor,
/// which reads the same JS-name override off `@JS`/`@ExpoModule`/`@SharedObject`.
func stringArgument(of attribute: AttributeSyntax) -> String? {
  guard let args = attribute.arguments?.as(LabeledExprListSyntax.self),
    let first = args.first,
    first.label == nil,
    let str = first.expression.as(StringLiteralExprSyntax.self),
    let segment = str.segments.first?.as(StringSegmentSyntax.self),
    str.segments.count == 1
  else {
    return nil
  }
  return segment.content.text
}
