import type { ScanStats } from 'expo-modules-macros';
import { type DocCommentWarning } from './docComments';
import { type DeclarationCounts, type RenderedDeclaration, type RenderWarning } from './renderSurface';
export type GenerateTypesOptions = {
    /** The Expo module package to scan. Absolute. */
    packageDir: string;
    /** The TypeScript file to write. Absolute. */
    outputPath: string;
    /** A scanner executable to use instead of the one shipped with the macros plugin. */
    scannerPath?: string;
    /** Report what a run would do without touching the file: `stale` instead of a write or removal. */
    check?: boolean;
};
export type GenerateTypesOutcome = 
/** The file was written with new content. */
{
    kind: 'written';
    outputPath: string;
}
/** The file already held exactly this content, so it was left untouched. */
 | {
    kind: 'unchanged';
    outputPath: string;
}
/** The package exports nothing and a file this tool generated earlier was removed. */
 | {
    kind: 'removed';
    outputPath: string;
}
/** The package exports nothing and there was no generated file to remove. */
 | {
    kind: 'empty';
}
/** With `check`: the file is missing, outdated, or no longer needed, and a run would write or remove it. */
 | {
    kind: 'stale';
    outputPath: string;
    expected: 'written' | 'removed';
};
export type GenerateTypesWarning = RenderWarning | DocCommentWarning;
export type GenerateTypesResult = {
    outcome: GenerateTypesOutcome;
    warnings: GenerateTypesWarning[];
    stats: ScanStats;
    /** Declarations written, per kind; skipped ones are not counted. */
    counts: DeclarationCounts;
    /** The declarations written, in file order. Empty when the package exports nothing. */
    declarations: RenderedDeclaration[];
};
/**
 * Scans one Expo module package for its JS-exported native types and writes them as a single
 * TypeScript file, leaving the file untouched when it already holds that content. Nothing is
 * written when the package exports no types; a file this tool generated on an earlier run is
 * removed then, so no stale declarations stay behind. The output file is only ever replaced or
 * removed when it carries this tool's header, so a hand-written file at the same path is never
 * lost. The doc comments of a file this tool generated stay above the declarations and members of
 * the same names. With `check`, the file is not touched at all and a pending write or removal is
 * reported as `stale`.
 */
export declare function generateTypes({ packageDir, outputPath, scannerPath, check, }: GenerateTypesOptions): Promise<GenerateTypesResult>;
