import { jsx as _jsx } from "react/jsx-runtime";
import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { Image, View } from 'react-native';
import { webviewStyles } from './styles';
const { resolveAssetSource } = Image;
const NativeWebView = requireNativeViewManager('ExpoDomWebViewModule');
const WebView = /*#__PURE__*/ React.forwardRef(({ containerStyle, style, injectedJavaScriptObject, ...props }, ref)=>{
    const viewRef = React.useRef(null);
    React.useImperativeHandle(ref, ()=>({
            scrollTo: (params)=>viewRef.current?.scrollTo(params),
            injectJavaScript: (script)=>viewRef.current?.injectJavaScript(script),
            reload: ()=>viewRef.current?.reload()
        }), []);
    const webViewStyles = [
        webviewStyles.container,
        webviewStyles.webView,
        style
    ];
    const webViewContainerStyle = [
        webviewStyles.container,
        containerStyle
    ];
    const resolvedSource = resolveAssetSource(props.source);
    return /*#__PURE__*/ _jsx(View, {
        style: webViewContainerStyle,
        children: /*#__PURE__*/ _jsx(NativeWebView, {
            ...props,
            ref: viewRef,
            source: resolvedSource,
            style: webViewStyles,
            injectedJavaScriptObject: JSON.stringify(injectedJavaScriptObject ?? {})
        })
    });
});
export default WebView;

//# sourceMappingURL=DomWebView.js.map
