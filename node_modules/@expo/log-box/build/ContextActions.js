import { jsx as _jsx } from "react/jsx-runtime";
import React, { createContext, use } from 'react';
const ActionsContextProvider = /*#__PURE__*/ createContext({
    onMinimize: undefined,
    onReload: undefined,
    onCopyText: undefined
});
export const ActionsContext = ({ children, onMinimize, onReload, onCopyText })=>{
    return /*#__PURE__*/ _jsx(ActionsContextProvider, {
        value: {
            onMinimize,
            onReload,
            onCopyText
        },
        children: children
    });
};
export const withActions = (Component, actions)=>{
    return (props)=>/*#__PURE__*/ _jsx(ActionsContext, {
            ...actions,
            children: /*#__PURE__*/ _jsx(Component, {
                ...props
            })
        });
};
export const useActions = ()=>{
    const context = use(ActionsContextProvider);
    if (context === undefined) {
        throw new Error('useActions must be used within an ActionsProvider');
    }
    return context;
};

//# sourceMappingURL=ContextActions.js.map
