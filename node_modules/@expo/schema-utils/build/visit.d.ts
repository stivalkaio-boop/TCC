import type { JSONSchema } from './JSONSchema';
export type SchemaVisitor = (schema: JSONSchema, value: unknown, path: string) => void;
export declare const visitNode: (schema: JSONSchema, value: unknown, visitor: SchemaVisitor, path?: string) => void;
