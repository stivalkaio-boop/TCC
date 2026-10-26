"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    isPathLike: null,
    normalizeAutolinkingConfig: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get isPathLike () {
        return isPathLike;
    },
    get normalizeAutolinkingConfig () {
        return normalizeAutolinkingConfig;
    }
});
function _path() {
    const data = /*#__PURE__*/ _interop_require_default(require("path"));
    _path = function() {
        return data;
    };
    return data;
}
const _Path = require("../utils/Path");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const NAMED_ARRAY_KEYS = new Set([
    'modules',
    'projects',
    'plugins',
    'pods',
    'extraDependencies'
]);
const STRING_ARRAY_KEYS = new Set([
    'coreFeatures',
    'configurations',
    'buildTypes'
]);
const FILE_URL_REGEX = /^file:/i;
const NETWORK_URL_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const RELATIVE_OR_NODE_MODULES_PATH_REGEX = /^(?:\.\.?\/|node_modules\/)/;
function normalizeAutolinkingConfig(config, options) {
    const roots = (options.roots ?? []).map((root)=>(0, _Path.toPosixPath)(root));
    return normalizeNode(structuredClone(config), options.stripPaths, roots);
}
function normalizeNode(value, stripPaths, roots, parentKey) {
    if (Array.isArray(value)) {
        const mapped = value.map((item)=>normalizeNode(item, stripPaths, roots, parentKey)).filter((item)=>item !== undefined);
        return sortKnownArray(parentKey, mapped);
    }
    if (value && typeof value === 'object') {
        if (isNamedDependencyMap(value)) {
            return normalizeNode(namedMapToSortedArray(value), stripPaths, roots, 'modules');
        }
        const result = {};
        for (const [key, child] of Object.entries(value)){
            if (stripPaths && typeof child === 'string' && isPathLike(child, roots)) {
                continue;
            }
            result[key] = normalizeNode(child, stripPaths, roots, key);
        }
        return result;
    }
    if (stripPaths && typeof value === 'string' && isPathLike(value, roots)) {
        return undefined;
    }
    return value;
}
/**
 * True when `value` is a `{ [packageName]: { root | platforms } }` map from react-native-config.
 * Those maps are converted to arrays because object key order is not stable across autolinking.
 */ function isNamedDependencyMap(value) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
        return false;
    }
    return entries.every(([, child])=>child != null && typeof child === 'object' && !Array.isArray(child) && ('platforms' in child || 'root' in child));
}
function namedMapToSortedArray(map) {
    return Object.entries(map).sort(([left], [right])=>compareStrings(left, right)).map(([name, child])=>({
            ...child,
            name
        }));
}
function sortKnownArray(parentKey, items) {
    if (parentKey && STRING_ARRAY_KEYS.has(parentKey)) {
        return [
            ...items
        ].sort((left, right)=>compareStrings(String(left), String(right)));
    }
    if (parentKey && NAMED_ARRAY_KEYS.has(parentKey)) {
        return [
            ...items
        ].sort((left, right)=>compareStrings(namedKey(left), namedKey(right)));
    }
    return items;
}
function namedKey(value) {
    if (value == null || typeof value !== 'object') {
        return String(value);
    }
    const record = value;
    for (const key of [
        'packageName',
        'name',
        'podName',
        'id',
        'url'
    ]){
        if (typeof record[key] === 'string') {
            return record[key];
        }
    }
    return '';
}
function compareStrings(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
function isPathLike(value, roots) {
    if (!value) {
        return false;
    }
    if (FILE_URL_REGEX.test(value)) {
        return true;
    }
    if (NETWORK_URL_REGEX.test(value)) {
        return false;
    }
    const posixValue = (0, _Path.toPosixPath)(value);
    if (_path().default.posix.isAbsolute(posixValue) || _path().default.win32.isAbsolute(value)) {
        return true;
    }
    for (const root of roots){
        if (!root) {
            continue;
        }
        if (posixValue === root || posixValue.startsWith(`${root}/`)) {
            return true;
        }
    }
    return RELATIVE_OR_NODE_MODULES_PATH_REGEX.test(posixValue);
}

//# sourceMappingURL=AutolinkingConfig.js.map
