import SwiftDiagnostics
import SwiftSyntax
import SwiftSyntaxBuilder
import SwiftSyntaxMacros

/// Member + extension macro applied to an `enum` whose cases each carry one associated value: a typed
/// union of the payload types (`A | B | C` in TypeScript). The enum is a tagged union at the Swift
/// level, so the author switches over it exhaustively with each payload keeping its static type, and
/// the macro synthesizes the conversion surface that makes it a JS boundary type:
///
/// - `decodableKinds`: the union of the payloads' `decodableKinds`, the JS kinds the union can decode.
/// - `decode(_:in:)`: an ordered decode that tries each case's payload converter in declaration order
///   and returns the first case that decodes; when none does, it throws
///   `Exceptions.UnionCaseMismatch` naming the union, the JS kind received, and the alternatives.
///   Only the overload taking a borrowed `JavaScriptUnownedValue` is emitted. The overload taking an
///   owning `JavaScriptValue` comes from the `JavaScriptDecodable` default, which borrows the value
///   and calls this one.
/// - `encode(_:in:)`: a `switch` over the cases, encoding the payload through its own type.
/// - `as(_:)`: one throwing overload per case, keyed by the payload's metatype, returning that payload
///   (`try source.as(String.self)` is `String`; `try? source.as(String.self)` is `String?`). It unwraps
///   by type without naming the case and throws `Exceptions.UnionCaseMismatch` when the union holds a
///   different case. Since a payload type may appear only once, each overload is unambiguous, and asking
///   for a type the union doesn't carry is a compile error.
///
/// The type is auto-conformed to `JavaScriptDecodable` and `JavaScriptEncodable`, so it can be a `@JS`
/// argument or return value, an `@Event` payload, or nested inside an optional, array, or dictionary.
/// Author-facing shape:
///
///   @Union
///   enum Source {
///     case text(String)
///     case options(SourceOptions)   // a @Record
///   }
///
/// Discrimination is structural and order-dependent: the first case whose payload decodes wins. When
/// two payload shapes overlap (two records with compatible fields, `Int` and `Double`), the earlier
/// case matches; the author orders the more specific case first. A case may not repeat another case's
/// payload type, since it could never be chosen.
///
/// The named-union counterpart of core's `Either`: any number of named cases instead of two anonymous
/// slots, no `Any?` box, and an exhaustive `switch` as the primary way to read it (`as(_:)` covers the
/// one-type lookup `Either.as(_:)` offered, with the same throwing shape).
public struct UnionMacro: MemberMacro, ExtensionMacro {
  public static func expansion(
    of node: AttributeSyntax,
    providingMembersOf declaration: some DeclGroupSyntax,
    conformingTo protocols: [TypeSyntax],
    in context: some MacroExpansionContext
  ) throws -> [DeclSyntax] {
    let union = try validatedUnion(of: declaration)

    var members: [DeclSyntax] = []

    // A single never-called member that makes the compiler verify each payload type converts both
    // ways. Each case keeps its own named assertion inside, so the conformance diagnostic names the
    // offending case (see `typeConformanceAssertions`). Emitted first so a non-conforming payload
    // reports the clear "requires that '…' conform to …" error ahead of the noisier "no member
    // 'decode'"/"'encode'" errors from the conversion code below.
    let assertions = union.cases.map { ConformanceAssertion(name: $0.name, types: [$0.payloadType]) }
    if let assertionMember = typeConformanceAssertions(for: assertions, constraint: unionPayloadProtocolName) {
      members.append(assertionMember)
    }

    members.append(decodableKindsProperty(union: union))
    members.append(decodeMethod(union: union))
    members.append(encodeMethod(union: union))
    members.append(contentsOf: accessorMethods(union: union))
    members.append(payloadTypeNameProperty(union: union))
    return members
  }

