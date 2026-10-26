// Not imported from react-native: the type is not exported by the strict API,
// and this module is also compiled by strict-API consumers via the
// `expo-source` condition (e.g. @expo/log-box).
export function createErrorHandler(originalHandler) {
    return (error, isFatal)=>originalHandler(error, isFatal);
}
/**
 * @hidden
 * @deprecated Will be removed in the future.
 */ export function disableErrorHandling() {}

//# sourceMappingURL=ExpoErrorManager.js.map
