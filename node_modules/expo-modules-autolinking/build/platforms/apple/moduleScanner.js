"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    collectPackageRoots: null,
    groupScannedModules: null,
    hasModuleAnnotations: null,
    loadModulesScanner: null,
    scanExpoModulesAsync: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get collectPackageRoots () {
        return collectPackageRoots;
    },
    get groupScannedModules () {
        return groupScannedModules;
    },
    get hasModuleAnnotations () {
        return hasModuleAnnotations;
    },
    get loadModulesScanner () {
        return loadModulesScanner;
    },
    get scanExpoModulesAsync () {
        return scanExpoModulesAsync;
    }
});
function _fs() {
    const data = /*#__PURE__*/ _interop_require_default(require("fs"));
    _fs = function() {
        return data;
    };
    return data;
}
function _path() {
    const data = /*#__PURE__*/ _interop_require_default(require("path"));
    _path = function() {
        return data;
    };
    return data;
}
const _utils = require("../../utils");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * Scanner platform names by autolinking platform. The umbrella `apple` platform isn't listed, so it
 * links every scanned module.
 */ const SCANNER_PLATFORM_NAMES = {
    ios: 'iOS',
    macos: 'macOS',
    tvos: 'tvOS'
};
function loadModulesScanner(resolutionBasePath) {
    try {
        const scanner = require(require.resolve('expo-modules-macros', {
            paths: [
                resolutionBasePath
            ]
        }));
        return typeof scanner?.scanModules === 'function' ? scanner : null;
    } catch  {
        return null;
    }
}
/** Mirrors `prunedDirectoryNames` in the scanner's `SourceScan.swift`. */ const PRUNED_DIRECTORY_NAMES = new Set([
    '.build',
    'Pods',
    '.git',
    'node_modules',
    'Tests',
    'UITests',
    '__tests__',
    '__mocks__',
    'example',
    'examples',
    'e2e'
]);
/** An `@ExpoModule` attribute, possibly after other attributes, at the start of a line. */ const MODULE_ANNOTATION_PATTERN = /^[ \t]*(?:@\w+(?:\([^)\n]*\))?[ \t]+)*@ExpoModule\b/m;
function hasModuleAnnotations(packageRoot) {
    let entries;
    try {
        entries = _fs().default.readdirSync(packageRoot, {
            withFileTypes: true
        });
    } catch  {
        return false;
    }
    for (const entry of entries){
        const entryPath = _path().default.join(packageRoot, entry.name);
        if (entry.isDirectory()) {
            if (!PRUNED_DIRECTORY_NAMES.has(entry.name) && hasModuleAnnotations(entryPath)) {
                return true;
            }
        } else if (entry.isFile() && entry.name.endsWith('.swift')) {
            try {
                if (MODULE_ANNOTATION_PATTERN.test(_fs().default.readFileSync(entryPath, 'utf8'))) {
                    return true;
                }
            } catch  {}
        }
    }
    return false;
}
function collectPackageRoots(searchResults) {
    const packageRoots = {};
    const seenRoots = new Set();
    for (const [packageName, revision] of Object.entries(searchResults)){
        let root;
        try {
            root = _fs().default.realpathSync(revision.path);
        } catch  {
            continue;
        }
        if (seenRoots.has(root)) {
            continue;
        }
        seenRoots.add(root);
        packageRoots[packageName] = root;
    }
    return packageRoots;
}
async function scanExpoModulesAsync(scanner, packageRoots) {
    const roots = Object.values(packageRoots);
    if (!roots.length) {
        return null;
    }
    let output;
    try {
        output = await scanner.scanModules(roots, {
            timeout: 5000
        });
    } catch (error) {
        console.warn(`warning: Scanning for Expo modules failed, only modules declared in expo-module.config.json will be linked: ${error.message ?? error}`);
        return null;
    }
    for (const warning of output.warnings){
        console.warn(`${warning.file}:${warning.line}: warning: ${warning.message}. If a module class is declared inside this conditional compilation block, declare it in expo-module.config.json to link it.`);
    }
    return output;
}
function groupScannedModules(output, packageRoots, platform) {
    const targetPlatformName = SCANNER_PLATFORM_NAMES[platform];
    const rootEntries = Object.entries(packageRoots).sort(([, rootA], [, rootB])=>rootB.length - rootA.length);
    const grouped = {};
    const seenClassesByPackage = {};
    const warnedClasses = new Set();
    for (const module1 of output.modules){
        // Skip a malformed entry instead of failing the whole scan.
        if (typeof module1.file !== 'string' || typeof module1.name !== 'string') {
            continue;
        }
        // An empty list is a condition the scanner couldn't evaluate (it already warned), so skip it
        // for the umbrella platform too.
        if (!module1.platforms?.length || targetPlatformName && !module1.platforms.includes(targetPlatformName)) {
            continue;
        }
        if (module1.accessLevel !== 'public' && module1.accessLevel !== 'open') {
            // Only `internal` warns: it's the default, so likely a mistake. A lower level is an opt-out.
            if (module1.accessLevel === 'internal' && !warnedClasses.has(module1.file + module1.name)) {
                console.warn(`warning: The @ExpoModule class '${module1.name}' (${module1.file}) is internal, so the generated modules provider cannot reference it. Declare it public to link it automatically, or use a lower access level such as private to opt it out of linking.`);
                warnedClasses.add(module1.file + module1.name);
            }
            continue;
        }
        const owner = rootEntries.find(([, root])=>(0, _utils.isPathInside)(module1.file, root));
        if (!owner) {
            continue;
        }
        const packageName = owner[0];
        seenClassesByPackage[packageName] ??= new Set();
        const seenClasses = seenClassesByPackage[packageName];
        if (seenClasses.has(module1.name)) {
            continue;
        }
        seenClasses.add(module1.name);
        // A null name keeps the module's own name, as for config-declared string entries.
        (grouped[packageName] ??= []).push({
            name: null,
            class: module1.name
        });
    }
    return grouped;
}

//# sourceMappingURL=moduleScanner.js.map
