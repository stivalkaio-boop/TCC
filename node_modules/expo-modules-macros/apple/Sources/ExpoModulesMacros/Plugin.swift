import ExpoModulesScanner
import SwiftCompilerPlugin
import SwiftSyntaxMacros

#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#elseif os(Windows)
import CRT
#endif

struct ExpoModulesMacrosPlugin: CompilerPlugin {
  let providingMacros: [Macro.Type] = [
    OptimizedFunctionAttachedMacro.self,
    JSMacro.self,
    EventMacro.self,
    ExpoModuleMacro.self,
    SharedObjectMacro.self,
    RecordMacro.self,
    UnionMacro.self,
    ViewPropsMacro.self,
    ExpoViewMacro.self,
  ]
}

/// The executable doubles as the scanner CLI. The compiler always launches a plugin executable
/// without arguments and speaks the plugin protocol over stdin, so any argument means a scanner
/// invocation (`ExpoModulesMacros scan-modules <path>...`); with none, this starts the plugin
/// server exactly as `@main` on the `CompilerPlugin` type would.
@main
enum EntryPoint {
  static func main() throws {
    let arguments = Array(CommandLine.arguments.dropFirst())
    if arguments.isEmpty {
      try ExpoModulesMacrosPlugin.main()
    } else {
      exit(ScannerCLI.run(arguments: arguments))
    }
  }
}
