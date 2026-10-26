"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "resolvePrebuiltMetadataAsync", {
    enumerable: true,
    get: function() {
        return resolvePrebuiltMetadataAsync;
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
const _findModules = require("./autolinking/findModules");
const _dependencies = require("./dependencies");
const _memoize = require("./memoize");
const _reactNativeConfig = require("./reactNativeConfig");
const _utils = require("./utils");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function resolvePrebuiltMetadataAsync(optionsLoader, { mode } = {}) {
    return (0, _memoize.createMemoizer)().withMemoizer(async ()=>{
        const appRoot = await optionsLoader.getAppRoot();
        const resolvedMode = mode ?? (findExpoRepoRoot() ? 'catalog' : 'app-plan');
        const packages = resolvedMode === 'catalog' ? await scanRepoPackagesAsync() : await findAppPackagesAsync(appRoot, optionsLoader);
        const entries = {};
        for (const name of Object.keys(packages).sort()){
            const packageRoot = packages[name]?.path;
            if (packageRoot) {
                addInternalProducts(entries, packageRoot);
            }
        }
        const reactNativeConfig = await (0, _reactNativeConfig.createReactNativeConfigAsync)({
            autolinkingOptions: await optionsLoader.getPlatformOptions('ios'),
            appRoot,
            sourceDir: undefined
        });
        await scanExternalConfigsAsync(reactNativeConfig.dependencies ?? {}, entries);
        return Object.fromEntries(Object.keys(entries).sort().map((podName)=>[
                podName,
                entries[podName]
            ]));
    });
}
/** The expo repository root when this package runs from its packages/ checkout
 * (its own location is the same anchor used for external-configs below). */ function findExpoRepoRoot() {
    const repoRoot = _path().default.resolve(__dirname, '..', '..', '..');
    return _fs().default.existsSync(_path().default.join(repoRoot, 'packages', 'expo-modules-core', 'spm.config.json')) ? repoRoot : null;
}
/** Every package in the expo repository, whether or not an app depends on it. */ async function scanRepoPackagesAsync() {
    const repoRoot = findExpoRepoRoot();
    if (!repoRoot) {
        throw new Error('The prebuilt-metadata catalog requires an expo repository checkout. Use the app-plan mode for standalone projects.');
    }
    return (0, _dependencies.scanDependenciesInSearchPath)(_path().default.join(repoRoot, 'packages'));
}
/** Only the packages the app itself resolves. */ async function findAppPackagesAsync(appRoot, optionsLoader) {
    return (0, _findModules.findModulesAsync)({
        appRoot,
        autolinkingOptions: await optionsLoader.getPlatformOptions('apple')
    });
}
function readJsonFile(filePath) {
    if (!_fs().default.existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(_fs().default.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.warn(`[prebuilt-metadata] Failed to read ${filePath}: ${error}`);
        return null;
    }
}
const IOS_PLATFORM_RX = /^iOS\(\s*(?:["']([\d.]+)["']|\.v(\d+))\s*\)$/;
/**
 * The iOS floor of an spm.config.json `platforms` array, as a plain version
 * string: `iOS(.v15)` and `iOS("15.0")` are the same floor to every consumer, and
 * only a Package.swift can spell the case form. A declaration this cannot read is
 * no floor at all — a guessed deployment target is a compile error in someone
 * else's module.
 */ function readIosDeploymentTarget(platforms) {
    if (!Array.isArray(platforms)) {
        return undefined;
    }
    for (const platform of platforms){
        if (typeof platform !== 'string' || !platform.trim().startsWith('iOS(')) {
            continue;
        }
        const match = IOS_PLATFORM_RX.exec(platform.trim());
        return match == null ? undefined : match[1] ?? `${match[2]}.0`;
    }
    return undefined;
}
const SPM_VERSION_KEYS = [
    'exact',
    'from',
    'branch',
    'revision'
];
/** An SPM version requirement, when the entry declares exactly one this knows and
 * spells it as a string. Two requirements are as unrenderable as none. */ function readSpmVersion(version) {
    if (typeof version !== 'object' || version === null) {
        return undefined;
    }
    const declared = SPM_VERSION_KEYS.filter((key)=>key in version);
    const requirement = declared.length === 1 ? declared[0] : undefined;
    if (requirement == null) {
        return undefined;
    }
    const value = version[requirement];
    return typeof value === 'string' ? {
        [requirement]: value
    } : undefined;
}
/** The SPM packages of a product, as the coordinates a generated manifest needs.
 * An entry missing any of them, or naming one as an empty string, is skipped: a
 * package declaration SwiftPM cannot resolve fails the whole graph, where a
 * missing one is diagnosed by name. An
 * entry naming a package identity of its own is skipped for the same reason —
 * SwiftPM derives identity from the URL, and no manifest can say otherwise. */ function readSpmPackages(spmPackages, { podName, configPath }) {
    if (!Array.isArray(spmPackages)) {
        return undefined;
    }
    const packages = [];
    spmPackages.forEach((entry, index)=>{
        const read = readSpmPackage(entry);
        if (typeof read !== 'string') {
            packages.push(read);
            return;
        }
        const productName = entry?.productName;
        const label = isNonEmptyString(productName) ? `"${productName}"` : `spmPackages[${index}]`;
        warnSkippedSpmPackage(label, podName, configPath, read);
    });
    return packages.length > 0 ? packages : undefined;
}
/** The package an entry declares, or what keeps it from declaring one. */ function readSpmPackage(entry) {
    if (typeof entry !== 'object' || entry === null) {
        return 'is not an object';
    }
    const { url, productName, version } = entry;
    if (!isNonEmptyString(productName)) {
        return 'has no productName';
    }
    if (!isNonEmptyString(url)) {
        return 'has no url';
    }
    const requirement = readSpmVersion(version);
    if (requirement == null) {
        return 'declares no version requirement this can read (exactly one of exact, from, branch or revision, as a string)';
    }
    if ('packageName' in entry) {
        return 'names a packageName, which SwiftPM derives from the url instead';
    }
    return {
        url,
        productName,
        version: requirement
    };
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
/** CocoaPods links every SPM package that names a product, so one skipped here
 * without a word is linked by CocoaPods and silently missing from a SwiftPM build. */ function warnSkippedSpmPackage(label, podName, configPath, problem) {
    console.warn(`[prebuilt-metadata] The SPM package ${label} of ${podName} in ${configPath} ${problem}, so it is left out of the metadata ` + 'and a SwiftPM build does not link it, even where CocoaPods does. ' + 'Give the entry a url, a productName, and exactly one version requirement, and no packageName.');
}
const AUTOLINK_WHEN_SUBJECTS = [
    'podName',
    'npmPackage',
    'podfileProperty'
];
function isAutolinkWhenSubject(key) {
    return AUTOLINK_WHEN_SUBJECTS.includes(key);
}
/** The autolinking gate a product declares, keeping only the keys an evaluator
 * reads. A declared gate always survives as a condition, even an empty one:
 * both evaluators answer "not met" for a condition naming no subject, so
 * dropping the key here would link under SwiftPM what CocoaPods leaves out —
 * the parity this document exists to keep. */ function readAutolinkWhen(condition, podName, configPath) {
    if (condition == null) {
        return undefined;
    }
    if (typeof condition !== 'object' || Array.isArray(condition)) {
        warnUnreadableAutolinkWhen(podName, configPath, [
            `is ${Array.isArray(condition) ? 'an array' : `a ${typeof condition}`}, not an object`
        ], false);
        return {};
    }
    const declared = {};
    const unread = [];
    for (const [key, value] of Object.entries(condition)){
        if (key === 'disabledValue') {
            declared.disabledValue = value;
            continue;
        }
        if (isAutolinkWhenSubject(key) && typeof value === 'string') {
            declared[key] = value;
            continue;
        }
        unread.push(key);
    }
    const hasSubject = AUTOLINK_WHEN_SUBJECTS.some((subject)=>declared[subject] != null);
    const problems = unread.length > 0 ? [
        `declares ${unread.join(', ')}, which this cannot read`
    ] : [];
    if (!hasSubject) {
        problems.push('names no podName, npmPackage, or podfileProperty to test');
    }
    if (problems.length > 0) {
        warnUnreadableAutolinkWhen(podName, configPath, problems, hasSubject);
    }
    return declared;
}
/** A gate nobody warns about fails silently: the module is simply missing from
 * the build, with no diagnostic anywhere naming the condition that withheld it. */ function warnUnreadableAutolinkWhen(podName, configPath, problems, hasSubject) {
    console.warn(`[prebuilt-metadata] The autolinkWhen condition of ${podName} in ${configPath} ${problems.join(' and ')}. ` + (hasSubject ? 'The rest of the condition still decides the gate.' : 'A condition naming no subject is never met, so the product is left out of the build.') + ' Check the condition for a typo.');
}
/** Declaration order is the document's key order. */ const PRODUCT_FIELD_READERS = {
    sourceOnly: (product)=>product.sourceOnly === true ? true : undefined,
    iosDeploymentTarget: (product)=>readIosDeploymentTarget(product.platforms),
    spmPackages: (product, context)=>readSpmPackages(product.spmPackages, context),
    autolinkWhen: (product, { podName, configPath })=>readAutolinkWhen(product.autolinkWhen, podName, configPath)
};
function readProductFields(product, context) {
    const fields = {};
    for (const [field, read] of Object.entries(PRODUCT_FIELD_READERS)){
        const value = read(product, context);
        if (value !== undefined) {
            fields[field] = value;
        }
    }
    return fields;
}
function addProducts(entries, config, source) {
    const { configPath } = source;
    // Like Ruby, a config that fails mid-processing is warned about and skipped.
    try {
        for (const product of config?.products ?? []){
            const podName = product.podName;
            if (podName == null) {
                continue;
            }
            entries[podName] = {
                type: source.type,
                npmPackage: source.npmPackage,
                packageRoot: source.packageRoot,
                podspecDir: source.podspecDir(podName),
                productName: product.name || podName,
                ...readProductFields(product, {
                    podName,
                    configPath
                })
            };
        }
    } catch (error) {
        console.warn(`[prebuilt-metadata] Failed to process ${configPath}: ${error}`);
    }
}
function addInternalProducts(entries, packageRoot) {
    const configPath = _path().default.join(packageRoot, 'spm.config.json');
    const config = readJsonFile(configPath);
    if (!config) {
        return;
    }
    // Both resolvers synthesize a name from the directory when package.json cannot be
    // read, so the npm name is only trustworthy from the manifest itself. Like Ruby,
    // skip the config rather than emit a name derived from the path.
    const npmPackage = readJsonFile(_path().default.join(packageRoot, 'package.json'))?.name;
    if (!npmPackage) {
        return;
    }
    addProducts(entries, config, {
        type: 'internal',
        npmPackage,
        packageRoot,
        podspecDir: (podName)=>resolvePodspecDir(packageRoot, podName),
        configPath
    });
}
/** Podspecs live in `ios/` unless the package keeps one at its root. */ function resolvePodspecDir(packageRoot, podName) {
    return !_fs().default.existsSync(_path().default.join(packageRoot, 'ios', `${podName}.podspec`)) && _fs().default.existsSync(_path().default.join(packageRoot, `${podName}.podspec`)) ? packageRoot : _path().default.join(packageRoot, 'ios');
}
async function scanExternalConfigsAsync(dependencies, entries) {
    const externalConfigsDir = _path().default.join(__dirname, '..', 'external-configs', 'ios');
    for await (const file of (0, _utils.scanFilesRecursively)(externalConfigsDir, undefined, true)){
        if (file.name !== 'spm.config.json') {
            continue;
        }
        const npmPackage = _path().default.relative(externalConfigsDir, file.parentPath).split(_path().default.sep).join('/');
        const packageRoot = dependencies[npmPackage]?.root;
        if (!packageRoot) {
            continue;
        }
        addProducts(entries, readJsonFile(file.path), {
            type: 'external',
            npmPackage,
            packageRoot,
            podspecDir: ()=>packageRoot,
            configPath: file.path
        });
    }
}

//# sourceMappingURL=prebuiltMetadata.js.map
