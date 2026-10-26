"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "visitNode", {
    enumerable: true,
    get: function() {
        return visitNode;
    }
});
const _validate = require("./validate");
const isSchemaNode = (value)=>value != null && typeof value === 'object' && !Array.isArray(value);
const isObject = (value)=>value != null && typeof value === 'object' && !Array.isArray(value);
const valueAt = (value, key)=>value != null && typeof value === 'object' ? value[key] : undefined;
const visitProperties = (properties, value, visitor, path)=>{
    for(const key in properties){
        const child = properties[key];
        if (isSchemaNode(child)) {
            visitNode(child, valueAt(value, key), visitor, `${path}.${key}`);
        }
    }
};
const visitPatternProperties = (matched, patternProperties, keys, value, visitor, path)=>{
    for(const pattern in patternProperties){
        const child = patternProperties[pattern];
        if (!isSchemaNode(child)) {
            continue;
        }
        const propertyRe = new RegExp(pattern);
        for (const key of keys){
            if (propertyRe.test(key)) {
                matched.add(key);
                visitNode(child, value[key], visitor, `${path}.${key}`);
            }
        }
    }
};
const visitAdditionalProperties = (additionalProperties, properties, matched, keys, value, visitor, path)=>{
    for (const key of keys){
        if (!matched.has(key) && !properties?.[key]) {
            visitNode(additionalProperties, value[key], visitor, `${path}.${key}`);
        }
    }
};
const visitDependencies = (dependencies, value, visitor, path)=>{
    for(const key in dependencies){
        const dependency = dependencies[key];
        if (value[key] !== undefined && isSchemaNode(dependency)) {
            visitNode(dependency, value, visitor, path);
        }
    }
};
const visitItems = (items, additionalItems, value, visitor, path)=>{
    if (!Array.isArray(items)) {
        if (isSchemaNode(items) && Array.isArray(value)) {
            for(let index = 0; index < value.length; index++){
                visitNode(items, value[index], visitor, `${path}[${index}]`);
            }
        }
        return;
    }
    let index = 0;
    for(; index < items.length; index++){
        const item = items[index];
        if (isSchemaNode(item)) {
            visitNode(item, valueAt(value, index), visitor, `${path}[${index}]`);
        }
    }
    if (isSchemaNode(additionalItems) && Array.isArray(value)) {
        for(; index < value.length; index++){
            visitNode(additionalItems, value[index], visitor, `${path}[${index}]`);
        }
    }
};
// `validateSchema` throws for what it cannot evaluate, such as an unsupported
// `format`. It checks a branch's other string keywords first, so a throw means
// the branch passed everything it could check: treat it as applying, as the
// walk did before it matched values, rather than abort the whole walk.
const matches = (schema, value, path)=>{
    try {
        return (0, _validate.validateSchema)(schema, value, path) === null;
    } catch  {
        return true;
    }
};
const visitEach = (schemas, value, visitor, path, applies = ()=>true)=>{
    if (!Array.isArray(schemas)) {
        return;
    }
    for (const item of schemas){
        if (isSchemaNode(item) && applies(item)) {
            visitNode(item, value, visitor, path);
        }
    }
};
// Only the subschemas that apply to `value` are visited. A `oneOf`/`anyOf`
// branch the value does not match, or the `then`/`else` its `if` did not
// select, describes some other value: visiting it reported, for example, the
// image branch of `ios.icon` for a `.icon` directory. A matching `if` is
// visited too, since its annotations apply (draft-07). A path declared in both
// `if` and `then` is therefore visited twice, as before. Without a value there
// is nothing to match against, so every subschema is visited.
const visitCombinators = (schema, value, visitor, path)=>{
    const hasValue = value !== undefined;
    const applies = (branch)=>!hasValue || matches(branch, value, path);
    visitEach(schema.allOf, value, visitor, path);
    visitEach(schema.anyOf, value, visitor, path, applies);
    visitEach(schema.oneOf, value, visitor, path, applies);
    // `then` and `else` mean nothing without an `if`. A boolean `if` is a valid
    // schema: `true` selects `then`, `false` selects `else`.
    const { if: condition, then: consequent, else: alternative } = schema;
    if (condition === undefined) {
        return;
    }
    let selected;
    if (!hasValue) {
        selected = [
            condition,
            consequent,
            alternative
        ];
    } else if (matches(condition, value, path)) {
        selected = [
            condition,
            consequent
        ];
    } else {
        selected = [
            alternative
        ];
    }
    for (const branch of selected){
        if (isSchemaNode(branch)) {
            visitNode(branch, value, visitor, path);
        }
    }
};
const visitNode = (schema, value, visitor, path = '')=>{
    visitor(schema, value, path);
    if (isSchemaNode(schema.properties)) {
        visitProperties(schema.properties, value, visitor, path);
    }
    if (schema.items != null) {
        visitItems(schema.items, schema.additionalItems, value, visitor, path);
    }
    if (isObject(value)) {
        const keys = Object.keys(value);
        const matched = new Set();
        if (isSchemaNode(schema.patternProperties)) {
            visitPatternProperties(matched, schema.patternProperties, keys, value, visitor, path);
        }
        if (isSchemaNode(schema.additionalProperties)) {
            visitAdditionalProperties(schema.additionalProperties, isSchemaNode(schema.properties) ? schema.properties : undefined, matched, keys, value, visitor, path);
        }
        if (isObject(schema.dependencies)) {
            visitDependencies(schema.dependencies, value, visitor, path);
        }
    }
    visitCombinators(schema, value, visitor, path);
};

//# sourceMappingURL=visit.js.map
