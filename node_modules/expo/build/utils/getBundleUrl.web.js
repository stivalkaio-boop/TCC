// Copyright 2015-present 650 Industries. All rights reserved.
// `document.currentScript` is only set during synchronous script execution, so we capture its URL
// at module load; reading it later (effect, async, dynamic import) would see `null`.
const initialScriptURL = typeof window !== 'undefined' ? document.currentScript?.src : null;
export function getBundleUrl() {
    let scriptURL = initialScriptURL;
    if (typeof window === 'undefined') {
        // For server runtime, we use the filename of the current script
        scriptURL = 'file://' + __filename;
    }
    if (scriptURL == null) {
        return null;
    }
    const url = new URL(scriptURL);
    return `${url.protocol}//${url.host}${url.pathname}`;
}

//# sourceMappingURL=getBundleUrl.web.js.map