  /// Auto-conforms the enum to `JavaScriptDecodable` and `JavaScriptEncodable`, the protocols whose
  /// requirements are exactly the `decode`/`encode` members synthesized above. A conformance the author
  /// already spelled out in the inheritance clause is not repeated.
  public static func expansion(
    of node: AttributeSyntax,
    attachedTo declaration: some DeclGroupSyntax,
    providingExtensionsOf type: some TypeSyntaxProtocol,
    conformingTo protocols: [TypeSyntax],
    in context: some MacroExpansionContext
  ) throws -> [ExtensionDeclSyntax] {
    // Diagnostics are owned by the member expansion; an invalid declaration silently emits no extension
    // here, so each error is reported once and no witness-less conformance piles "does not conform"
    // errors on top of it.
    guard (try? validatedUnion(of: declaration)) != nil else {
      return []
    }
    // The compiler hands over only the conformances the type still lacks; the test harness passes the
    // declared list verbatim, so filter against the inheritance clause here as well.
    let missing = protocols.filter { protocolType in
      guard let name = baseIdentifier(of: protocolType) else {
        return true
      }
      return !inheritsProtocol(named: name, in: declaration)
    }
    guard !missing.isEmpty else {
      return []
    }

    let conformances = missing.map { $0.trimmedDescription }.joined(separator: ", ")
    let ext: DeclSyntax = """
      extension \(type.trimmed): \(raw: conformances) {}
      """
    guard let extDecl = ext.as(ExtensionDeclSyntax.self) else {
      return []
    }
    return [extDecl]
  }
}

// MARK: - Union model

/// A validated `@Union` enum: its spelled name (for the mismatch error) and its cases in declaration
/// order (the decode order).
private struct UnionType {
  let name: String
  let cases: [UnionCase]
}

/// One alternative of the union: the case name, its single payload type as written, and the payload's
/// argument label when the author gave it one (`case id(value: Int)`), needed to construct the case.
private struct UnionCase {
  let name: String
  let payloadType: String
  let payloadLabel: String?

  /// The expression constructing this case from a `payload` local: `.id(payload)`, or
  /// `.id(value: payload)` for a labeled associated value.
  var construction: String {
    if let payloadLabel {
      return ".\(name)(\(payloadLabel): payload)"
    }
    return ".\(name)(payload)"
  }

  /// The pattern binding this case's payload to a `payload` local in a `switch`.
  var pattern: String {
    return ".\(name)(let payload)"
  }
}

/// Reads and validates the union off the attached declaration. Every check is a compile error located
/// on the offending node: the macro must be on a non-generic `enum` with at least one case, and every
/// case must carry exactly one associated value that holds no closure, its payload type distinct from
/// every earlier case's.
private func validatedUnion(of declaration: some DeclGroupSyntax) throws -> UnionType {
  guard let enumDecl = declaration.as(EnumDeclSyntax.self) else {
    throw MacroExpansionErrorMessage("@Union can only be applied to an enum")
  }
  if let genericParameterClause = enumDecl.genericParameterClause {
    throw DiagnosticsError(diagnostics: [
      Diagnostic(
        node: genericParameterClause,
        message: UnionDiagnosticMessage(
          "@Union cannot be applied to a generic enum: each case's payload type must be concrete so the macro can select its converter.",
          id: "union-generic-enum"
        )
      )
    ])
  }

  var cases: [UnionCase] = []
  var seenPayloadTypes: [String: String] = [:]
  var diagnostics: [Diagnostic] = []

  for member in enumDecl.memberBlock.members {
    guard let caseDecl = member.decl.as(EnumCaseDeclSyntax.self) else {
      continue
    }
    for element in caseDecl.elements {
      let name = element.name.text
      guard let parameters = element.parameterClause?.parameters, !parameters.isEmpty else {
        diagnostics.append(
          Diagnostic(
            node: element,
            message: UnionDiagnosticMessage(
              "@Union case '\(name)' must carry exactly one associated value: the type this alternative decodes from. A payload-less enum is not a union; make it a raw-value enum conforming to 'Enumerable' instead.",
              id: "union-case-without-payload"
            )
          )
        )
        continue
      }
      guard parameters.count == 1, let parameter = parameters.first else {
        diagnostics.append(
          Diagnostic(
            node: element,
            message: UnionDiagnosticMessage(
              "@Union case '\(name)' must carry exactly one associated value, but has \(parameters.count). Group them in a @Record type and use it as the single payload.",
              id: "union-case-with-multiple-payloads"
            )
          )
        )
        continue
      }

      // A default on the associated value can never apply: the macro constructs the case from the
      // decoded JS value every time, and there is no "omitted" slot the way a `@Record` property has.
      // Left in place it would read as a JS-side default that doesn't exist, so it's rejected with a
      // fix-it that removes it.
      if let defaultValue = parameter.defaultValue {
        diagnostics.append(defaultValueDiagnostic(for: parameter, defaultValue: defaultValue, caseName: name))
        continue
      }

      // A payload is decoded from and encoded to JavaScript, and a native closure can't be encoded.
      if let payloadClosure = firstFunctionType(in: parameter.type) {
        diagnostics.append(
          Diagnostic(
            node: payloadClosure,
            message: UnionDiagnosticMessage(
              "@Union case '\(name)' can't carry a closure: the payload is also encoded to JavaScript, and a native closure can't be encoded.",
              id: "union-closure-payload"
            )
          )
        )
        continue
      }

      let payloadType = parameter.type.trimmedDescription
      // Alternatives decode in declaration order and the first success wins, so a case whose payload
      // type repeats an earlier case's is unreachable: an exact-spelling duplicate is an error. (An
      // overlap between *different* types, like `Int` and `Double`, is the author's ordering call and
      // isn't checked here.)
      let normalizedType = payloadType.filter { !$0.isWhitespace }
      if let earlierCase = seenPayloadTypes[normalizedType] {
        diagnostics.append(
          Diagnostic(
            node: element,
            message: UnionDiagnosticMessage(
              "@Union case '\(name)' repeats the payload type '\(payloadType)' of case '\(earlierCase)' and can never be decoded: alternatives are tried in declaration order and the first match wins.",
              id: "union-duplicate-payload-type"
            )
          )
        )
        continue
      }
      seenPayloadTypes[normalizedType] = name

      // `firstName` is the associated value's label (`case id(value: Int)`); a `_` label is the same as
      // none for construction purposes.
      let label = parameter.firstName.flatMap { $0.text == "_" ? nil : $0.text }
      cases.append(UnionCase(name: name, payloadType: payloadType, payloadLabel: label))
    }
  }

  if !diagnostics.isEmpty {
    throw DiagnosticsError(diagnostics: diagnostics)
  }
  if cases.isEmpty {
    throw MacroExpansionErrorMessage("@Union requires at least one case carrying an associated value")
  }
  return UnionType(name: enumDecl.name.text, cases: cases)
}

