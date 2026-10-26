import SwiftParser
import SwiftSyntax

#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// Walks `paths`, and for each `.swift` file that might contain one of `macros` or one of
/// `conformances` (the pre-filter passes it), reads the source and hands it to `process` along with the
/// file path. Returns the run's stats.
///
/// The shared core every scan command builds on: the walk, read, pre-filter, and stats are identical;
/// only what each command does per parsed file differs (`scan-modules` collects `Detection`s,
/// `scan-exports` walks a `SurfaceVisitor`), and that lives in `process`.
func scanFiles(
  paths: [String],
  macros: Set<DetectedMacro>,
  conformances: Set<String> = [],
  process: (_ source: String, _ file: String) -> Void
) -> ScanStats {
  let clock = ContinuousClock()
  let start = clock.now

  var filesScanned = 0
  var filesParsed = 0

  // Build the pre-filter once per run, not once per file.
  let prefilter = MacroPrefilter(macros: macros, conformances: conformances)

  for file in swiftFiles(in: paths) {
    guard let source = try? String(contentsOfFile: file, encoding: .utf8) else {
      writeToStandardError("warning: could not read \(file)\n")
      continue
    }
    filesScanned += 1
    // Skip the (relatively expensive) parse for files that can't contain any of the macros. A plain
    // substring scan is far cheaper than a full parse, and most files in a large tree mention none
    // of these names. See `mightContainMacro` for why this never drops a real match.
    guard mightContainMacro(in: source, prefilter: prefilter) else {
      continue
    }
    filesParsed += 1
    process(source, file)
  }

  let elapsed = (clock.now - start).components
  let durationMs = Double(elapsed.seconds) * 1000 + Double(elapsed.attoseconds) / 1e15

  return ScanStats(filesScanned: filesScanned, filesParsed: filesParsed, durationMs: durationMs)
}

/// Walks `paths`, parses each `.swift` file that might contain one of `macros`, and returns every
/// detection (in file then source order) with the accumulated `#if` warnings and the run's stats —
/// the shape `scan-modules` projects. A thin layer over `scanFiles` that accumulates the per-file
/// results.
func collectDetections(
  paths: [String],
  macros: Set<DetectedMacro>,
  configuration: ScanBuildConfiguration? = nil
) -> (detections: [Detection], warnings: [ScanWarning], stats: ScanStats) {
  var detections: [Detection] = []
  var warnings: [ScanWarning] = []
  let stats = scanFiles(paths: paths, macros: macros) { source, file in
    let result = detect(source: source, file: file, macros: macros, configuration: configuration)
    detections.append(contentsOf: result.detections)
    warnings.append(contentsOf: result.warnings)
  }
  return (detections, warnings, stats)
}

/// Parses one source string and returns its detections for the given macro set, plus the warnings
/// for `#if` conditions the configuration couldn't answer. The unit of work the tests exercise.
func detect(
  source: String,
  file: String,
  macros: Set<DetectedMacro>,
  configuration: ScanBuildConfiguration?
) -> (detections: [Detection], warnings: [ScanWarning]) {
  let tree = Parser.parse(source: source)
  let visitor = DetectionVisitor(file: file, tree: tree, detectedMacros: macros, configuration: configuration)
  visitor.walk(tree)
  return (visitor.detections, visitor.warnings)
}

// MARK: - Pre-filter

/// The spelled forms whose presence makes a file worth parsing: each macro's attribute right after an
/// `@` (`@ExpoModule`, `@JS`, …), plus bare names for the types recognized by a conformance rather than
/// an attribute (`Enumerable` for `scan-exports`). A bare name matches more loosely than an
/// `@`-prefixed one, which costs a wasted parse and never a miss.
///
/// Matching is a single pass over the UTF-8 bytes, checking the names only where an `@` or a bare
/// name's first byte occurs, rather than one search per name. It runs on every file a whole-tree scan
/// reads, far more than it parses, so it has to stay cheap. Built once per run and reused per file.
struct MacroPrefilter {
  /// The attribute names matched right after an `@`, as UTF-8.
  private let attributes: [[UInt8]]

  /// The names matched anywhere, as UTF-8.
  private let bareNames: [[UInt8]]

  init(macros: Set<DetectedMacro>, conformances: Set<String> = []) {
    attributes = macros.map { Array($0.rawValue.utf8) }
    bareNames = conformances.map { Array($0.utf8) }
  }

  /// True if `source` contains one of the attributes after an `@`, or one of the bare names.
  func matches(_ source: String) -> Bool {
    var source = source
    return source.withUTF8 { bytes in
      for index in bytes.indices {
        let byte = bytes[index]
        if byte == UInt8(ascii: "@") {
          for name in attributes where bytes.hasBytes(name, at: index + 1) {
            return true
          }
        }
        for name in bareNames where name.first == byte && bytes.hasBytes(name, at: index) {
          return true
        }
      }
      return false
    }
  }
}

extension UnsafeBufferPointer<UInt8> {
  /// True if the bytes starting at `index` begin with `prefix`.
  fileprivate func hasBytes(_ prefix: [UInt8], at index: Int) -> Bool {
    guard index + prefix.count <= count else {
      return false
    }
    for offset in prefix.indices where self[index + offset] != prefix[offset] {
      return false
    }
    return true
  }
}

