// React Native's FormData implementation is missing several methods that are used in React for server actions.
// https://github.com/facebook/react-native/blob/42dcfdd2cdb59fe545523cb57db6ee32a96b9298/packages/react-native/Libraries/Network/FormData.js#L1
// https://github.com/facebook/react/blob/985747f81033833dca22f30b0c04704dd4bd3714/packages/react-client/src/ReactFlightReplyClient.js#L212
function ensureMinArgCount(name, args, expected) {
    if (args.length < expected) {
        const argName = expected === 2 ? 'arguments' : 'argument';
        // Matches the errors in Chrome.
        throw new TypeError(`Failed to execute '${name}' on 'FormData': ${expected} ${argName} required, but only ${args.length} present.`);
    }
}
function normalizeArgs(name, value, blobFilename) {
    if (value instanceof Blob) {
        const descriptor = Object.getOwnPropertyDescriptor(value, 'name');
        if (descriptor && descriptor.writable) {
            // @ts-expect-error: `name` is not accessible in blob
            value.name = blobFilename ?? value.name ?? 'blob';
        } else if (!descriptor && Object.isExtensible(value)) {
            // @ts-expect-error: `name` is not accessible in blob
            value.name = blobFilename ?? 'blob';
        }
    } else if (typeof value !== 'object') {
        value = String(value);
    }
    return [
        String(name),
        value
    ];
}
export function installFormDataPatch(formData) {
    formData.prototype.append = function append(...props) {
        ensureMinArgCount('append', props, 2);
        // @ts-ignore: When inferred FormData.append from React Native types, it does not support the 3rd blobFilename argument.
        const [name, value, blobFilename] = props;
        this._parts.push(normalizeArgs(name, value, blobFilename));
    };
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.set = function set(...props) {
        ensureMinArgCount('set', props, 2);
        const [name, value, blobFilename] = props;
        const args = normalizeArgs(name, value, blobFilename);
        let replaced = false;
        for(let i = 0; i < this._parts.length; i++){
            if (this._parts[i]?.[0] === args[0]) {
                if (!replaced) {
                    this._parts[i] = args;
                    replaced = true;
                } else {
                    this._parts.splice(i, 1);
                    i--;
                }
            }
        }
        if (!replaced) {
            this._parts.push(args);
        }
    };
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.delete ??= function(...props) {
        ensureMinArgCount('delete', props, 1);
        let [name] = props;
        name = String(name);
        for(let i = 0; i < this._parts.length; i++){
            if (this._parts[i]?.[0] === name) {
                this._parts.splice(i, 1);
                i--;
            }
        }
    };
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.get ??= function(...props) {
        ensureMinArgCount('get', props, 1);
        let [name] = props;
        name = String(name);
        for (const part of this._parts){
            if (part[0] === name) {
                // @ts-expect-error: We don't perform correct normalization when setting the args so the return value will
                // not be a normalized File object.
                return part[1];
            }
        }
        return null;
    };
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.has ??= function(...props) {
        ensureMinArgCount('has', props, 1);
        let [name] = props;
        name = String(name);
        for (const part of this._parts){
            if (part[0] === name) {
                return true;
            }
        }
        return false;
    };
    // Required for RSC: https://github.com/facebook/react/blob/985747f81033833dca22f30b0c04704dd4bd3714/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js#L1056
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.forEach ??= function forEach(...props) {
        ensureMinArgCount('forEach', props, 1);
        const [callback, thisArg] = props;
        if (typeof callback !== 'function') {
            throw new TypeError(`Failed to execute 'forEach' on 'FormData': parameter 1 is not of type 'Function'.`);
        }
        for (const part of this._parts){
            // @ts-ignore: part[1] could throw an error in Node.js runtime because of `File` type mismatch.
            callback.call(thisArg, part[1], part[0], this);
        }
    };
    // Required for RSC: https://github.com/facebook/react/blob/985747f81033833dca22f30b0c04704dd4bd3714/packages/react-server/src/ReactFlightServer.js#L2117
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.entries ??= function* entries() {
        for (const part of this._parts){
            // @ts-expect-error: We don't perform correct normalization when setting the args so the return value will
            // not be a normalized File object.
            yield part;
        }
    };
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.keys ??= function* keys() {
        for (const part of this._parts){
            yield part[0];
        }
    };
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype.values ??= function* values() {
        for (const part of this._parts){
            // @ts-expect-error: We don't perform correct normalization when setting the args so the return value will
            // not be a normalized File object.
            yield part[1];
        }
    };
    // @ts-ignore: DOM.iterable is disabled for jest compat
    formData.prototype[Symbol.iterator] = formData.prototype.entries;
    return formData;
}

//# sourceMappingURL=FormData.js.map
