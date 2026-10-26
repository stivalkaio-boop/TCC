import SwiftIfConfig
import SwiftSyntax

/// The Apple OSes `scan-exports` attributes declarations to, in the order they are reported. Spelled
/// as `os(...)` spells them.
let applePlatforms = ["iOS", "macOS", "tvOS", "watchOS", "visionOS"]

/// The platform names `@available` accepts for each reported OS, including the legacy `OSX`. Other
/// names (`iOSApplicationExtension`, `macCatalyst`, `swift`, …) do not change where a declaration is
/// built for an app, so they are ignored.
private let availabilityPlatformNames: [String: String] = [
  "iOS": "iOS",
  "macOS": "macOS",
  "OSX": "macOS",
  "tvOS": "tvOS",
  "watchOS": "watchOS",
  "visionOS": "visionOS",
]

/// Answers which platforms build a declaration in one file: those whose `#if` evaluation keeps it,
/// less those an `@available` attribute on it or on an enclosing type makes unavailable. The `#if`
/// regions are evaluated once per platform for the whole file. Each platform also carries the
/// deprecation the declaration's own `@available` attributes give it there.
///
/// A condition the scan cannot answer (`#if DEBUG`, `targetEnvironment`, a non-SDK `canImport`)
/// makes its region inactive on every platform, so a declaration under one is built nowhere.
struct PlatformResolver {
  private let regions: [(platform: String, regions: ConfiguredRegions)]

  init(tree: SourceFileSyntax) {
    regions = applePlatforms.map { platform in
      (platform, tree.configuredRegions(in: ScanBuildConfiguration(platform: platform, defines: [])))
    }
  }

  /// The platforms that build `node`, in `applePlatforms` order. Empty when none does.
  func platforms(of node: some SyntaxProtocol) -> [ExportedPlatform] {
    let availability = Availability(of: node)
    return regions.compactMap { platform, regions in
      guard regions.isActive(node) == .active, !availability.isUnavailable(on: platform) else {
        return nil
      }
      return ExportedPlatform(
        name: platform,
        introduced: availability.introduced[platform],
        deprecated: availability.deprecation(on: platform)
      )
    }
  }
}

/// What the `@available` attributes on a declaration and its enclosing declarations say. A member
/// cannot be more available than the type it is declared in, so the attributes combine: a platform
/// any of them makes unavailable is unavailable, and the latest introduced version wins.
/// Deprecations are read from the declaration's own attributes only.
private struct Availability {
  private var unavailable: Set<String> = []
  private var isUnavailableEverywhere = false
  private(set) var introduced: [String: String] = [:]
  /// The deprecation from `@available(*, deprecated, ...)`, which applies on every platform.
  private var deprecatedEverywhere: ExportedDeprecation?
  /// The deprecations from attributes that name a platform.
  private var deprecated: [String: ExportedDeprecation] = [:]

  init(of node: some SyntaxProtocol) {
    var current: Syntax? = Syntax(node)
    var isOwn = true
    while let decl = current {
      if let attributes = decl.asProtocol(WithAttributesSyntax.self)?.attributes {
        for element in attributes {
          if let attribute = element.as(AttributeSyntax.self),
            attribute.attributeName.trimmedDescription == "available",
            case .availability(let arguments) = attribute.arguments
          {
            read(arguments, readsDeprecation: isOwn)
          }
        }
      }
      isOwn = false
      current = decl.parent
    }
  }

  func isUnavailable(on platform: String) -> Bool {
    return isUnavailableEverywhere || unavailable.contains(platform)
  }

  /// The deprecation on `platform`: the platform's own, with any field it leaves out taken from the
  /// `*` one.
  func deprecation(on platform: String) -> ExportedDeprecation? {
    switch (deprecated[platform], deprecatedEverywhere) {
    case (nil, let everywhere):
      return everywhere
    case (let own?, nil):
      return own
    case (let own?, let everywhere?):
      return own.filling(from: everywhere)
    }
  }

