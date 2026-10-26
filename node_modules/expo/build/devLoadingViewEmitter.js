const listeners = {};
export function emit(event, data) {
    listeners[event]?.forEach((fn)=>fn(data));
}
export function addListener(event, listener) {
    if (!listeners[event]) {
        listeners[event] = new Set();
    }
    listeners[event].add(listener);
    return {
        remove () {
            listeners[event]?.delete(listener);
        }
    };
}

//# sourceMappingURL=devLoadingViewEmitter.js.map
