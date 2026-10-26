import { DOM_EVENT, DOM_READY, NATIVE_ACTION, NATIVE_ACTION_RESULT } from './injection';
import { getWebViewBridge, hasWebViewBridge } from './webview-bridge';
const IS_DOM = typeof window !== 'undefined' && typeof window.$$EXPO_INITIAL_PROPS !== 'undefined' && hasWebViewBridge();
const emit = (message)=>{
    if (!IS_DOM) {
        return;
    }
    getWebViewBridge().postMessage(JSON.stringify(message));
};
export const addEventListener = (onSubscribe)=>{
    if (!IS_DOM) {
        return ()=>{};
    }
    const listener = ({ detail })=>{
        onSubscribe(detail);
    };
    // TODO: Add component ID to the event name to prevent conflicts with other components.
    window.addEventListener(DOM_EVENT, listener);
    return ()=>{
        window.removeEventListener(DOM_EVENT, listener);
    };
};
export const notifyDOMReady = ()=>{
    emit({
        type: DOM_READY,
        data: null
    });
};
function invokeNativeAction(actionId, args) {
    if (!IS_DOM) {
        throw new Error('Cannot invoke native actions outside of a webview');
    }
    return new Promise((res, rej)=>{
        const uid = Math.random().toString(36).slice(2);
        const sub = addEventListener((message)=>{
            if (message.type === NATIVE_ACTION_RESULT && message.data.uid === uid && message.data.actionId === actionId) {
                // Unsubscribe from the event listener
                sub();
                if ('error' in message.data) {
                    rej(errorFromJson(message.data.error));
                }
                res(message.data.result);
            }
        });
        emit({
            type: NATIVE_ACTION,
            data: {
                uid,
                actionId,
                args
            }
        });
    });
}
export function getActionsObject() {
    return new Proxy({}, {
        get (_target, prop) {
            return async (...args)=>{
                const resolvedProps = await Promise.all(args.map((arg, index)=>{
                    if (arg instanceof Promise) {
                        console.warn(`The promise passed to native action "${prop.toString()}(${new Array(index).fill(',').join('')}promise)" will be evaluated on the web-side before sending to native. This may not be what you want.`);
                    }
                    return arg;
                }));
                // Assert that props must be serializable
                resolvedProps.forEach((arg, index)=>{
                    if (!arg) return;
                    if (typeof arg === 'function') {
                        console.error('Functions are not supported in arguments');
                        throw new Error('Functions are not supported in arguments');
                    } else if (typeof arg === 'object') {
                        try {
                            JSON.stringify(arg);
                        } catch (cause) {
                            console.error('Functions are not supported in arguments');
                            throw new Error(`Argument at index ${index} is not serializable`, {
                                cause
                            });
                        }
                    }
                });
                return invokeNativeAction(prop.toString(), resolvedProps);
            };
        }
    });
}
function errorFromJson(errorJson) {
    const error = new Error(errorJson.message);
    for (const key of Object.keys(errorJson)){
        error[key] = errorJson[key];
    }
    return error;
}

//# sourceMappingURL=marshal.js.map
