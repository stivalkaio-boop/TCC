import { withoutANSIColorStyles } from '@expo/log-box-utils';
export class HMRMetroBuildError extends Error {
    originalMessage;
    constructor(message = 'Unknown Metro Error', type, cause){
        super(message);
        this.name = type || 'BuildError';
        this.cause = cause;
        this.originalMessage = [
            type,
            message
        ].filter(Boolean).join(': ');
        this.message = withoutANSIColorStyles(message);
        this.stack = '';
    }
}

//# sourceMappingURL=buildErrors.js.map
