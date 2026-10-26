import {
  V as ValidEventName,
  a as EventLogger,
  b as SessionOptions,
  E as EventLoggerMetadata,
} from './chunks/session-chunk.js';
export {
  A as AllEvents,
  c as EventByKey,
  d as EventKeys,
  e as EventRegistry,
  M as MetadataRegistry,
  P as ParsedEvent,
  f as Serialized,
  g as SerializedError,
  h as SpanEnd,
} from './chunks/session-chunk.js';

declare function events<const Category extends string>(
  category: Category & ValidEventName<Category>
): EventLogger<Category>;
declare namespace events {
  var debug: <const Category extends string>(
    category: Category & ValidEventName<Category>
  ) => EventLogger<Category>;
}

interface EventLoggerInfo {
  destination: 'file' | 'stdout' | 'stderr' | 'fd' | 'session' | 'ipc';
  isUserVisibleOutput: boolean;
  debug: boolean;
  file?: string;
  fd?: number;
  sessionDir?: string;
}

interface InstallEventLoggerOptions extends SessionOptions {
  session?: boolean;
  debug?: boolean;
}
declare function installChildEventLogger(options?: InstallEventLoggerOptions): boolean;
declare function installEventLogger(
  targetOrOptions?: string | number | InstallEventLoggerOptions
): void;
declare const getEventLoggerInfo: () => EventLoggerInfo | null;
declare function flushEventLogger(): Promise<void>;
declare function updateEventLoggerMetadata(patch: EventLoggerMetadata): void;

export {
  EventLogger,
  EventLoggerMetadata,
  events,
  flushEventLogger,
  getEventLoggerInfo,
  installChildEventLogger,
  installEventLogger,
  updateEventLoggerMetadata,
};
export type { EventLoggerInfo, InstallEventLoggerOptions };
