type Prettify<T> =
  T extends Record<string, unknown>
    ? {
        [K in keyof T]: T[K];
      }
    : T;
type Letters<S extends string> = S extends `${infer First}${infer Rest}`
  ? First | Letters<Rest>
  : never;
type NameCharacter =
  | Letters<'abcdefghijklmnopqrstuvwxyz0123456789_.:-'>
  | Uppercase<Letters<'abcdefghijklmnopqrstuvwxyz'>>;
type SafeCharacters<S extends string> = string extends S
  ? true
  : S extends ''
    ? true
    : S extends `${NameCharacter}${infer Rest}`
      ? SafeCharacters<Rest>
      : false;
type ValidEventName<Name extends string> = Name extends ''
  ? never
  : SafeCharacters<Name> extends true
    ? Name
    : never;
type ReservedPayloadKeys = '_e' | '_t' | '_d' | '_l' | '_w';
type ValidPayload<Payload> =
  Extract<keyof Payload, ReservedPayloadKeys> extends never ? Prettify<Payload> : never;
interface MetadataRegistry {
  version?: string;
}
type JsonMetadata<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends (...args: any[]) => any
    ? never
    : T extends object
      ? {
          [K in keyof T]: JsonMetadata<T[K]>;
        }
      : never;
type EventLoggerMetadata = {
  [K in Exclude<keyof MetadataRegistry, ReservedPayloadKeys>]?: JsonMetadata<MetadataRegistry[K]>;
};
interface EventRegistry {
  [key: `custom:${string}`]: Record<string, unknown>;
  'root:update': EventLoggerMetadata;
  'root:init': EventLoggerMetadata;
}
type EventKeys = Extract<keyof EventRegistry, string>;
type EventByKey<Key extends EventKeys> = Prettify<
  {
    key: Key;
  } & EventRegistry[Key]
>;
type AllEvents = {
  [K in EventKeys]: EventByKey<K>;
}[EventKeys];
type EventNamesFor<Category extends string> = EventKeys extends infer K
  ? K extends `${Category}:${infer Name}`
    ? Name
    : never
  : never;
type EventPayload<
  Category extends string,
  Name extends string,
> = `${Category}:${Name}` extends EventKeys
  ? ValidPayload<EventRegistry[`${Category}:${Name}`]>
  : never;
interface Serialized<T> {
  toJSON(): T;
}
type SerializablePayload<Payload> = {
  [K in keyof Payload]: Payload[K] | Serialized<Payload[K]>;
};
type PayloadArgs<Payload> = [Payload] extends [never]
  ? [data: never]
  : Partial<Payload> extends Payload
    ? [data?: SerializablePayload<Payload>]
    : [data: SerializablePayload<Payload>];
interface SpanEnd<Category extends string> {
  <Name extends EventNamesFor<Category>>(
    event: Name & ValidEventName<Name>,
    ...args: PayloadArgs<EventPayload<Category, Name>>
  ): void;
}
interface SerializedError {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  cause?: SerializedError | string;
}
interface EventLogger<Category extends string> {
  <Name extends EventNamesFor<Category>>(
    event: Name & ValidEventName<Name>,
    ...args: PayloadArgs<EventPayload<Category, Name>>
  ): void;
  span(): SpanEnd<Category>;
  path(target: string): Serialized<string>;
  path(target: string | null | undefined): Serialized<string | null>;
  error(error: Error): Serialized<SerializedError>;
  error(error: unknown): Serialized<SerializedError | string | null>;
  readonly category: Category;
}
interface ParsedEvent {
  _e: string;
  _t: number;
  _d?: number;
  _l?: number;
  _w?: string;
  [key: string]: unknown;
}

declare const EVENT_LOG_FORMAT = 'v0-jsonl';

interface SessionOptions {
  command?: string;
  metadata?: EventLoggerMetadata;
  maxSegments?: number;
  maxSegmentSize?: number;
}
interface SessionMeta {
  format: typeof EVENT_LOG_FORMAT;
  pid: number;
  startedAt: number;
  command: string;
  cwd: string;
  maxSegments: number;
  metadata: EventLoggerMetadata;
  socket: string;
  ipcSocket: string;
  origin: {
    argv: string[];
    execPath: string;
    cwd: string;
    ppid?: number;
    env?: {
      npmLifecycleEvent?: string;
      npmExecPath?: string;
      npmPackageName?: string;
    };
  };
}

export type {
  AllEvents as A,
  EventLoggerMetadata as E,
  MetadataRegistry as M,
  ParsedEvent as P,
  SessionMeta as S,
  ValidEventName as V,
  EventLogger as a,
  SessionOptions as b,
  EventByKey as c,
  EventKeys as d,
  EventRegistry as e,
  Serialized as f,
  SerializedError as g,
  SpanEnd as h,
};
