/**
 * Copyright (c) 650 Industries.
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ // @ts-expect-error
import { Networking } from 'react-native';
class LoadBundleFromServerError extends Error {
    url;
    isTimeout;
    name = 'LoadBundleFromServerError';
    constructor(message, url, isTimeout, options){
        super(message, options), this.url = url, this.isTimeout = isTimeout;
    }
}
class LoadBundleFromServerRequestError extends LoadBundleFromServerError {
    name = 'LoadBundleFromServerRequestError';
}
export function fetchAsync(url) {
    let id = null;
    let statusCode = null;
    let responseText = null;
    let headers = {};
    let dataListener = null;
    let completeListener = null;
    let responseListener = null;
    let incrementalDataListener = null;
    return new Promise((resolve, reject)=>{
        const addListener = Networking.addListener.bind();
        dataListener = addListener('didReceiveNetworkData', ([requestId, response])=>{
            if (requestId === id) {
                responseText = response;
            }
        });
        incrementalDataListener = addListener('didReceiveNetworkIncrementalData', ([requestId, data])=>{
            if (requestId === id) {
                if (responseText != null) {
                    responseText += data;
                } else {
                    responseText = data;
                }
            }
        });
        responseListener = addListener('didReceiveNetworkResponse', ([requestId, status, responseHeaders])=>{
            if (requestId === id) {
                statusCode = status;
                headers = responseHeaders;
            }
        });
        completeListener = addListener('didCompleteNetworkResponse', ([requestId, error, isTimeout])=>{
            if (requestId === id) {
                if (error) {
                    reject(new LoadBundleFromServerRequestError('Could not load bundle', url, isTimeout, {
                        cause: error
                    }));
                } else {
                    resolve({
                        body: responseText,
                        status: statusCode,
                        headers
                    });
                }
            }
        });
        Networking.sendRequest('GET', 'asyncRequest', url, {
            'expo-platform': process.env.EXPO_OS
        }, '', 'text', true, 0, (requestId)=>{
            id = requestId;
        }, true);
    }).finally(()=>{
        dataListener?.remove();
        completeListener?.remove();
        responseListener?.remove();
        incrementalDataListener?.remove();
    });
}

//# sourceMappingURL=fetchAsync.native.js.map
