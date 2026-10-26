"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "scanPackage", {
    enumerable: true,
    get: function() {
        return scanPackage;
    }
});
function _fs() {
    const data = /*#__PURE__*/ _interop_require_default(require("fs"));
    _fs = function() {
        return data;
    };
    return data;
}
const _resolveMacros = require("./resolveMacros");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function scanPackage(packageDir, { binaryPath, platform = process.platform } = {}) {
    const { ScannerError, ScannerSchemaVersionError, getScannerBinaryPath, scanExports } = (0, _resolveMacros.resolveMacros)(packageDir);
    binaryPath ??= getScannerBinaryPath();
    if (!_fs().default.existsSync(binaryPath)) {
        throw new Error(`The Expo Modules scanner executable was not found at ${binaryPath}. It ships with ` + `expo-modules-macros, a dependency of expo-modules-core, so reinstall your JavaScript ` + `dependencies, or pass the path to a locally built scanner with --scanner.`);
    }
    try {
        return await scanExports([
            packageDir
        ], {
            binaryPath
        });
    } catch (error) {
        if (error instanceof ScannerSchemaVersionError) {
            // The bundled scanner matches the wrapper it ships with, so a mismatch means a --scanner override.
            throw new Error(`The Expo Modules scanner at ${binaryPath} reports schema version ${error.found}, but this ` + `CLI understands version ${error.expected}. Pass a scanner built from the same release as ` + `this CLI with --scanner, or drop the option to use the one from expo-modules-macros.`);
        }
        if (error instanceof ScannerError && error.exitCode !== null) {
            // The scanner explains every failure on stderr, so its exit code adds nothing to the message.
            throw new Error(`The Expo Modules scanner failed to scan ${packageDir}. ` + `Fix the problem it reports below, then run the command again.\n${error.stderr.trim()}`);
        }
        if (error instanceof ScannerError) {
            // No exit code means the process never ran to completion: the binary could not be executed,
            // or it printed something other than a report. Off macOS the shipped binary cannot run at all,
            // and libc hands it to /bin/sh, so the failure does not name the real cause.
            const platformHint = platform === 'darwin' ? 'On macOS, make sure the file is executable' : `The bundled scanner is a macOS binary, so on ${platform} this command needs a locally ` + `built scanner`;
            throw new Error(`The Expo Modules scanner at ${binaryPath} did not produce a report: ${error.message}. ` + `${platformHint}, or pass the path to another scanner with --scanner.`);
        }
        throw error;
    }
}

//# sourceMappingURL=scan.js.map
