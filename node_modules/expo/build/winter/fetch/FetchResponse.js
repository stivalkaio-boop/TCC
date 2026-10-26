import { ExpoFetchModule } from './ExpoFetchModule';
import { createReactNativeBlobAsync, isReactNativeBlobGlobal } from './createBlob';
const ConcreteNativeResponse = ExpoFetchModule.NativeResponse;
const stateKey = Symbol('FetchResponse.state');
let hasWarnedAboutReactNativeBlob = false;
function wrapWithConsumption(source, body) {
    const reader = source.getReader();
    let markedConsumed = false;
    let markedDetached = false;
    const stream = new ReadableStream({
        async pull (controller) {
            if (!markedConsumed && !markedDetached) {
                markedConsumed = true;
                body.consumed = true;
            }
            try {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    reader.releaseLock();
                } else {
                    controller.enqueue(value);
                }
            } catch (error) {
                controller.error(error);
                reader.releaseLock();
            }
        },
        cancel (reason) {
            if (!markedConsumed && !markedDetached) {
                markedConsumed = true;
                body.consumed = true;
            }
            // ReadableStreamTee uses a single shared cancelPromise that only
            // resolves once both branches are canceled, so awaiting here would
            // hang whenever the user cancels just one side.
            reader.cancel(reason).catch(()=>{});
        }
    }, {
        // Keep pull lazy. The default highWaterMark of 1 would fire pull at
        // construction and flip consumed before anything had actually been read.
        highWaterMark: 0
    });
    return {
        stream,
        detach: ()=>{
            markedDetached = true;
        }
    };
}
// JS-side body state. Held behind the stateKey symbol slot.
class Body {
    streamingState = 'none';
    stream = null;
    cloned;
    consumed = false;
    // Detach fn for the wrapper currently held in `stream`. Null until the
    // first clone wraps the native stream.
    detach = null;
    constructor({ cloned }){
        this.cloned = cloned;
    }
    get used() {
        // After clone(), each branch tracks its own reads via its wrapper, and
        // streamingState would flip on either branch's read, so we ignore it here.
        if (this.cloned) {
            return this.consumed;
        }
        return this.consumed || this.streamingState !== 'none';
    }
    async readAsBuffer() {
        if (this.stream == null) {
            return new ArrayBuffer(0);
        }
        const reader = this.stream.getReader();
        const chunks = [];
        let length = 0;
        try {
            while(true){
                const { done, value } = await reader.read();
                if (!done) {
                    chunks.push(value);
                    length += value.byteLength;
                } else {
                    break;
                }
            }
        } finally{
            reader.releaseLock();
        }
        const output = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks){
            output.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return output.buffer;
    }
}
/**
 * A response implementation for the `fetch.Response` API.
 */ export class FetchResponse extends ConcreteNativeResponse {
    abortCleanupFunction;
    [stateKey] = {
        body: new Body({
            cloned: false
        }),
        metadata: null
    };
    // `bodyStreamClosed` is only a fast path — the stream can leave `readable`
    // without it being set, so every controller call must also ask the controller.
    bodyStreamClosed = false;
    bodyStreamController = null;
    abortReason = undefined;
    constructor(abortCleanupFunction){
        super(), this.abortCleanupFunction = abortCleanupFunction;
        this.addListener('readyForJSFinalization', this.finalize);
    }
    /**
   * Rejects the pending body read with the abort reason and closes the
   * teardown guard so late native events are dropped (#34804). Idempotent,
   * and safe to call before the body stream exists.
   */ abort(reason) {
        const abortError = reason != null ? reason : typeof DOMException !== 'undefined' ? new DOMException('The operation was aborted.', 'AbortError') : Object.assign(new Error('The operation was aborted.'), {
            name: 'AbortError'
        });
        this.abortReason = abortError;
        if (this.bodyStreamClosed) {
            return;
        }
        this.bodyStreamClosed = true;
        try {
            this.bodyStreamController?.error(abortError);
        } catch  {
        // Controller already closed/errored — nothing to propagate.
        }
    }
    /**
   * These helpers run on the native emitter's stack, where a throw reaches the
   * global handler. The guard can be stale (internal stream errors bypass
   * `controller.error()`), so check `desiredSize` (null = errored) and catch.
   */ closeBodyStream(controller) {
        if (this.bodyStreamClosed) {
            return;
        }
        this.bodyStreamClosed = true;
        if (controller.desiredSize == null) {
            return;
        }
        try {
            controller.close();
        } catch  {
        // Closed by another path.
        }
    }
    errorBodyStream(controller, error) {
        if (this.bodyStreamClosed) {
            return;
        }
        this.bodyStreamClosed = true;
        try {
            controller.error(error);
        } catch  {
        // Already closed or errored.
        }
    }
    enqueueBodyChunk(controller, data) {
        if (this.bodyStreamClosed || controller.desiredSize == null) {
            return;
        }
        try {
            controller.enqueue(data);
        } catch  {
        // The stream left `readable` between the check and the enqueue — drop
        // the chunk; throwing would error the stream behind the guard's back.
        }
    }
    // Originals have metadata=null and fall through to the native getter via super.
    // Clones carry a snapshot and stand alone.
    get _rawHeaders() {
        return this[stateKey].metadata?.rawHeaders ?? super._rawHeaders;
    }
    get status() {
        return this[stateKey].metadata?.status ?? super.status;
    }
    get statusText() {
        return this[stateKey].metadata?.statusText ?? super.statusText;
    }
    get url() {
        return this[stateKey].metadata?.url ?? super.url;
    }
    get redirected() {
        return this[stateKey].metadata?.redirected ?? super.redirected;
    }
    get type() {
        return 'default';
    }
    get body() {
        const body = this[stateKey].body;
        if (body.stream == null) {
            // `bodyStreamClosed` prevents enqueuing/closing after the stream is
            // closed, canceled, or aborted — native code may keep sending
            // `didReceiveResponseData` past that point.
            body.stream = new ReadableStream({
                start: (controller)=>{
                    this.bodyStreamController = controller;
                    // Aborted before the first read — reject immediately.
                    if (this.abortReason !== undefined) {
                        this.bodyStreamClosed = true;
                        controller.error(this.abortReason);
                        return;
                    }
                    if (body.streamingState === 'completed') {
                        return;
                    }
                    this.addListener('didReceiveResponseData', (data)=>{
                        this.enqueueBodyChunk(controller, data);
                    });
                    this.addListener('didComplete', ()=>{
                        this.closeBodyStream(controller);
                    });
                    this.addListener('didFailWithError', (error)=>{
                        this.errorBodyStream(controller, new Error(error));
                    });
                },
                pull: async (controller)=>{
                    if (body.streamingState === 'none') {
                        const completedData = await this.startStreaming();
                        if (completedData != null) {
                            this.enqueueBodyChunk(controller, completedData);
                            this.closeBodyStream(controller);
                            body.streamingState = 'completed';
                        } else {
                            body.streamingState = 'started';
                        }
                    } else if (body.streamingState === 'completed') {
                        this.closeBodyStream(controller);
                    }
                },
                cancel: (reason)=>{
                    // Flag first — the stream is already `closed` when this callback
                    // runs, so the guard must not go stale if cancelStreaming throws.
                    this.bodyStreamClosed = true;
                    this.cancelStreaming(String(reason));
                }
            }, {
                // Keep pull lazy. The default highWaterMark of 1 would fire pull at
                // construction and flip streamingState before anything had actually
                // been read, making bodyUsed return true after merely touching .body.
                highWaterMark: 0
            });
        }
        return body.stream;
    }
    get bodyUsed() {
        return this[stateKey].body.used;
    }
    get headers() {
        return new Headers(this._rawHeaders);
    }
    get ok() {
        return this.status >= 200 && this.status < 300;
    }
    async blob() {
        this.checkBodyUsedError('blob');
        const type = this.headers.get('content-type') ?? '';
        const buffer = await this.arrayBuffer();
        if (isReactNativeBlobGlobal()) {
            if (__DEV__ && !hasWarnedAboutReactNativeBlob) {
                hasWarnedAboutReactNativeBlob = true;
                console.warn("Response.blob() is using React Native's Blob, which copies the response into the native blob store and reads it back through base64 encoding. This may be slow for large responses. Add the `expo-blob` package to your app to avoid the performance overhead.");
            }
            return createReactNativeBlobAsync(buffer, type);
        }
        return new Blob([
            buffer
        ], {
            type
        });
    }
    async formData() {
        this.checkBodyUsedError('formData');
        // Reference implementation:
        // https://chromium.googlesource.com/chromium/src/+/ed9f0b5933cf5ffb413be1ca844de5be140514bf/third_party/blink/renderer/core/fetch/body.cc#120
        const text = await this.text();
        const searchParams = new URLSearchParams(text);
        const formData = new FormData();
        searchParams.forEach((value, key)=>{
            formData.append(key, value);
        });
        return formData;
    }
    async json() {
        this.checkBodyUsedError('json');
        const text = await this.text();
        return JSON.parse(text);
    }
    async bytes() {
        this.checkBodyUsedError('bytes');
        return new Uint8Array(await this.arrayBuffer());
    }
    async arrayBuffer() {
        this.checkBodyUsedError('arrayBuffer');
        const body = this[stateKey].body;
        body.consumed = true;
        if (body.cloned) {
            return body.readAsBuffer();
        }
        return super.arrayBuffer();
    }
    async text() {
        this.checkBodyUsedError('text');
        const body = this[stateKey].body;
        body.consumed = true;
        if (body.cloned) {
            return new TextDecoder().decode(await body.readAsBuffer());
        }
        return super.text();
    }
    toString() {
        return `FetchResponse: { status: ${this.status}, statusText: ${this.statusText}, url: ${this.url} }`;
    }
    toJSON() {
        return {
            status: this.status,
            statusText: this.statusText,
            redirected: this.redirected,
            url: this.url
        };
    }
    clone() {
        this.checkBodyUsedError('clone');
        const state = this[stateKey];
        // Object.create skips the native constructor. The clone reads metadata
        // from its own snapshot, so it doesn't touch native after this.
        const clone = Object.create(FetchResponse.prototype);
        const cloneState = {
            body: new Body({
                cloned: true
            }),
            metadata: {
                rawHeaders: this._rawHeaders.slice(),
                status: this.status,
                statusText: this.statusText,
                url: this.url,
                redirected: this.redirected
            }
        };
        Object.defineProperty(clone, stateKey, {
            value: cloneState,
            configurable: true,
            writable: true
        });
        // Tee so both responses can be read independently. Each branch is wrapped
        // so the first read flips the right consumed flag (otherwise bodyUsed lies).
        if (this.body != null) {
            // Detach the existing wrapper so reads via the new tee don't flip
            // this body's consumed flag through it.
            state.body.detach?.();
            const [stream1, stream2] = this.body.tee();
            const own = wrapWithConsumption(stream1, state.body);
            const sibling = wrapWithConsumption(stream2, cloneState.body);
            state.body.stream = own.stream;
            state.body.detach = own.detach;
            cloneState.body.stream = sibling.stream;
            cloneState.body.detach = sibling.detach;
        }
        state.body.cloned = true;
        return clone;
    }
    checkBodyUsedError(method) {
        const body = this[stateKey].body;
        if (body.used || body.stream?.locked === true) {
            throw new TypeError(`Failed to execute '${method}' on 'Response': Response body is already used.`);
        }
    }
    finalize = ()=>{
        this.removeListener('readyForJSFinalization', this.finalize);
        this.abortCleanupFunction();
        this.removeAllListeners('didReceiveResponseData');
        this.removeAllListeners('didComplete');
        this.removeAllListeners('didFailWithError');
    };
}
Object.defineProperty(FetchResponse.prototype, Symbol.toStringTag, {
    value: 'Response',
    configurable: true
});

//# sourceMappingURL=FetchResponse.js.map
