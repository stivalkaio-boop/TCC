import SwiftIfConfig
import SwiftSyntax

/// The build configuration that `#if` conditions are evaluated against during a scan, built from
/// the CLI's `--platform` and `--define` options. The scan is static: it knows the target OS and
/// the spelled compilation flags, and nothing else. Every condition it cannot answer throws, which
/// SwiftIfConfig turns into an inactive region plus a diagnostic, so an unanswerable `#if` skips
/// its declarations and surfaces a warning instead of guessing.
struct ScanBuildConfiguration: BuildConfiguration {
  /// The target OS name to answer `os(...)` with, as spelled in the condition (`iOS`, `macOS`,
  /// `tvOS`, `watchOS`, `visionOS`; compared case-insensitively). A scan without a target OS runs
  /// without a configuration at all (the platform-agnostic union scan), so this is always known.
  let platform: String

  /// The conditional compilation flags treated as set, from repeated `--define` options.
  let defines: Set<String>

  func isCustomConditionSet(name: String) throws -> Bool {
    return defines.contains(name)
  }

  func isActiveTargetOS(name: String) throws -> Bool {
    return name.lowercased() == platform.lowercased()
  }

  /// The scan evaluates only Apple OSes, which all produce Mach-O, as `objectFormat(...)` spells it.
  func isActiveTargetObjectFormat(name: String) throws -> Bool {
    return name == "MachO"
  }

  // MARK: - Unanswerable conditions

  // These vary within a single platform's build (device vs simulator, arm64 vs x86_64) or depend
  // on the consumer's toolchain, so a static scan has no correct answer. Throwing makes the region
  // inactive and emits a warning naming the condition.

  func hasFeature(name: String) throws -> Bool {
    throw ScanConfigurationError("cannot evaluate 'hasFeature(\(name))' in a static scan")
  }

  func hasAttribute(name: String) throws -> Bool {
    throw ScanConfigurationError("cannot evaluate 'hasAttribute(\(name))' in a static scan")
  }

  func canImport(importPath: [(TokenSyntax, String)], version: CanImportVersion) throws -> Bool {
    let module = importPath.map(\.1).joined(separator: ".")

    // A curated set of SDK frameworks is answerable from the target platform alone. Everything
    // else (arbitrary modules, submodule paths, versioned checks) stays unanswerable: a wrong
    // "yes" would surface a declaration that doesn't exist in the real build.
    guard importPath.count == 1,
      case .unversioned = version,
      let frameworkPlatforms = sdkFrameworkPlatforms[module]
    else {
      throw ScanConfigurationError("cannot evaluate 'canImport(\(module))' in a static scan")
    }
    return frameworkPlatforms.contains(platform.lowercased())
  }

  func isActiveTargetArchitecture(name: String) throws -> Bool {
    throw ScanConfigurationError("cannot evaluate 'arch(\(name))' in a static scan")
  }

  func isActiveTargetEnvironment(name: String) throws -> Bool {
    throw ScanConfigurationError("cannot evaluate 'targetEnvironment(\(name))' in a static scan")
  }

  func isActiveTargetRuntime(name: String) throws -> Bool {
    throw ScanConfigurationError("cannot evaluate '_runtime(\(name))' in a static scan")
  }

  func isActiveTargetPointerAuthentication(name: String) throws -> Bool {
    throw ScanConfigurationError("cannot evaluate '_ptrauth(\(name))' in a static scan")
  }

  // MARK: - Fixed answers

  // Non-throwing protocol requirements, so they need a value. These are constant across Apple
  // targets (the only ones Expo modules compile for), except the versions, which assume a current
  // toolchain; a module class gated on a *lower* Swift version would be wrongly included, which is
  // rare enough to accept for a scan.

  var targetPointerBitWidth: Int { 64 }
  var targetAtomicBitWidths: [Int] { [32, 64, 128] }
  var endianness: Endianness { .little }
  var languageVersion: VersionTuple { VersionTuple(6) }
  var compilerVersion: VersionTuple { VersionTuple(6, 2) }
}

/// The platforms (lowercased, as compared against `--platform`) that ship each of a curated set of
/// Apple SDK frameworks, so `canImport` of one is answerable from the platform alone. The list is
/// deliberately small and high-confidence: it covers the frameworks realistically used to gate a
/// module class, and a framework missing here degrades to the skip-with-warning path rather than a
/// wrong answer.
private let sdkFrameworkPlatforms: [String: Set<String>] = [
  "UIKit": ["ios", "tvos", "watchos", "visionos"],
  "AppKit": ["macos"],
  "SwiftUI": ["ios", "macos", "tvos", "watchos", "visionos"],
  "WatchKit": ["watchos"],
  "TVUIKit": ["tvos"],
  "WebKit": ["ios", "macos", "visionos"],
  "SafariServices": ["ios", "macos", "visionos"],
  "ARKit": ["ios", "visionos"],
  "RealityKit": ["ios", "macos", "visionos"],
  "CarPlay": ["ios"],
  "MessageUI": ["ios"],
  "CoreNFC": ["ios"],
  "HealthKit": ["ios", "watchos", "visionos"],
  "HomeKit": ["ios", "tvos", "watchos", "visionos"],
  "WidgetKit": ["ios", "macos", "watchos", "visionos"],
]

/// An unanswerable `#if` condition. SwiftIfConfig converts the thrown error into a diagnostic on
/// the condition's node and treats the region as inactive.
struct ScanConfigurationError: Error, CustomStringConvertible {
  let description: String

  init(_ description: String) {
    self.description = description
  }
}
