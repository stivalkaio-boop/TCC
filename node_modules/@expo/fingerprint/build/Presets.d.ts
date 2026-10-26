import type { ConfigPluginSourceType, FingerprintPreset, NativeModuleSourceType } from './Fingerprint.types';
import { SourceSkips } from './sourcer/SourceSkips';
export interface ResolvedPreset {
    sourceSkips: SourceSkips;
    nativeModuleSourceType: NativeModuleSourceType;
    configPluginSourceType: ConfigPluginSourceType;
}
/**
 * The preset used when a project doesn't configure one.
 */
export declare const DEFAULT_PRESET: FingerprintPreset;
/**
 * Resolve a preset name to the settings it stands for.
 *
 * - `strict`: highest fidelity - the historical default. Only skips prebuild-mutated package.json
 *   scripts so a fingerprint stays consistent before and after prebuild. Autolinking config is
 *   still sorted before hashing, so the fingerprint changes once on upgrade.
 * - `balanced`: the default. Also ignores app version and string runtime version churn, the EAS
 *   Build files (`eas.json` and `.easignore`), and path fields in the resolved autolinking config,
 *   and hashes autolinked packages and node_modules config-plugin modules by their `package.json`
 *   version. Best first-time experience.
 * - `relaxed`: for building multiple variants from one native project. Additionally ignores app
 *   names, bundle identifiers, schemes, and assets, while still hashing the config-plugins list so
 *   adding a plugin still changes the fingerprint.
 */
export declare function resolvePreset(preset: FingerprintPreset): ResolvedPreset;
