import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { View } from 'react-native';
import { webviewStyles } from './styles';
const WebView = /*#__PURE__*/ React.forwardRef(({ containerStyle, style, ...props }, ref)=>{
    const viewRef = React.useRef(null);
    const webViewStyles = [
        webviewStyles.container,
        webviewStyles.webView,
        style
    ];
    const webViewContainerStyle = [
        webviewStyles.container,
        containerStyle
    ];
    return /*#__PURE__*/ _jsx(View, {
        style: webViewContainerStyle,
        children: /*#__PURE__*/ _jsx(View, {
            ...props,
            ref: viewRef,
            style: webViewStyles,
            children: /*#__PURE__*/ _jsx("iframe", {
                src: props.source.uri
            })
        })
    });
});
export default WebView;

//# sourceMappingURL=DomWebView.web.js.map
