/**
 * Copyright © 2022 650 Industries.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ import { buildUrlForBundle } from './buildUrlForBundle';
import { loadBundleAsync } from './loadBundle';
/** Create an `loadBundleAsync` function in the expected shape for Metro bundler. */ export function buildAsyncRequire() {
    const cache = new Map();
    const runtime = globalThis;
    // Keep any completions recorded before the loader was installed.
    const registryKey = `${runtime.__METRO_GLOBAL_PREFIX__ ?? ''}__expo_chunk_completion__`;
    const completedUrls = process.env.EXPO_OS === 'web' && process.env.NODE_ENV === 'production' ? runtime[registryKey] ??= new Set() : undefined;
    const getCacheKey = (path)=>{
        if (!completedUrls) return path;
        const url = buildUrlForBundle(path);
        return typeof document === 'undefined' ? url : new URL(url, document.baseURI).href;
    };
    async function loadFileAsync(path, requireCompletion = false) {
        const cacheKey = getCacheKey(path);
        if (completedUrls?.has(cacheKey)) return;
        let promise = cache.get(cacheKey);
        if (!promise) {
            promise = loadBundleAsync(path).catch((error)=>{
                if (cache.get(cacheKey) === promise) cache.delete(cacheKey);
                throw error;
            });
            cache.set(cacheKey, promise);
        }
        await promise;
        // A script can fire 'load' even if it threw before registering every module.
        if (requireCompletion && completedUrls && !completedUrls.has(cacheKey)) {
            if (cache.get(cacheKey) === promise) cache.delete(cacheKey);
            throw new Error(`Chunk ${cacheKey} did not finish registering its modules. ` + 'Check the console for an earlier script error. ' + 'If none is present, report this as an Expo bug.');
        }
    }
    const load = async function universal_loadBundleAsync(path) {
        if (typeof path === 'string') return loadFileAsync(path);
        await Promise.all(path.map((file)=>loadFileAsync(file, true)));
    };
    if (completedUrls) load.isReady = (paths)=>paths.every((path)=>completedUrls.has(getCacheKey(path)));
    return load;
}

//# sourceMappingURL=buildAsyncRequire.js.map
