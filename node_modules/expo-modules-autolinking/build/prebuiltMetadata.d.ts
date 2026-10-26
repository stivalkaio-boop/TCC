import type { LinkingOptionsLoader } from './commands/autolinkingOptions';
export interface PrebuiltMetadataEntry extends PrebuiltProductFields {
    type: 'internal' | 'external';
    npmPackage: string;
    packageRoot: string;
    podspecDir: string;
    productName: string;
}
/** The fields read from a product's spm.config.json entry. Each needs a reader in
 * `PRODUCT_FIELD_READERS`, which the compiler enforces. */
export interface PrebuiltProductFields {
    /** The product is built from source only — the prebuild pipeline never
     * produces an XCFramework for it. Absent where it does. */
    sourceOnly?: boolean;
    /** The product's iOS deployment floor as a plain version string ("16.4").
     * Absent where the config declares none this can read. */
    iosDeploymentTarget?: string;
    /** The SPM packages the product links. A consumer of the precompiled product
     * links each one as the XCFramework named after its `productName`, shipped
     * beside the product; a consumer building from source declares the package.
     * Absent where the product declares none this can render. */
    spmPackages?: PrebuiltSpmPackage[];
    /** The gate deciding whether the product is linked at all, present whenever
     * the product declares one — a gate this could not read whole is a gate that
     * is never met, not an absent one. Absent where the product declares none. */
    autolinkWhen?: PrebuiltAutolinkWhen;
}
export type PrebuiltSpmVersion = {
    exact: string;
} | {
    from: string;
} | {
    branch: string;
} | {
    revision: string;
};
export interface PrebuiltSpmPackage {
    url: string;
    productName: string;
    version: PrebuiltSpmVersion;
}
/** A companion product's autolinking gate, as Ruby's
 * `companion_autolink_condition_met?` and its port in
 * `expo/scripts/spm/autolink-gate.js` evaluate it: the first subject the
 * condition declares decides it and the rest are never read — `podName` (a pod
 * this install emits), then `npmPackage` (a package the app autolinks), then
 * `podfileProperty` (set to anything but `disabledValue`). A condition
 * declaring no subject is never met, so an unreadable gate withholds its
 * product rather than releasing it. `disabledValue` qualifies only
 * `podfileProperty` and keeps whatever the config gave it, of whatever type:
 * it is compared against a property value, never rendered, and narrowing it
 * would answer a comparison differently from CocoaPods.
 *
 * The comparison is strict equality, which agrees with Ruby's `!=` on every
 * scalar but not on containers — Ruby holds two equal-valued hashes equal
 * where JavaScript compares them by identity. A Podfile property is a string
 * in practice, so this limit is unreachable; do not close it with a deep
 * equality neither integration promises. */
export interface PrebuiltAutolinkWhen {
    podName?: string;
    npmPackage?: string;
    podfileProperty?: string;
    disabledValue?: unknown;
}
export type PrebuiltMetadataDocument = Record<string, PrebuiltMetadataEntry>;
export interface ResolvePrebuiltMetadataOptions {
    /** 'catalog' scans the expo repository's packages/ tree (app-independent);
     * 'app-plan' locates configs through the app's module resolution.
     * Defaults to 'catalog' inside an expo repository checkout, 'app-plan' elsewhere. */
    mode?: 'catalog' | 'app-plan';
}
/** Resolves the prebuilt-modules metadata document (ENG-25370): the identity
 * join between npm packages, pods, and products, for internal and external
 * products. */
export declare function resolvePrebuiltMetadataAsync(optionsLoader: LinkingOptionsLoader, { mode }?: ResolvePrebuiltMetadataOptions): Promise<PrebuiltMetadataDocument>;
