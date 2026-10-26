/**
 * Copyright © 2025 650 Industries.
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * This is added as `asyncRequireModulePath` in `@expo/metro-config`
 * Fork of https://github.com/facebook/metro/blob/b8e9e64f1de97a67234e223f5ee21524b160e8a5/packages/metro-runtime/src/modules/asyncRequire.js#L1
 * - Adds worker support.
 */ // Shim script that wraps around a given worker entrypoint and:
// - Remaps `fetch` to the base URL given
// - Remaps `importScripts` to the base URL given
// This doesn't cover all cases and won't fix that:
// - self.location will be set to a blob URL
// - new URL won't relatively resolve
// - XMLHttpRequest, WebSocket, etc won't relatively resolve
function makeWorkerContent(url) {
    return `
    const ASYNC_WORKER_BASE = ${JSON.stringify(url)};
    const IMPORT_SCRIPTS = importScripts;
    const FETCH = fetch;
    const fromBaseURL = (input) => new URL(input, ASYNC_WORKER_BASE).href;
    self.fetch = function(input, init) {
      return FETCH(typeof input === 'string' ? fromBaseURL(input) : input, init);
    };
    self.importScripts = function(...urls) {
      return IMPORT_SCRIPTS.apply(self, urls.map(fromBaseURL));
    };
    importScripts(ASYNC_WORKER_BASE);
  `;
}
function maybeLoadBundle(moduleID, paths) {
    const loadBundle = globalThis[`${__METRO_GLOBAL_PREFIX__ ?? ''}__loadBundleAsync`];
    if (loadBundle != null) {
        const stringModuleID = String(moduleID);
        if (paths != null) {
            const bundlePath = paths[stringModuleID];
            if (bundlePath != null) {
                // NOTE: Errors will be swallowed by asyncRequire.prefetch
                return loadBundle(bundlePath);
            }
        }
    }
    return undefined;
}
function asyncRequireImpl(moduleID, paths, moduleName) {
    const importAll = ()=>require.importAll(moduleID, moduleName);
    // NOTE(@hassankhan): We need to come back and improve this, ideally we shouldn't need to have a
    // separate conditional specifically for web
    // On web, split chunks may already be preloaded via `<script>` tags, so importing
    // synchronously first prevents double-loading the script
    if (process.env.EXPO_OS === 'web') {
        const bundlePath = paths?.[String(moduleID)];
        if (Array.isArray(bundlePath)) {
            const loadBundle = globalThis[`${__METRO_GLOBAL_PREFIX__ ?? ''}__loadBundleAsync`];
            if (loadBundle?.isReady?.(bundlePath)) return importAll();
            const maybeLoadBundlePromise = maybeLoadBundle(moduleID, paths);
            if (maybeLoadBundlePromise != null) return maybeLoadBundlePromise.then(importAll);
            throw new Error(`Cannot import module ${moduleName ?? moduleID}: the async bundle loader is unavailable. ` + `Load the initial Expo bundle before importing these chunks: ${bundlePath.join(', ')}`);
        }
        try {
            return importAll();
        } catch (error) {
            const maybeLoadBundlePromise = maybeLoadBundle(moduleID, paths);
            if (maybeLoadBundlePromise != null) {
                return maybeLoadBundlePromise.then(importAll);
            }
            throw error;
        }
    }
    // On native, requiring a missing module reports a fatal error via `global.ErrorUtils`
    // instead of throwing, so the split bundle must be loaded before importing
    const maybeLoadBundlePromise = maybeLoadBundle(moduleID, paths);
    if (maybeLoadBundlePromise != null) {
        return maybeLoadBundlePromise.then(importAll);
    }
    return importAll();
}
function asyncRequire(moduleID, paths, moduleName) {
    const ret = asyncRequireImpl(moduleID, paths, moduleName);
    // We return a Promise with an added `unstable_importMaybeSync`-like
    // `_result` property to bypass this being force-converted to a promise
    // for rehydration
    const promise = Promise.resolve(ret);
    promise._result = ret;
    return promise;
}
// Synchronous version of asyncRequire, which can still return a promise
// if the module is split.
asyncRequire.unstable_importMaybeSync = function unstable_importMaybeSync(moduleID, paths) {
    return asyncRequireImpl(moduleID, paths);
};
asyncRequire.prefetch = function(moduleID, paths, moduleName// unused
) {
    maybeLoadBundle(moduleID, paths)?.then(()=>{}, ()=>{});
};
asyncRequire.unstable_resolve = function unstable_resolve(moduleID, paths) {
    if (!paths) {
        throw new Error('Bundle splitting is required for Web Worker imports');
    }
    const id = paths[moduleID];
    if (!id) {
        throw new Error('Worker import is missing from split bundle paths: ' + id);
    }
    return id;
};
// Wraps around `new Worker` and if `crossOriginIsolated` is truthy, indicating CORP/COEP is active,
// instantiates the worker with an inline script instead, which works around the CORS error. This is
// necessary if the worker script won't have the same CORP/COEP headers as the document
asyncRequire.unstable_createWorker = function unstable_createWorker(workerUrl, workerOpts) {
    if (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) {
        try {
            const content = makeWorkerContent(workerUrl);
            workerUrl = URL.createObjectURL(new Blob([
                content
            ], {
                type: 'text/javascript'
            }));
            return new Worker(workerUrl, workerOpts);
        } finally{
            URL.revokeObjectURL(workerUrl);
        }
    } else {
        return new Worker(workerUrl, workerOpts);
    }
};
module.exports = asyncRequire;

//# sourceMappingURL=asyncRequireModule.js.map
