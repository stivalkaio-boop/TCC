import '../Expo.fx';
import AppRegistry from './AppRegistry';
/**
 * Sets the initial React component to render in the app's root view on the web.
 *
 * This is the web fork of `registerRootComponent`. It uses a local AppRegistry
 * backed by `react-dom/client` instead of depending on `react-native-web`.
 */ export default function registerRootComponent(component) {
    let qualifiedComponent = component;
    if (process.env.NODE_ENV !== 'production') {
        const { withDevTools } = require('./withDevTools');
        qualifiedComponent = withDevTools(component);
    }
    AppRegistry.registerComponent('main', ()=>qualifiedComponent);
    // Skip querying the DOM if we're in a Node.js environment.
    if (typeof window !== 'undefined') {
        const rootTag = document.getElementById('root');
        if (process.env.NODE_ENV !== 'production') {
            if (!rootTag) {
                throw new Error('Required HTML element with id "root" was not found in the document HTML.');
            }
        }
        AppRegistry.runApplication('main', {
            rootTag,
            hydrate: globalThis.__EXPO_ROUTER_HYDRATE__
        });
    }
}

//# sourceMappingURL=registerRootComponent.web.js.map
