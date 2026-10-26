export type DocCommentWarning = {
    /** A comment that was dropped, or one kept above a declaration that changed. */
    kind: 'dropped' | 'changed';
    /** Absolute path of the generated file. */
    file: string;
    /**
     * The symbol in TypeScript names: `Type`, `Type.member`, or `Type.member#2` for a later overload.
     * `line <n>` for a comment above no declaration or member.
     */
    location: string;
    message: string;
    /** The text of a dropped comment, so it can be added back by hand. */
    comment?: string;
};
export type PreservedDocComments = {
    /** The source with the comments in place, or `null` when there is no source to write. */
    source: string | null;
    warnings: DocCommentWarning[];
};
/**
 * Copies the comments of `previous`, the generated file as it is on disk, into `source`, a new
 * render of that file. Each comment goes above the symbol with the same TypeScript name, so it
 * follows the symbol when declarations move. An overload keeps its comment while its signature
 * stays the same. A comment whose symbol is gone is dropped, and a comment kept above a member or
 * one-line declaration that changed is reported, since it may no longer describe it. Throws when
 * `previous` does not parse.
 */
export declare function preserveDocComments(source: string | null, previous: string, file: string): PreservedDocComments;