// MARK: - Synthesized members

/// `decode(_:in:)`: tries each case's payload converter in declaration order and returns the first
/// case that decodes. Only the overload taking a borrowed `JavaScriptUnownedValue` is emitted; the
/// overload taking an owning `JavaScriptValue` comes from the `JavaScriptDecodable` default, which
/// borrows the value and calls this one. Each payload decode receives the same borrowed value. The
/// value's kind is read once, and each candidate is gated on its payload's `decodableKinds`, so a case
/// that can't accept that kind is skipped with a mask test instead of a thrown and discarded error. `try?` turns a candidate's failure into "try the next one" without erasing the
/// payload (each `payload` local keeps its concrete type); the candidate's own error is discarded, since
/// with several alternatives there is no single failure to surface. When no alternative accepts the
/// value the factory throws `Exceptions.UnionCaseMismatch`, naming the union, the JS kind of the value
/// received, and every payload type the union accepts. `JavaScriptUnownedValue` has no `kind`, so the
/// error reads it from an owning copy; the copy is made only on this failure path.
private func decodeMethod(union: UnionType) -> DeclSyntax {
  var lines: [String] = ["  let kind = JavaScriptValueKinds(of: value)"]
  for unionCase in union.cases {
    let payloadType = expressionType(unionCase.payloadType)
    lines.append(
      "  if \(payloadType).decodableKinds.contains(kind), let payload = try? \(payloadType).decode(value, in: runtime) {"
    )
    lines.append("    return \(unionCase.construction)")
    lines.append("  }")
  }
  let expected = union.cases.map { "\"\($0.payloadType)\"" }.joined(separator: ", ")
  let mismatch =
    "(unionName: \"\(union.name)\", received: value.copied(in: runtime).kind.rawValue, expected: [\(expected)])"
  lines.append("  throw Exceptions.UnionCaseMismatch(\(mismatch))")
  let body = lines.joined(separator: "\n")
  return """
    @JavaScriptActor
    public static func decode(_ value: borrowing JavaScriptUnownedValue, in runtime: borrowing JavaScriptRuntime) throws -> Self {
    \(raw: body)
    }
    """
}

/// `decodableKinds`: the union of the payloads' kinds, so a union nested in another union, or wrapped
/// in an optional, is skipped as precisely as its payloads are.
private func decodableKindsProperty(union: UnionType) -> DeclSyntax {
  let kinds = union.cases.map { "\(expressionType($0.payloadType)).decodableKinds" }
  // An option set's array literal is the union of its elements, which reads like the case list. The
  // optimizer folds it to a constant after specialization, the same as a chain of `union(_:)` calls.
  let expression = kinds.count == 1 ? kinds[0] : "[\(kinds.joined(separator: ", "))]"
  return """
    public static var decodableKinds: JavaScriptValueKinds {
      return \(raw: expression)
    }
    """
}

