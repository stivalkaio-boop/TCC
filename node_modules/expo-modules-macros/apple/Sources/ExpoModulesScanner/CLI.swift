/// Command-line front end for the scanner: parses the subcommand and paths, then delegates to the
/// matching `Scanner` entry (which runs the scan and writes its JSON output). Lives in the library
/// so the macro plugin executable can dispatch into it: the compiler always launches that executable
/// without arguments and speaks the plugin protocol over stdin, so any argument means a scanner
/// invocation. Each path may be a `.swift` file or a directory (scanned recursively for `.swift`
/// files).
///
/// Subcommands:
///   scan-modules   <path>...   fast: top-level `@ExpoModule` types, for autolinking
///   scan-exports   <path>...   deep: full JS-exported surface, for TS type generation
public enum ScannerCLI {
  /// Runs the CLI for the given arguments (argv without the executable path) and returns the
  /// process exit code: `0` on success, `1` if encoding the report fails, `2` on a usage error.
  public static func run(arguments: [String]) -> Int32 {
    // `-h`/`--help` anywhere is treated as a help request: print usage to stdout and exit 0.
    if arguments.contains(where: { $0 == "-h" || $0 == "--help" }) {
      writeToStandardOutput(usageText)
      return 0
    }

    guard let subcommand = arguments.first else {
      writeToStandardError(usageText)
      return 2
    }

    var paths: [String] = []
    var platform: String?
    var defines: [String] = []

    var rest = arguments.dropFirst().makeIterator()
    while let argument = rest.next() {
      switch argument {
      case "--platform":
        guard let value = rest.next() else {
          return usageError("--platform requires a value")
        }
        platform = value
      case "--define":
        guard let value = rest.next() else {
          return usageError("--define requires a value")
        }
        defines.append(value)
      default:
        paths.append(argument)
      }
    }

    switch subcommand {
    case "scan-modules":
      // scan-modules is platform-agnostic: each reported module carries the platforms that include
      // it, and the consumer filters. An option selecting one platform would silently drop data.
      guard platform == nil else {
        return usageError(
          "scan-modules does not take --platform; each module reports its 'platforms' and the consumer filters"
        )
      }
      guard !paths.isEmpty else {
        return usageError("scan-modules requires at least one path")
      }
      return Scanner.runModules(paths: paths, defines: defines)

    case "scan-exports":
      // The exports surface visitor doesn't evaluate `#if` blocks yet, so accepting the options
      // here would silently do nothing.
      guard platform == nil, defines.isEmpty else {
        return usageError("scan-exports does not support --platform or --define")
      }
      guard !paths.isEmpty else {
        return usageError("scan-exports requires at least one path")
      }
      return Scanner.runExports(paths: paths)

    default:
      return usageError("unknown subcommand '\(subcommand)'")
    }
  }
}

/// The invoked executable's basename, so the usage text matches however the tool was launched
/// (the `ExpoModulesMacros` shipped in the package, or a locally built `ExpoModulesMacros-tool`).
private var toolName: String {
  guard let path = CommandLine.arguments.first else {
    return "ExpoModulesScanner"
  }
  // Windows paths may use either separator.
  return String(path.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last ?? Substring(path))
}

private var usageText: String {
  """
  usage: \(toolName) <subcommand> [options] <path> [<path> ...]

  subcommands:
    scan-modules   fast scan for top-level @ExpoModule types (autolinking)
    scan-exports   deep scan of the full JS-exported surface (type generation)

  options (scan-modules only):
    --define <flag>   treat a conditional compilation flag (e.g. DEBUG) as set when resolving
                      each module's 'platforms' list; repeatable

  options:
    -h, --help        print this help and exit

  """
}

/// Reports a usage error on stderr, followed by the usage text, and returns the usage exit code.
private func usageError(_ message: String) -> Int32 {
  writeToStandardError("error: \(message)\n" + usageText)
  return 2
}
