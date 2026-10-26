import type { ScanExportsResult } from 'expo-modules-macros';
export type ScanOptions = {
    /** A scanner executable to use instead of the one shipped with the macros plugin. */
    binaryPath?: string;
    /** The platform the scanner runs on; only overridden by tests. */
    platform?: NodeJS.Platform;
};
/**
 * Scans a package's Swift sources for their JS-exported surface through the macros plugin's
 * `scanExports`, turning its failures into messages that say what to do next.
 */
export declare function scanPackage(packageDir: string, { binaryPath, platform }?: ScanOptions): Promise<ScanExportsResult>;
