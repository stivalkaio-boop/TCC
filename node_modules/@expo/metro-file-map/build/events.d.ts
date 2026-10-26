import type { SerializedError } from '2g';
declare module '2g' {
    interface EventRegistry {
        'filemap:build': {
            crawler: 'node' | 'watchman';
            fromCache: boolean;
        };
        'filemap:cache:read_error': {
            error: SerializedError;
        };
        'filemap:watchman:unavailable': {
            reason: string;
        };
        'filemap:hydrate': {
            fromCache: boolean;
        };
        'filemap:crawl': {
            crawler: 'node' | 'watchman';
            full: boolean;
            changed: number;
            removed: number;
        };
        'filemap:process': {
            processed: number;
        };
        'filemap:persist': Record<string, never>;
    }
}
export declare const event: import("2g").EventLogger<"filemap">;
export declare const debugEvent: import("2g").EventLogger<"filemap">;
