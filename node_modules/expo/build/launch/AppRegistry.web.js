/**
 * Minimal AppRegistry for web, forked from react-native-web.
 * Original author: Nicolas Gallagher (Meta Platforms, Inc.)
 * Uses `react-dom/client` directly to avoid a hard dependency on react-native-web.
 */ import { jsx as _jsx } from "react/jsx-runtime";
const runnables = {};
// TODO: Remove react-native-web optional integration once we have a standalone web stylesheet solution.
function tryRequireStyleSheet() {
    try {
        return require('react-native-web/dist/exports/StyleSheet');
    } catch  {
        return null;
    }
}
function tryRequireCreateSheet() {
    try {
        const mod = require('react-native-web/dist/exports/StyleSheet/dom');
        return mod?.createSheet ?? null;
    } catch  {
        return null;
    }
}
function registerComponent(appKey, componentProvider) {
    runnables[appKey] = {
        getApplication: (appParameters)=>{
            const RootComponent = componentProvider();
            const initialProps = appParameters?.initialProps ?? {};
            const element = /*#__PURE__*/ _jsx(RootComponent, {
                ...initialProps
            });
            const getStyleElement = (props)=>{
                const StyleSheet = tryRequireStyleSheet();
                if (!StyleSheet?.getSheet) {
                    return /*#__PURE__*/ _jsx("style", {
                        ...props
                    });
                }
                const sheet = StyleSheet.getSheet();
                return /*#__PURE__*/ _jsx("style", {
                    ...props,
                    dangerouslySetInnerHTML: {
                        __html: sheet.textContent
                    },
                    id: sheet.id
                });
            };
            return {
                element,
                getStyleElement
            };
        },
        run: (appParameters)=>{
            const { hydrate, initialProps = {}, rootTag, callback } = appParameters;
            if (!rootTag) {
                throw new Error(`"rootTag" was not provided for appKey "${appKey}".`);
            }
            const RootComponent = componentProvider();
            const element = /*#__PURE__*/ _jsx(RootComponent, {
                ...initialProps
            });
            const createSheet = tryRequireCreateSheet();
            createSheet?.(rootTag);
            const { createRoot, hydrateRoot } = require('react-dom/client');
            if (hydrate) {
                const root = hydrateRoot(rootTag, element);
                if (callback) callback();
                return root;
            } else {
                const root = createRoot(rootTag);
                root.render(element);
                if (callback) callback();
                return root;
            }
        }
    };
    return appKey;
}
function getApplication(appKey, appParameters) {
    const runnable = runnables[appKey];
    if (!runnable) {
        throw new Error(`Application "${appKey}" has not been registered. ` + 'This is either due to an import error during initialization or failure to call AppRegistry.registerComponent.');
    }
    return runnable.getApplication(appParameters);
}
function runApplication(appKey, appParameters) {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        const params = {
            rootTag: `#${appParameters.rootTag?.id}`
        };
        for (const key of Object.keys(appParameters)){
            if (key !== 'rootTag') {
                params[key] = appParameters[key];
            }
        }
        // NOTE(@kitten): Only log when the parameters are non-default
        if (params.rootTag !== '#root' || params.hydrate || params.initialProps) {
            console.log(`Running application "${appKey}" with appParams:`, params);
        }
    }
    const runnable = runnables[appKey];
    if (!runnable) {
        throw new Error(`Application "${appKey}" has not been registered. ` + 'This is either due to an import error during initialization or failure to call AppRegistry.registerComponent.');
    }
    return runnable.run(appParameters);
}
export default {
    registerComponent,
    getApplication,
    runApplication
};

//# sourceMappingURL=AppRegistry.web.js.map
