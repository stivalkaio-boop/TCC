// This is the main export for `@expo/log-box-utils` used in `@expo/cli` and `expo/async-require/hmr`.
// This needs to be transpiled to CJS for use in the Expo CLI.
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    parseBabelCodeFrameError: null,
    parseBabelTransformError: null,
    parseMetroError: null,
    parseWebBuildErrors: null,
    withoutANSIColorStyles: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get parseBabelCodeFrameError () {
        return _metroBuildErrorsFormat.parseBabelCodeFrameError;
    },
    get parseBabelTransformError () {
        return _metroBuildErrorsFormat.parseBabelTransformError;
    },
    get parseMetroError () {
        return _metroBuildErrorsFormat.parseMetroError;
    },
    get parseWebBuildErrors () {
        return _parseWebBuildErrors.parseWebBuildErrors;
    },
    get withoutANSIColorStyles () {
        return _withoutANSIStyles.withoutANSIColorStyles;
    }
});
const _parseWebBuildErrors = require("./utils/parseWebBuildErrors");
const _metroBuildErrorsFormat = require("./utils/metroBuildErrorsFormat");
const _withoutANSIStyles = require("./utils/withoutANSIStyles");

//# sourceMappingURL=index.js.map
