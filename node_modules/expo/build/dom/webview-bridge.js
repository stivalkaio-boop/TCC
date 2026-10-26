function readBridge() {
    return typeof window !== 'undefined' ? window.ReactNativeWebView : undefined;
}
/**
 * Whether the react-native-webview bridge is available in the current runtime.
 * Use this to branch on DOM Component context; use `getWebViewBridge()` to
 * actually interact with the bridge.
 */ export function hasWebViewBridge() {
    return readBridge() != null;
}
/**
 * Returns the react-native-webview bridge for DOM Component code. Throws when
 * the bridge is not available (e.g. the same module being evaluated outside of
 * a WebView); guard with `hasWebViewBridge()` when the caller may run in both
 * contexts.
 */ export function getWebViewBridge() {
    const bridge = readBridge();
    if (!bridge) {
        throw new Error('The react-native-webview bridge (window.ReactNativeWebView) is not available. ' + 'This module must only be called from code running inside a DOM Component WebView. ' + 'Guard the call with hasWebViewBridge() when the caller may also run on web or React Native.');
    }
    return bridge;
}

//# sourceMappingURL=webview-bridge.js.map
