export class FetchError extends Error {
    constructor(message, { cause, stack } = {}){
        super(`fetch failed: ${message}`);
        this.cause = cause;
        this.stack = stack;
    }
    static createFromError(error) {
        return new FetchError(error.message, {
            cause: error.cause,
            stack: error.stack
        });
    }
}

//# sourceMappingURL=FetchErrors.js.map
