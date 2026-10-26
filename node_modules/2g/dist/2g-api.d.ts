import {
  P as ParsedEvent,
  E as EventLoggerMetadata,
  S as SessionMeta,
} from './chunks/session-chunk.js';
export { M as MetadataRegistry } from './chunks/session-chunk.js';
import { StdioOptions, ChildProcess } from 'node:child_process';

interface EventFilterOptions {
  since?: number | string | Date;
  filter?: string | string[];
  spans?: boolean;
  debug?: boolean;
}

interface TapOptions extends EventFilterOptions {
  follow?: boolean;
  signal?: AbortSignal;
  timeout?: number;
  idleTimeout?: number;
}
declare function tap(sessionDir: string, options?: TapOptions): AsyncIterable<ParsedEvent>;

interface ListedSession {
  id: string;
  pid: number;
  alive: boolean;
  startedAt: number;
  command: string;
  cwd: string;
  metadata: EventLoggerMetadata;
  origin?: SessionMeta['origin'];
  sessionDir: string;
}
interface ListSessionsOptions {
  selector?: string;
}
declare function listSessions(options?: ListSessionsOptions): Promise<ListedSession[]>;
declare function resolveSession(selector?: string): Promise<ListedSession>;

type CaptureOptions = Pick<TapOptions, 'debug' | 'filter'>;
interface CaptureSpawnOptions {
  env?: NodeJS.ProcessEnv;
  stdio?: StdioOptions;
}
declare class EventCapture implements AsyncIterable<ParsedEvent> {
  #private;
  constructor(options?: CaptureOptions);
  spawnOptions<T extends CaptureSpawnOptions>(options?: T): T & Required<CaptureSpawnOptions>;
  attach(child: ChildProcess): this;
  collect(): Promise<ParsedEvent[]>;
  [Symbol.asyncIterator](): AsyncIterator<ParsedEvent>;
}
declare function captureEvents(options?: CaptureOptions): EventCapture;

export {
  EventCapture,
  EventLoggerMetadata,
  ParsedEvent,
  captureEvents,
  listSessions as list,
  resolveSession,
  tap,
};
export type { CaptureOptions, CaptureSpawnOptions, ListSessionsOptions, ListedSession, TapOptions };
