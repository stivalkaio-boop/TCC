import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import * as React from 'react';
import DevLoadingView from '../environment/DevLoadingView';
export function withDevTools(AppRootComponent) {
    function WithDevTools(props) {
        return /*#__PURE__*/ _jsxs(_Fragment, {
            children: [
                /*#__PURE__*/ _jsx(AppRootComponent, {
                    ...props
                }),
                /*#__PURE__*/ _jsx(DevLoadingView, {})
            ]
        });
    }
    if (process.env.NODE_ENV !== 'production') {
        const name = AppRootComponent.displayName || AppRootComponent.name || 'Anonymous';
        WithDevTools.displayName = `withDevTools(${name})`;
    }
    return WithDevTools;
}

//# sourceMappingURL=withDevTools.web.js.map
