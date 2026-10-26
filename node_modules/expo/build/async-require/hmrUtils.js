import * as devLoadingViewEmitter from '../devLoadingViewEmitter';
import { getFullBundlerUrl as getFullBundlerUrlHelper } from '../utils/getFullBundlerUrl';
import { HMRMetroBuildError } from './buildErrors';
export function getFullBundlerUrl(_) {
    return getFullBundlerUrlHelper();
}
export function showLoading(message, _type) {
    // Ensure events are sent so custom Fast Refresh views are shown.
    devLoadingViewEmitter.emit('devLoadingView:showMessage', {
        message
    });
}
export function hideLoading() {
    devLoadingViewEmitter.emit('devLoadingView:hide', {});
}
export function resetErrorOverlay() {
    // @ts-expect-error
    globalThis.__expo_dev_resetErrors?.();
}
export function reload() {
    // "Bundle Splitting – Metro disconnected"
    window.location.reload();
}
export function getConnectionError(serverHost, e) {
    return `
Cannot connect to Expo CLI.

Try the following to fix the issue:
- Ensure the Expo dev server is running and available on the same network as this device

URL: ${serverHost}

Error: ${e.message}
  `.trim();
}
export function handleCompileError(cause) {
    if (!cause) {
        return;
    }
    throw new HMRMetroBuildError(cause.message, cause.type, cause.cause);
}

//# sourceMappingURL=hmrUtils.js.map
