// A webview without babel to test faster.
//
// Keep in sync with ExpoLogBox native webview wrappers.
// Android https://github.com/expo/expo/blob/main/packages/%40expo/log-box/android/src/main/expo/modules/logbox/ExpoLogBoxWebViewWrapper.kt
// iOS https://github.com/expo/expo/blob/main/packages/%40expo/log-box/ios/ExpoLogBoxWebViewWrapper.swift
import React from 'react';
import { AppState } from 'react-native';
import { getBaseURL } from './base';
import { _emitGlobalEvent } from './global-events';
import { DOM_READY, getInjectBodySizeObserverScript, getInjectEventScript, MATCH_CONTENTS_EVENT, NATIVE_ACTION, NATIVE_ACTION_RESULT, REGISTER_DOM_IMPERATIVE_HANDLE_PROPS } from './injection';
import ExpoDomWebView from './webview/ExpoDOMWebView';
import RNWebView from './webview/RNWebView';
import { useDebugZeroHeight } from './webview/useDebugZeroHeight';
const RawWebView = /*#__PURE__*/ React.forwardRef((props, ref)=>{
    const { children, dom: domProps, filePath, ref: _ref, ...marshalProps } = props;
    const { overrideUri, unstable_useExpoModulesBridge, ...dom } = domProps || {};
    const useExpoModulesBridge = unstable_useExpoModulesBridge ?? false;
    if (__DEV__) {
        if (children !== undefined) {
            throw new Error(`DOM components do not accept children. Found: ${children} | in component: ${filePath.split('?')[0]}`);
        }
    }
    if (ref != null && typeof ref === 'object' && ref.current == null) {
        ref.current = new Proxy({}, {
            get (_, prop) {
                const propName = String(prop);
                if (domImperativeHandlePropsRef.current?.includes(propName)) {
                    return function(...args) {
                        const serializedArgs = args.map((arg)=>JSON.stringify(arg)).join(',');
                        webviewRef.current?.injectJavaScript(`window._domRefProxy.${propName}(${serializedArgs})`);
                    };
                }
                if (typeof webviewRef.current?.[propName] === 'function') {
                    return function(...args) {
                        return (webviewRef.current?.[propName])(...args);
                    };
                }
                return undefined;
            }
        });
    }
    const useExpoDOMWebView = dom?.useExpoDOMWebView ?? true;
    const webView = resolveWebView(useExpoDOMWebView);
    const webviewRef = React.useRef(null);
    const domImperativeHandlePropsRef = React.useRef([]);
    const source = {
        uri: overrideUri ?? `${getBaseURL()}/${filePath}`
    };
    const [containerStyle, setContainerStyle] = React.useState(null);
    const { debugZeroHeightStyle, debugOnLayout } = useDebugZeroHeight(dom);
    const emit = React.useCallback((detail)=>{
        webviewRef.current?.injectJavaScript(getInjectEventScript(detail));
    }, [
        webviewRef
    ]);
    // serializable props, action names.
    const smartActions = Object.entries(marshalProps).reduce((acc, [key, value])=>{
        if (value instanceof Function) {
            acc.names.push(key);
        } else {
            // TODO: Recurse and assert that nested functions cannot be used.
            acc.props[key] = value;
        }
        return acc;
    }, {
        names: [],
        props: {}
    });
    // Keep `initialProps` stable to prevent webview reloads when
    // `injectedJavaScriptObject` changes.
    const initialPropsRef = React.useRef(smartActions);
    // When the `marshalProps` change, emit them to the webview.
    React.useEffect(()=>{
        emit({
            type: '$$props',
            data: smartActions
        });
    }, [
        emit,
        smartActions
    ]);
    return /*#__PURE__*/ React.createElement(webView, {
        webviewDebuggingEnabled: __DEV__,
        // Make iOS scrolling feel native.
        decelerationRate: process.env.EXPO_OS === 'ios' ? 'normal' : undefined,
        // This is a better default for integrating with native navigation.
        contentInsetAdjustmentBehavior: 'automatic',
        // This is the default in ScrollView and upstream native.
        automaticallyAdjustsScrollIndicatorInsets: true,
        originWhitelist: [
            '*'
        ],
        allowFileAccess: true,
        allowFileAccessFromFileURLs: true,
        allowingReadAccessToURL: 'file://',
        allowsAirPlayForMediaPlayback: true,
        allowsFullscreenVideo: true,
        onContentProcessDidTerminate: ()=>{
            webviewRef.current?.reload();
        },
        onRenderProcessGone: ()=>{
            // Simulate iOS `onContentProcessDidTerminate` behavior to reload when the app is in foreground or back to foreground.
            if (AppState.currentState === 'active') {
                webviewRef.current?.reload();
                return;
            }
            const subscription = AppState.addEventListener('focus', ()=>{
                webviewRef.current?.reload();
                subscription.remove();
            });
        },
        ...dom,
        ...useExpoDOMWebView ? {
            useExpoModulesBridge
        } : null,
        containerStyle: [
            containerStyle,
            debugZeroHeightStyle,
            dom?.containerStyle
        ],
        onLayout: __DEV__ ? debugOnLayout : dom?.onLayout,
        injectedJavaScriptObject: {
            // Inject the top-most OS for the DOM component to read.
            EXPO_DOM_HOST_OS: process.env.EXPO_OS,
            // Inject the initial props
            initialProps: initialPropsRef.current
        },
        injectedJavaScript: [
            dom?.matchContents ? getInjectBodySizeObserverScript() : null,
            dom?.injectedJavaScript,
            'true;'
        ].filter(Boolean).join('\n'),
        // @ts-expect-error: TODO(@kitten): untyped ref for now
        ref: webviewRef,
        source,
        style: [
            dom?.style ? {
                flex: 1,
                backgroundColor: 'transparent'
            } : {
                backgroundColor: 'transparent'
            },
            dom?.style
        ],
        onMessage: (event)=>{
            const { type, data } = JSON.parse(event.nativeEvent.data);
            if (type === MATCH_CONTENTS_EVENT) {
                if (dom?.matchContents) {
                    setContainerStyle({
                        width: data.width,
                        height: data.height
                    });
                }
                return;
            }
            if (type === DOM_READY) {
                // Re-send the props the DOM side missed while the WebView was loading.
                emit({
                    type: '$$props',
                    data: smartActions
                });
                return;
            }
            if (type === REGISTER_DOM_IMPERATIVE_HANDLE_PROPS) {
                domImperativeHandlePropsRef.current = data;
                return;
            }
            if (type === NATIVE_ACTION) {
                const action = marshalProps[data.actionId];
                if (action == null) {
                    throw new Error(`Native action "${data.actionId}" is not defined.`);
                }
                if (typeof action !== 'function' || !(action instanceof Function)) {
                    throw new Error(`Native action "${data.actionId}" is not a function.`);
                }
                const emitError = (error)=>{
                    emit({
                        type: NATIVE_ACTION_RESULT,
                        data: {
                            uid: data.uid,
                            actionId: data.actionId,
                            error: serializeError(error)
                        }
                    });
                };
                const emitResolve = (result)=>{
                    // Send async results back to the DOM proxy for return values.
                    emit({
                        type: NATIVE_ACTION_RESULT,
                        data: {
                            uid: data.uid,
                            actionId: data.actionId,
                            result
                        }
                    });
                };
                try {
                    const value = action(...data.args);
                    if (value instanceof Promise) {
                        return value.then((result)=>{
                            emitResolve(result);
                        }).catch((error)=>{
                            emitError(error);
                        });
                    } else {
                        // Send async results back to the webview proxy for return values.
                        return emitResolve(value);
                    }
                } catch (error) {
                    return emitError(error);
                }
            } else {
                dom?.onMessage?.(event);
            }
            _emitGlobalEvent({
                type,
                data
            });
        }
    });
});
if (__DEV__) {
    RawWebView.displayName = 'DOM';
}
function serializeError(error) {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack
        };
    }
    return error;
}
export function resolveWebView(useExpoDOMWebView) {
    const webView = useExpoDOMWebView ? ExpoDomWebView : RNWebView;
    if (webView == null) {
        const moduleName = useExpoDOMWebView ? '@expo/dom-webview' : 'react-native-webview';
        throw new Error(`Unable to resolve the '${moduleName}' module. Make sure to install it with 'npx expo install ${moduleName}'.`);
    }
    return webView;
}
export default RawWebView;

//# sourceMappingURL=webview-wrapper.js.map
