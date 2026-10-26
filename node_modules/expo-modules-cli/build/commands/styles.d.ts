/**
 * The few text styles the CLI uses, so each kind of token looks the same wherever it appears.
 * Every helper takes the stream the text is written to: `styleText` checks whether that stream is
 * a terminal, and stdout and stderr may differ when one of them is redirected.
 */
/** A path, cyan so it reads as a location wherever it appears. */
export declare function styleFileName(name: string, stream?: NodeJS.WriteStream): string;
/** A type or member name, bold as the subject of its line. */
export declare function styleTypeName(name: string, stream?: NodeJS.WriteStream): string;
/** A declaration kind such as `enum` or `module`: a category label, magenta like a keyword. */
export declare function styleKind(kind: string, stream?: NodeJS.WriteStream): string;
/** The heading of the warnings block and the bullet of each warning, yellow to mark a warning. */
export declare function styleWarning(text: string, stream?: NodeJS.WriteStream): string;
/** The text of a doc comment, gray like comments in a code editor. */
export declare function styleComment(text: string, stream?: NodeJS.WriteStream): string;
