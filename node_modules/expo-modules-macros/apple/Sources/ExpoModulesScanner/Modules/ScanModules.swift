import SwiftParser

#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// The scanner's public entry point. Argument parsing, subcommand dispatch, and usage text live in
/// the CLI target; this just runs a command and writes its JSON report to stdout.
///
/// The detection model (`Detection`, `DetectionVisitor`, …) stays `internal`: tests reach it via
/// `@testable import`, and the CLI only needs these entries, so nothing else is exposed.
public enum Scanner {
  /// Runs the `scan-modules` command over `paths`, prints the JSON report to stdout, and returns a
  /// process exit code: `0` on success, `1` if encoding fails. (The deep `scan-exports` command has
  /// its own `runExports` entry returning its own result type.)
  ///
  /// `defines` (the `--define` options) asserts conditional compilation flags; see `scanModules`
  /// for how they and platforms shape each module's `platforms` list.
  public static func runModules(paths: [String], defines: [String] = []) -> Int32 {
    let result = scanModules(paths: paths, defines: Set(defines))

    do {
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
      let data = try encoder.encode(result)
      writeToStandardOutput(String(decoding: data, as: UTF8.self) + "\n")
      return 0
    } catch {
      writeToStandardError("error: failed to encode results: \(error)\n")
      return 1
    }
  }
}

/// One module in the `scan-modules` output. Trimmed to what `expo-modules-autolinking` needs to
/// register a module: the Swift class name, the JS name it registers under, the platforms that
/// include it, and the file it's in. The richer fields the visitor captures (declaration kind, raw
/// macro arguments, line/column) are dropped here — they're redundant for this command (the macro
/// is always `@ExpoModule` on a class) and the deep `scan-exports` surface carries the richer
/// per-member detail instead.
struct ScannedModule: Codable, Equatable {
  /// The Swift class name the module is declared as.
  let name: String

  /// The fully-resolved JS module name: the `@ExpoModule("Foo")` override when present, otherwise the
  /// class name. Resolved here (rather than left `nil`) so it matches how the macro derives the name
  /// and the consumer never has to apply the fallback itself.
  let jsName: String

  /// The class's spelled access modifier (`open`, `public`, `package`, `fileprivate`, `private`),
  /// or `internal` when none is written. The generated modules provider references the class from
  /// the app target, which requires `public`/`open`, so the consumer uses this to skip inaccessible
  /// classes with a diagnostic instead of emitting a provider that fails to compile.
  let accessLevel: String

  /// The Apple OSes whose builds include this class, spelled as `os(...)` spells them and compared
  /// case-sensitively. An unconditional module lists every OS. Empty means no build is known to
  /// include it, because the enclosing conditions depend on flags not asserted with `--define` or
  /// on conditions a static scan cannot answer (those are reported in `warnings`). The consumer
  /// must not assume such a class exists.
  let platforms: [String]

  /// Source file the module was found in, relative to the path the scanner was invoked with.
  let file: String
}

/// Version of the `scan-modules` output shape. Bumped on any breaking change to the envelope or to
/// `ScannedModule`, so `expo-modules-autolinking` can verify it understands the output before
/// trusting it (and fall back to config-declared modules when it doesn't). Version 2 added the
/// per-module `platforms` list and made the module list platform-agnostic.
let scanModulesSchemaVersion = 2

/// The `scan-modules` result: the detected modules plus the stats describing the run. Encoded as the
/// command's JSON output. (`scan-exports` returns its own `ScanExportsResult` shape; the two commands
/// serve different consumers and don't share an envelope.)
struct ScanModulesResult: Codable, Equatable {
  let schemaVersion: Int
  let modules: [ScannedModule]

  /// Warnings for `#if` conditions the scan couldn't answer statically (see `ScanWarning`). Carried
  /// in the report rather than on stderr so the consumer can attach them to its own output.
  let warnings: [ScanWarning]

  let stats: ScanStats
}

/// The Apple OSes a scan attributes modules to. `condition` is what `os(...)` matches; `reported`
/// is what the JSON carries. They are identical today, but stated separately so the output
/// contract cannot drift if the matcher's spelling changes.
private let platformUniverse: [(condition: String, reported: String)] = [
  (condition: "iOS", reported: "iOS"),
  (condition: "macOS", reported: "macOS"),
  (condition: "tvOS", reported: "tvOS"),
  (condition: "watchOS", reported: "watchOS"),
  (condition: "visionOS", reported: "visionOS"),
]

/// Scans the given paths for top-level `@ExpoModule` types and returns every module found in any
/// `#if` branch (in file then source order), each with the platforms whose builds include it, plus
/// the stats for the run — the `scan-modules` command. Kept separate from the public entry (and
/// `internal`) so tests can drive it without going through argv/stdout.
///
/// Each file is parsed once and walked once per platform (plus once unconditionally to enumerate
/// every module): a module's `platforms` are the OSes whose evaluated walk reached it, given the
/// asserted `defines`. The scanner reports the facts; filtering to the platform being linked is the
/// consumer's call.
func scanModules(paths: [String], defines: Set<String> = []) -> ScanModulesResult {
  var modules: [ScannedModule] = []
  var warnings: [ScanWarning] = []
  var seenWarnings = Set<ScanWarning>()

  let stats = scanFiles(paths: paths, macros: [.expoModule]) { source, file in
    let tree = Parser.parse(source: source)

    // The unconditional walk enumerates every module in the file, in source order.
    let allModules = DetectionVisitor(file: file, tree: tree, detectedMacros: [.expoModule], configuration: nil)
    allModules.walk(tree)

    // One evaluated walk per OS attributes each module to the platforms that include it. The walks
    // are cheap relative to the parse, which is shared.
    var platformsByDetection: [String: [String]] = [:]
    for platform in platformUniverse {
      let configuration = ScanBuildConfiguration(platform: platform.condition, defines: defines)
      let visitor = DetectionVisitor(
        file: file,
        tree: tree,
        detectedMacros: [.expoModule],
        configuration: configuration
      )
      visitor.walk(tree)
      for detection in visitor.detections {
        platformsByDetection[detectionKey(detection), default: []].append(platform.reported)
      }
      // The same unanswerable condition diagnoses identically in every per-platform walk; report
      // it once.
      for warning in visitor.warnings where seenWarnings.insert(warning).inserted {
        warnings.append(warning)
      }
    }

    for detection in allModules.detections {
      // Resolve the JS name the way the macro does: explicit `@ExpoModule("Foo")` override, else
      // the class name.
      modules.append(
        ScannedModule(
          name: detection.name,
          jsName: detection.jsName ?? detection.name,
          accessLevel: detection.accessLevel,
          platforms: platformsByDetection[detectionKey(detection)] ?? [],
          file: detection.file
        )
      )
    }
  }

  return ScanModulesResult(
    schemaVersion: scanModulesSchemaVersion,
    modules: modules,
    warnings: warnings,
    stats: stats
  )
}

/// Identifies one declaration across the per-platform walks of the same tree: the source position
/// is unique within a file, and the name guards against any position ambiguity.
private func detectionKey(_ detection: Detection) -> String {
  return "\(detection.line):\(detection.column):\(detection.name)"
}
