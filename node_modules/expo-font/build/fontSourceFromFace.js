import { Asset } from 'expo-asset';
import { resolveFaceStyle, resolveFaceWeight } from './fontFaceValidation';
export function fontSourceFromFace(face) {
    const { path, display } = face;
    const weight = resolveFaceWeight(face);
    const style = resolveFaceStyle(face);
    if (path instanceof Asset) {
        return {
            uri: path.uri,
            ...weight !== undefined ? {
                weight
            } : null,
            ...style !== undefined ? {
                style
            } : null,
            ...display !== undefined ? {
                display
            } : null
        };
    }
    const base = typeof path === 'string' || typeof path === 'number' ? {
        uri: path
    } : path;
    return {
        ...base,
        weight,
        style,
        display: display ?? base.display
    };
}

//# sourceMappingURL=fontSourceFromFace.js.map
