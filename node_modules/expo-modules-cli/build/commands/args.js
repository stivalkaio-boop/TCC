"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "parseArgs", {
    enumerable: true,
    get: function() {
        return parseArgs;
    }
});
function _arg() {
    const data = /*#__PURE__*/ _interop_require_default(require("arg"));
    _arg = function() {
        return data;
    };
    return data;
}
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function parseArgs(spec, argv, command, options = {}) {
    try {
        return (0, _arg().default)(spec, {
            ...options,
            argv
        });
    } catch (error) {
        if (error instanceof _arg().default.ArgError) {
            throw new Error(`${error.message}. Run \`${command} --help\` to see the options.`);
        }
        throw error;
    }
}

//# sourceMappingURL=args.js.map
