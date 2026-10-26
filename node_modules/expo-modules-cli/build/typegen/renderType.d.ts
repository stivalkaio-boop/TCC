import type { TypeNode } from 'expo-modules-macros';
/**
 * What a warning is about: a type rendered as `unknown`, a type loosened to a wider one such as
 * `number` or `never`, a declaration or member skipped, or an events map inlined into its class.
 */
export type RenderWarningKind = 'unknown' | 'loosened' | 'skipped' | 'inlined';
export type RenderContext = {
    /** Maps a Swift type name to the TS name of a scanned record, shared object, or module. */
    resolveRef(name: string): string | undefined;
    /** Receives each gap the renderer had to paper over, with its kind and a message. */
    warn(kind: RenderWarningKind, message: string): void;
};
/**
 * Renders a scanner `TypeNode` as TypeScript source. Anything the scanner could not model, or a
 * reference to a type it did not scan, becomes `unknown` and is reported through `ctx.warn` so the
 * gap stays visible instead of silently loosening the generated API.
 */
export declare function renderType(node: TypeNode, ctx: RenderContext): string;
/**
 * Renders a function's result: `void` when absent, and wrapped in a promise for an async function
 * unless the declared result already is one.
 */
export declare function renderReturnType(returns: TypeNode | undefined, isAsync: boolean, ctx: RenderContext): string;
