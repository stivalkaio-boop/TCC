const globalListeners = new Set();
export function _emitGlobalEvent(message) {
    globalListeners.forEach((listener)=>listener(message));
}
export const addGlobalDomEventListener = (onSubscribe)=>{
    globalListeners.add(onSubscribe);
    return ()=>{
        globalListeners.delete(onSubscribe);
    };
};

//# sourceMappingURL=global-events.js.map
