import type { ModuleIosConfig, SearchResults, SupportedPlatform } from '../../types';
interface ScannedModule {
    /** The Swift class name the module is declared as. */
    name: string;
    /**
     * The `@ExpoModule("Foo")` name, or the class name. Unused: it equals the runtime `_jsName`,
     * which must stay below the module's own `Name(...)` in `ModuleHolder.name`.
     */
    jsName: string;
    /** The spelled access modifier, or `internal` when none is written. */
    accessLevel: 'open' | 'public' | 'package' | 'internal' | 'fileprivate' | 'private';
    /** Absolute path of the source file the module was found in. */
    file: string;
    /**
     * The Apple platforms the class compiles on. Empty when the condition can't be evaluated
     * statically (`#if DEBUG`, `canImport(...)`).
     */
    platforms: string[];
}
interface ScanWarning {
    message: string;
    file: string;
    line: number;
}
export interface ScanModulesOutput {
    schemaVersion: number;
    modules: ScannedModule[];
    warnings: ScanWarning[];
    stats: {
        filesScanned: number;
        filesParsed: number;
        durationMs: number;
    };
}
/** The part of the `expo-modules-macros` API used here. */
export interface ModulesScanner {
    scanModules(paths: string[], options?: {
        timeout?: number;
    }): Promise<ScanModulesOutput>;
}
/**
 * Loads `expo-modules-macros`, a dependency of the installed `expo-modules-core` at the given
 * path. Returns null when it's missing.
 */
export declare function loadModulesScanner(resolutionBasePath: string): ModulesScanner | null;
/**
 * Whether any Swift source in the package has an `@ExpoModule` attribute. A plain text search, used
 * when the scan didn't complete.
 */
export declare function hasModuleAnnotations(packageRoot: string): boolean;
/**
 * The directory to scan for each package. Paths are realpath-resolved to match the scanner's
 * output, and a directory shared by two package names (an npm alias) is kept for the first one.
 */
export declare function collectPackageRoots(searchResults: SearchResults): Record<string, string>;
/**
 * Scans all package roots in one run and prints the scanner's warnings. Returns null, with a
 * warning, when the scan fails.
 */
export declare function scanExpoModulesAsync(scanner: ModulesScanner, packageRoots: Record<string, string>): Promise<ScanModulesOutput | null>;
/**
 * Groups the scanned modules by the package with the longest root containing their source file.
 * Leaves out classes that aren't `public` or `open` or don't compile for the platform, and lists
 * each class once per package.
 */
export declare function groupScannedModules(output: ScanModulesOutput, packageRoots: Record<string, string>, platform: SupportedPlatform): Record<string, ModuleIosConfig[]>;
export {};