  /// Reads one attribute. The long form names one platform (or `*`) first and then what applies to
  /// it: `@available(iOS, introduced: 16)`, `@available(tvOS, unavailable)`,
  /// `@available(*, deprecated, renamed: "other")`. The shorthand lists platforms with versions:
  /// `@available(iOS 17, macOS 14, *)`.
  ///
  /// A long-form attribute deprecates its platform when it writes `deprecated` (bare or with a
  /// version) or `obsoleted:`. `message:` and `renamed:` describe that deprecation, and are ignored
  /// when the attribute deprecates nothing.
  private mutating func read(_ arguments: AvailabilityArgumentListSyntax, readsDeprecation: Bool) {
    guard case .token(let first) = arguments.first?.argument else {
      for argument in arguments {
        if case .availabilityVersionRestriction(let restriction) = argument.argument,
          let platform = availabilityPlatformNames[restriction.platform.text],
          let version = restriction.version
        {
          raiseIntroduced(on: platform, to: version.trimmedDescription)
        }
      }
      return
    }
    let isWildcard = first.tokenKind == .binaryOperator("*")
    let platform = availabilityPlatformNames[first.text]
    guard isWildcard || platform != nil else {
      return
    }
    var deprecation = ExportedDeprecation()
    var isDeprecated = false
    for argument in arguments.dropFirst() {
      switch argument.argument {
      case .token(let token) where token.text == "unavailable":
        if let platform {
          unavailable.insert(platform)
        } else {
          isUnavailableEverywhere = true
        }
      case .token(let token) where token.text == "deprecated":
        isDeprecated = true
      case .availabilityLabeledArgument(let labeled):
        switch (labeled.label.text, labeled.value) {
        case ("introduced", .version(let version)):
          if let platform {
            raiseIntroduced(on: platform, to: version.trimmedDescription)
          }
        case ("deprecated", .version(let version)):
          isDeprecated = true
          deprecation.since = version.trimmedDescription
        case ("obsoleted", .version(let version)):
          isDeprecated = true
          deprecation.obsoleted = version.trimmedDescription
        case ("message", .string(let literal)):
          deprecation.message = decodedText(of: literal)
        case ("renamed", .string(let literal)):
          deprecation.renamed = decodedText(of: literal)
        default:
          continue
        }
      default:
        continue
      }
    }
    guard readsDeprecation, isDeprecated else {
      return
    }
    if let platform {
      deprecated[platform] = deprecated[platform].map { deprecation.filling(from: $0) } ?? deprecation
    } else {
      deprecatedEverywhere = deprecatedEverywhere.map { deprecation.filling(from: $0) } ?? deprecation
    }
  }

  private mutating func raiseIntroduced(on platform: String, to version: String) {
    if let current = introduced[platform], !isVersion(version, laterThan: current) {
      return
    }
    introduced[platform] = version
  }
}

extension ExportedDeprecation {
  /// This deprecation with each field it leaves out taken from `other`.
  fileprivate func filling(from other: ExportedDeprecation) -> ExportedDeprecation {
    return ExportedDeprecation(
      since: since ?? other.since,
      obsoleted: obsoleted ?? other.obsoleted,
      message: message ?? other.message,
      renamed: renamed ?? other.renamed
    )
  }
}

/// The value of a string literal in an attribute, with its escape sequences decoded: `\"` reads as
/// `"`, `\n` as a line break, and `\u{2192}` as `→`. An escaped line break in a multi-line literal
/// joins the lines, as in Swift. An escape that isn't valid is kept as written.
private func decodedText(of literal: SimpleStringLiteralExprSyntax) -> String {
  let text = literal.segments.map(\.content.text).joined()
  var result = ""
  var index = text.startIndex
  while index < text.endIndex {
    let character = text[index]
    index = text.index(after: index)
    guard character == "\\", index < text.endIndex else {
      result.append(character)
      continue
    }
    let escaped = text[index]
    index = text.index(after: index)
    switch escaped {
    case "0":
      result.append("\0")
    case "n":
      result.append("\n")
    case "r":
      result.append("\r")
    case "t":
      result.append("\t")
    case "\"", "'", "\\":
      result.append(escaped)
    case "\n", "\r\n":
      continue
    case "u":
      if text[index...].hasPrefix("{"), let close = text[index...].firstIndex(of: "}"),
        let scalarValue = UInt32(text[text.index(after: index)..<close], radix: 16),
        let scalar = Unicode.Scalar(scalarValue)
      {
        result.unicodeScalars.append(scalar)
        index = text.index(after: close)
      } else {
        result.append("\\u")
      }
    default:
      result.append("\\")
      result.append(escaped)
    }
  }
  return result
}

/// Compares two dotted version spellings component by component, treating a missing component as
/// `0`, so `17` and `17.0` are equal.
private func isVersion(_ lhs: String, laterThan rhs: String) -> Bool {
  let left = lhs.split(separator: ".").map { Int($0) ?? 0 }
  let right = rhs.split(separator: ".").map { Int($0) ?? 0 }
  for index in 0..<max(left.count, right.count) {
    let l = index < left.count ? left[index] : 0
    let r = index < right.count ? right[index] : 0
    if l != r {
      return l > r
    }
  }
  return false
}

/// The spelled access modifier of a declaration (`open`, `public`, `package`, `internal`,
/// `fileprivate`, `private`), or `nil` when none is written. A modifier with a detail, like the
/// `private` in `private(set)`, limits only the setter, so it is not the declaration's.
func spelledAccessLevel(of modifiers: DeclModifierListSyntax) -> String? {
  return modifiers.first { modifier in
    modifier.detail == nil && accessModifierNames.contains(modifier.name.text)
  }?.name.text
}

private let accessModifierNames: Set<String> = ["open", "public", "package", "internal", "fileprivate", "private"]