/// `encode(_:in:)`: a `switch` over the cases, each encoding its payload through the payload type's
/// own `encode`. Exhaustive by construction, so a case added later without re-expansion can't slip
/// through silently.
private func encodeMethod(union: UnionType) -> DeclSyntax {
  var lines: [String] = ["  switch value {"]
  for unionCase in union.cases {
    lines.append("  case \(unionCase.pattern):")
    lines.append("    return try \(expressionType(unionCase.payloadType)).encode(payload, in: runtime)")
  }
  lines.append("  }")
  let body = lines.joined(separator: "\n")
  return """
    @JavaScriptActor
    public static func encode(_ value: Self, in runtime: borrowing JavaScriptRuntime) throws -> JavaScriptValue {
    \(raw: body)
    }
    """
}

/// `as(_:)`: a typed accessor per case, selected by the payload's metatype rather than the case name,
/// so a caller that only knows the type it wants writes `try value.as(String.self)` and gets a `String`.
/// When
/// the union holds a different case it throws `Exceptions.UnionCaseMismatch`, the same error `decode`
/// throws, with the held case's payload type as `received` and the requested type as `expected`. The
/// overloads can't collide because a payload type appears in at most one case (enforced above), and a
/// metatype the union doesn't carry fails to resolve at compile time. `as` is a keyword, so the
/// declaration is backticked; a call site after a dot (`value.as(…)`) needs no backticks. The parameter
/// is spelled in expression form (`T!` rewritten to `T?`), since `T!.Type` isn't valid.
private func accessorMethods(union: UnionType) -> [DeclSyntax] {
  return union.cases.map { unionCase in
    let payloadType = expressionType(unionCase.payloadType)
    let mismatch =
      "(unionName: \"\(union.name)\", received: _payloadTypeName, expected: [\"\(unionCase.payloadType)\"])"
    return """
      public func `as`(_ type: \(raw: payloadType).Type) throws -> \(raw: payloadType) {
        if case \(raw: unionCase.pattern) = self {
          return payload
        }
        throw Exceptions.UnionCaseMismatch(\(raw: mismatch))
      }
      """
  }
}

/// `_payloadTypeName`: the spelled payload type of the case the union currently holds, as written in the
/// declaration, so every `as(_:)` overload reports the actual type in its mismatch error through one
/// shared `switch` instead of each overload enumerating the other cases.
private func payloadTypeNameProperty(union: UnionType) -> DeclSyntax {
  var lines: [String] = ["  switch self {"]
  for unionCase in union.cases {
    lines.append("  case .\(unionCase.name):")
    lines.append("    return \"\(unionCase.payloadType)\"")
  }
  lines.append("  }")
  let body = lines.joined(separator: "\n")
  return """
    private var _payloadTypeName: String {
    \(raw: body)
    }
    """
}

// MARK: - Diagnostics

/// The error for a default value on a case's associated value, attached to the `= …` clause and carrying
/// a fix-it that deletes it (trimming the space the type carried before the `=`).
private func defaultValueDiagnostic(
  for parameter: EnumCaseParameterSyntax,
  defaultValue: InitializerClauseSyntax,
  caseName: String
) -> Diagnostic {
  let fixIt = FixIt(
    message: UnionFixItMessage("Remove the default value", id: "union-remove-default-value"),
    changes: [
      .replace(
        oldNode: Syntax(parameter),
        newNode: Syntax(
          parameter
            .with(\.type, parameter.type.with(\.trailingTrivia, []))
            .with(\.defaultValue, nil)
        )
      )
    ]
  )
  let message = UnionDiagnosticMessage(
    "@Union case '\(caseName)' cannot give its associated value a default: the payload is always decoded from the JavaScript value, so the default would never apply. Remove '\(defaultValue.trimmedDescription)'.",
    id: "union-case-default-value"
  )
  return Diagnostic(node: defaultValue, message: message, fixIts: [fixIt])
}

private struct UnionDiagnosticMessage: DiagnosticMessage {
  let message: String
  let diagnosticID: MessageID
  let severity: DiagnosticSeverity = .error

  init(_ message: String, id: String) {
    self.message = message
    self.diagnosticID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}

private struct UnionFixItMessage: FixItMessage {
  let message: String
  let fixItID: MessageID

  init(_ message: String, id: String) {
    self.message = message
    self.fixItID = MessageID(domain: "ExpoModulesMacros", id: id)
  }
}
