import type { ScanStats } from 'expo-modules-macros';
import { type GenerateTypesWarning } from '../typegen/generateTypes';
import type { DeclarationCounts } from '../typegen/renderSurface';
export declare function generateTypesCommand(argv: string[]): Promise<void>;
/**
 * Why a scan produced no declarations, from the counts the scanner reports: either no Swift file
 * at all, or files but no type exported to JavaScript.
 */
export declare function describeEmptyScan(stats: ScanStats, packageDir: string): string;
/**
 * The heading of the warnings block, counting them and how many rendered a type as unknown,
 * skipped a declaration, or dropped a doc comment: `3 warnings, 2 rendered as unknown, 1 skipped:`.
 * `null` without warnings.
 */
export declare function describeWarnings(warnings: GenerateTypesWarning[]): string | null;
/** The non-zero declaration counts, e.g. `1 module, 4 enums`. */
export declare function describeCounts(counts: DeclarationCounts): string;
