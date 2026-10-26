import type { FontFaceDefinition, FontFamilyDefinition } from './Font.types';
export declare function normalizeWeight(weight: FontFaceDefinition['weight']): number | undefined;
export declare function normalizeStyle(style: FontFaceDefinition['style']): 'normal' | 'italic' | undefined;
export declare function resolveFaceWeight(face: FontFaceDefinition): FontFaceDefinition['weight'];
export declare function resolveFaceStyle(face: FontFaceDefinition): FontFaceDefinition['style'];
export declare function assertValidFontFaces(fontFamily: string, fontDefinitions: FontFaceDefinition[]): void;
export declare function assertValidFontFamilyDefinitions(definitions: unknown[]): asserts definitions is FontFamilyDefinition[];
