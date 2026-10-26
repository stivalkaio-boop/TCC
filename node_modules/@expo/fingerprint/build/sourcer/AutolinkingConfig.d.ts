/**
 * Normalizes resolved autolinking config before it is hashed.
 * Converts react-native-config dependency maps to a sorted array of objects and sorts known
 * arrays by their identifying field. `scriptPhases` is left in order.
 *
 * When `stripPaths` is true, filesystem path fields are omitted, including `scriptPhases[].path`
 * and `sourceDir` / `podspecPath` overrides from the project's **react-native.config.js**.
 * Linked names and `scriptPhases` names remain.
 */
export declare function normalizeAutolinkingConfig(config: unknown, options: {
    stripPaths: boolean;
    roots?: string[];
}): unknown;
/**
 * True when `value` is a filesystem path, including values already rewritten relative to
 * `projectRoot` or a dependency root.
 * URLs are kept so extra Maven repos and similar project settings still hash.
 */
export declare function isPathLike(value: string, roots: string[]): boolean;
