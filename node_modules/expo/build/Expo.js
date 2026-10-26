import './Expo.fx';
export { disableErrorHandling } from './errors/ExpoErrorManager';
export { default as registerRootComponent } from './launch/registerRootComponent';
export { isRunningInExpoGo, getExpoGoProjectConfig } from './environment/ExpoGo';
export { // Core classes
EventEmitter, SharedObject, SharedRef, NativeModule, UnavailabilityError, CodedError, // Methods
requireNativeModule, requireOptionalNativeModule, requireNativeViewManager as requireNativeView, registerWebModule, reloadAppAsync, // Worklets
installOnUIRuntime, // Utils
Platform, uuid, createSnapshotFriendlyRef, useReleasingSharedObject, useReleasingSharedObjectWithLifecycle } from 'expo-modules-core';
export { PermissionStatus } from 'expo-modules-core';
export { createPermissionHook } from 'expo-modules-core';
export { useEvent, useEventListener } from './hooks/useEvent';

//# sourceMappingURL=Expo.js.map
