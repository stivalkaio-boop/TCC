/**
 * A Swift identifier without the backticks that let a reserved word name a declaration
 * (`` `default` ``). The scanner reports names as written, and the backticks are not part of the name.
 */
export declare function stripBackticks(name: string): string;
/** Whether `name` can appear unquoted as a TypeScript identifier (ASCII letters, digits, `_`, `$`). */
export declare function isIdentifier(name: string): boolean;
/** A class or type member name: as is when it is an identifier, quoted as a string literal otherwise. */
export declare function memberName(name: string): string;
/**
 * A parameter name that TypeScript accepts. A reserved word gets a trailing underscore, and a name
 * that is not an identifier at all falls back to a positional name.
 */
export declare function parameterName(name: string, index: number): string;
