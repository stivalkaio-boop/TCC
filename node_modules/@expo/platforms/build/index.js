/**
 * Platform identity metadata shared by Expo tooling.
 *
 * This package is the single source of truth for pure data about platform names. It has zero
 * runtime dependencies so that every layer of the toolchain can consume it — including
 * `expo-modules-autolinking`, which deliberately keeps its dependency list minimal.
 *
 * Keep this package free of behavior: no filesystem access, no path resolution, no config
 * evaluation. Consumers wrap this data in their own semantics (defaults, throws, gating).
 */ /** All platform names known to Expo tooling. */ "use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    APPLE_TARGET_PLATFORMS: null,
    KNOWN_PLATFORMS: null,
    OUT_OF_TREE_PLATFORMS: null,
    PLATFORM_EXTENSIONS: null,
    REACT_NATIVE_HOST_PACKAGES: null,
    getReactNativeHostPackage: null,
    isAppleTargetPlatform: null,
    isOutOfTreePlatform: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get APPLE_TARGET_PLATFORMS () {
        return APPLE_TARGET_PLATFORMS;
    },
    get KNOWN_PLATFORMS () {
        return KNOWN_PLATFORMS;
    },
    get OUT_OF_TREE_PLATFORMS () {
        return OUT_OF_TREE_PLATFORMS;
    },
    get PLATFORM_EXTENSIONS () {
        return PLATFORM_EXTENSIONS;
    },
    get REACT_NATIVE_HOST_PACKAGES () {
        return REACT_NATIVE_HOST_PACKAGES;
    },
    get getReactNativeHostPackage () {
        return getReactNativeHostPackage;
    },
    get isAppleTargetPlatform () {
        return isAppleTargetPlatform;
    },
    get isOutOfTreePlatform () {
        return isOutOfTreePlatform;
    }
});
const KNOWN_PLATFORMS = [
    'android',
    'ios',
    'web',
    'tvos',
    'macos'
];
const OUT_OF_TREE_PLATFORMS = [
    'tvos',
    'macos'
];
function isOutOfTreePlatform(platform) {
    return OUT_OF_TREE_PLATFORMS.includes(platform);
}
const APPLE_TARGET_PLATFORMS = [
    'ios',
    'tvos',
    'macos'
];
function isAppleTargetPlatform(platform) {
    return APPLE_TARGET_PLATFORMS.includes(platform);
}
const REACT_NATIVE_HOST_PACKAGES = {
    android: 'react-native',
    ios: 'react-native',
    tvos: 'react-native-tvos',
    macos: 'react-native-macos',
    windows: 'react-native-windows'
};
function getReactNativeHostPackage(platform) {
    return platform == null ? undefined : REACT_NATIVE_HOST_PACKAGES[platform];
}
const PLATFORM_EXTENSIONS = {
    tvos: [
        'tvos',
        'ios',
        'native'
    ],
    macos: [
        'macos',
        'ios',
        'native'
    ]
};

//# sourceMappingURL=index.js.map