/// True if the source text contains one of the pre-filter's spelled macro attributes, so it's worth
/// parsing. A deliberate over-approximation: the pattern can still match inside a comment or string,
/// in which case the file is parsed and correctly yields no detections — a wasted parse, never a
/// missed module. It assumes the attribute is written with no space after `@` (`@ExpoModule`, not
/// `@ ExpoModule`), which is universal in practice; the rare spaced form would be skipped.
func mightContainMacro(in source: String, prefilter: MacroPrefilter) -> Bool {
  return prefilter.matches(source)
}

// MARK: - File discovery

/// Directory names skipped during the recursive walk, in two groups:
/// - Build products, dependencies, and git internals (`.build`, `Pods`, `.git`, `node_modules`) are
///   never source worth scanning, and pruning them keeps the walk from descending into the bulk of
///   a monorepo's files. `node_modules` also makes any npm package root safe to pass as a scan
///   path: nested dependencies are separate packages and get scanned on their own.
/// - Test and example directories, by the layout conventions of Expo module packages (`Tests`,
///   `UITests`, `__tests__`, `__mocks__`, `example(s)`, `e2e`). Their sources are not compiled into the
///   package's product (they belong to a `test_spec` or a standalone example app), so a declaration
///   found there would name a type the consumer can't reference. This is a name-based heuristic;
///   a package keeping product sources in such a directory can declare its modules in
///   `expo-module.config.json` instead.
private let prunedDirectoryNames: Set<String> = [
  ".build", "Pods", ".git", "node_modules",
  "Tests", "UITests", "__tests__", "__mocks__", "example", "examples", "e2e",
]

/// Expands the given paths into the list of `.swift` files to parse: a file path passes through,
/// a directory is enumerated recursively (skipping `prunedDirectoryNames`). Order is deterministic
/// so output is stable across runs.
///
/// Reported paths are absolute, so the output is unambiguous and independent of the caller's working
/// directory. (A future `--root` option could emit paths relative to a given base when a portable,
/// shorter form is wanted.)
func swiftFiles(in paths: [String]) -> [String] {
  let fileManager = FileManager.default
  var result: [String] = []

  for path in paths {
    guard let isDirectory = isDirectory(atPath: path, fileManager: fileManager) else {
      writeToStandardError("warning: no such path \(path)\n")
      continue
    }

    if isDirectory {
      result.append(contentsOf: swiftFiles(inDirectory: URL(fileURLWithPath: path), fileManager: fileManager))
    } else if path.hasSuffix(".swift") {
      // A directory walk already yields absolute paths; resolve a directly-passed file the same way
      // so every reported path is absolute regardless of how it was spelled.
      result.append(URL(fileURLWithPath: path).standardizedFileURL.path)
    }
  }

  return result.sorted()
}

/// Whether `path` is a directory (following symbolic links), or `nil` if nothing exists there.
private func isDirectory(atPath path: String, fileManager: FileManager) -> Bool? {
  #if canImport(FoundationEssentials)
  var isDirectory = false
  #else
  var isDirectory: ObjCBool = false
  #endif
  guard fileManager.fileExists(atPath: path, isDirectory: &isDirectory) else {
    return nil
  }
  #if canImport(FoundationEssentials)
  return isDirectory
  #else
  return isDirectory.boolValue
  #endif
}

#if canImport(FoundationEssentials)
/// Recursively lists the `.swift` files under a directory, without descending into pruned directories.
/// `FoundationEssentials`, used outside Apple platforms, has no directory enumerator, so each directory
/// is listed on its own and the walk recurses into the subdirectories that aren't pruned. Like the
/// enumerator walk on Apple platforms, it skips names starting with a dot and doesn't follow symbolic
/// links to directories.
private func swiftFiles(inDirectory directory: URL, fileManager: FileManager) -> [String] {
  return swiftFiles(inDirectoryAtPath: directory.path, fileManager: fileManager)
}

private func swiftFiles(inDirectoryAtPath directory: String, fileManager: FileManager) -> [String] {
  guard let names = try? fileManager.contentsOfDirectory(atPath: directory) else {
    return []
  }

  var result: [String] = []
  for name in names where !name.hasPrefix(".") {
    let path = directory + "/" + name
    // `attributesOfItem` doesn't follow a symbolic link, so a link reads as `.typeSymbolicLink`.
    let type = (try? fileManager.attributesOfItem(atPath: path))?[.type] as? FileAttributeType
    if type == .typeDirectory {
      if !prunedDirectoryNames.contains(name) {
        result.append(contentsOf: swiftFiles(inDirectoryAtPath: path, fileManager: fileManager))
      }
    } else if name.hasSuffix(".swift") {
      result.append(path)
    }
  }
  return result
}
#else
/// Recursively enumerates `.swift` files under a directory, calling `skipDescendants()` on any
/// pruned directory so its subtree is never read. Uses the URL enumerator (rather than the
/// path-based one) precisely because it supports skipping a subtree mid-walk.
///
/// Directory-ness is read from `hasDirectoryPath` (the enumerator sets a trailing slash on the URLs
/// it yields) rather than `resourceValues(forKeys: [.isDirectoryKey])`, which re-`stat`s each entry.
/// The walk is the dominant cost of a whole-tree scan, and skipping that per-entry stat measurably
/// shortens it.
private func swiftFiles(inDirectory directory: URL, fileManager: FileManager) -> [String] {
  guard
    let enumerator = fileManager.enumerator(
      at: directory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    )
  else {
    return []
  }

  var result: [String] = []
  for case let url as URL in enumerator {
    if url.hasDirectoryPath {
      if prunedDirectoryNames.contains(url.lastPathComponent) {
        enumerator.skipDescendants()
      }
    } else if url.pathExtension == "swift" {
      result.append(url.path)
    }
  }
  return result
}
#endif
