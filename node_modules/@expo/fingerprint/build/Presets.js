"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    DEFAULT_PRESET: null,
    resolvePreset: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get DEFAULT_PRESET () {
        return DEFAULT_PRESET;
    },
    get resolvePreset () {
        return resolvePreset;
    }
});
const _SourceSkips = require("./sourcer/SourceSkips");
const DEFAULT_PRESET = 'balanced';
function resolvePreset(preset) {
    switch(preset){
        case 'strict':
            return {
                sourceSkips: _SourceSkips.SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun,
                nativeModuleSourceType: 'files',
                configPluginSourceType: 'files'
            };
        case 'balanced':
            return {
                sourceSkips: _SourceSkips.SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun | _SourceSkips.SourceSkips.ExpoConfigVersions | _SourceSkips.SourceSkips.ExpoConfigRuntimeVersionIfString | _SourceSkips.SourceSkips.EasJson | _SourceSkips.SourceSkips.Easignore | _SourceSkips.SourceSkips.AutolinkingConfigPaths,
                nativeModuleSourceType: 'package',
                configPluginSourceType: 'package'
            };
        case 'relaxed':
            return {
                sourceSkips: _SourceSkips.SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun | _SourceSkips.SourceSkips.ExpoConfigVersions | _SourceSkips.SourceSkips.ExpoConfigRuntimeVersionIfString | _SourceSkips.SourceSkips.EasJson | _SourceSkips.SourceSkips.Easignore | _SourceSkips.SourceSkips.AutolinkingConfigPaths | _SourceSkips.SourceSkips.ExpoConfigNames | _SourceSkips.SourceSkips.ExpoConfigAndroidPackage | _SourceSkips.SourceSkips.ExpoConfigIosBundleIdentifier | _SourceSkips.SourceSkips.ExpoConfigSchemes | _SourceSkips.SourceSkips.ExpoConfigAssets,
                nativeModuleSourceType: 'package',
                configPluginSourceType: 'package'
            };
        default:
            throw new Error(`Invalid fingerprint preset: ${preset}. Supported presets are 'strict', 'balanced', and 'relaxed'.`);
    }
}

//# sourceMappingURL=Presets.js.map
