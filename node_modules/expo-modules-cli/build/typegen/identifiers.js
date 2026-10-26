"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    isIdentifier: null,
    memberName: null,
    parameterName: null,
    stripBackticks: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get isIdentifier () {
        return isIdentifier;
    },
    get memberName () {
        return memberName;
    },
    get parameterName () {
        return parameterName;
    },
    get stripBackticks () {
        return stripBackticks;
    }
});
/** Words that cannot name a parameter or variable, even though they may name a member. */ const RESERVED_WORDS = new Set([
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'interface',
    'let',
    'new',
    'null',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield'
]);
function stripBackticks(name) {
    return name.length > 2 && name.startsWith('`') && name.endsWith('`') ? name.slice(1, -1) : name;
}
function isIdentifier(name) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
function memberName(name) {
    return isIdentifier(name) ? name : JSON.stringify(name);
}
function parameterName(name, index) {
    if (RESERVED_WORDS.has(name)) {
        return `${name}_`;
    }
    return isIdentifier(name) ? name : `arg${index}`;
}

//# sourceMappingURL=identifiers.js.map
