"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    styleComment: null,
    styleFileName: null,
    styleKind: null,
    styleTypeName: null,
    styleWarning: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get styleComment () {
        return styleComment;
    },
    get styleFileName () {
        return styleFileName;
    },
    get styleKind () {
        return styleKind;
    },
    get styleTypeName () {
        return styleTypeName;
    },
    get styleWarning () {
        return styleWarning;
    }
});
function _nodeutil() {
    const data = require("node:util");
    _nodeutil = function() {
        return data;
    };
    return data;
}
function styleFileName(name, stream = process.stdout) {
    return (0, _nodeutil().styleText)('cyan', name, {
        stream
    });
}
function styleTypeName(name, stream = process.stdout) {
    return (0, _nodeutil().styleText)('bold', name, {
        stream
    });
}
function styleKind(kind, stream = process.stdout) {
    return (0, _nodeutil().styleText)('magenta', kind, {
        stream
    });
}
function styleWarning(text, stream = process.stdout) {
    return (0, _nodeutil().styleText)('yellow', text, {
        stream
    });
}
function styleComment(text, stream = process.stdout) {
    return (0, _nodeutil().styleText)('gray', text, {
        stream
    });
}

//# sourceMappingURL=styles.js.map
