"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    describeCounts: null,
    describeEmptyScan: null,
    describeWarnings: null,
    generateTypesCommand: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get describeCounts () {
        return describeCounts;
    },
    get describeEmptyScan () {
        return describeEmptyScan;
    },
    get describeWarnings () {
        return describeWarnings;
    },
    get generateTypesCommand () {
        return generateTypesCommand;
    }
});
function _path() {
    const data = /*#__PURE__*/ _interop_require_default(require("path"));
    _path = function() {
        return data;
    };
    return data;
}
const _generateTypes = require("../typegen/generateTypes");
const _args = require("./args");
const _styles = require("./styles");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const DEFAULT_OUTPUT_PATH = _path().default.join('src', 'native.types.ts');
const HELP = `Usage: expo-modules generate-types [options] [packageDir]

Generates TypeScript types for the native API an Expo module exports to
JavaScript: its @ExpoModule, @SharedObject, @Record, and @Union types and
Enumerable enums. Scans the package directory (default: the current directory)
for Swift sources and writes them to a single TypeScript file. Doc comments
written in that file stay on the next run.

Options:
  -o, --out <path>  The TypeScript file to write, relative to the package
                    directory. Defaults to ${DEFAULT_OUTPUT_PATH}.
  --scanner <path>  Path to the Expo Modules scanner executable. Defaults to the
                    scanner of the expo-modules-macros version that
                    expo-modules-core depends on.
  --check           Verify that the file is up to date without writing it. Exits
                    with code 1 when it is not.
  -h, --help        Display this message.`;
async function generateTypesCommand(argv) {
    const args = (0, _args.parseArgs)({
        '--out': String,
        '--scanner': String,
        '--check': Boolean,
        '--help': Boolean,
        '-o': '--out',
        '-h': '--help'
    }, argv, 'expo-modules generate-types');
    if (args['--help']) {
        console.log(HELP);
        return;
    }
    if (args._.length > 1) {
        throw new Error(`\`expo-modules generate-types\` takes at most one package directory, but got ${args._.length}: ` + `${args._.join(', ')}. Run \`expo-modules generate-types --help\` to see the usage.`);
    }
    const packageDir = _path().default.resolve(args._[0] ?? '.');
    const outputPath = _path().default.resolve(packageDir, args['--out'] ?? DEFAULT_OUTPUT_PATH);
    const scannerPath = args['--scanner'] ? _path().default.resolve(args['--scanner']) : undefined;
    const result = await (0, _generateTypes.generateTypes)({
        packageDir,
        outputPath,
        scannerPath,
        check: args['--check'] ?? false
    });
    const { outcome } = result;
    const nothingFound = describeEmptyScan(result.stats, packageDir);
    const summary = `${describeCounts(result.counts)} from ${count(result.stats.filesParsed, 'Swift file')}.`;
    switch(outcome.kind){
        case 'written':
            console.log(`Generated ${(0, _styles.styleFileName)(displayPath(outcome.outputPath))}: ${summary}`);
            console.log(listDeclarations(result.declarations, packageDir));
            break;
        case 'unchanged':
            console.log(`${(0, _styles.styleFileName)(displayPath(outcome.outputPath))} is up to date: ${summary}`);
            console.log(listDeclarations(result.declarations, packageDir));
            break;
        case 'removed':
            console.log(`${nothingFound} Removed the previously generated ` + `${(0, _styles.styleFileName)(displayPath(outcome.outputPath))}.`);
            break;
        case 'empty':
            console.log(`${nothingFound} Nothing was written.`);
            break;
        case 'stale':
            {
                const file = (0, _styles.styleFileName)(displayPath(outcome.outputPath), process.stderr);
                console.error(outcome.expected === 'written' ? `${file} is out of date. Run \`expo-modules generate-types\` to update it.` : `${file} is no longer needed: the package exports no native types. ` + `Run \`expo-modules generate-types\` to remove it.`);
                process.exitCode = 1;
                break;
            }
    }
    // Warnings come last, under their own heading, so the actionable part of the output is what
    // stays on screen after the summary and the listing.
    const heading = describeWarnings(result.warnings);
    if (heading) {
        console.warn(`\n${(0, _styles.styleWarning)(heading, process.stderr)}`);
        for (const warning of result.warnings){
            // Doc comment warnings are all about the generated file, which the summary already names.
            const file = warning.kind === 'dropped' || warning.kind === 'changed' ? '' : `${(0, _styles.styleFileName)(_path().default.relative(packageDir, warning.file), process.stderr)}: `;
            console.warn(`${(0, _styles.styleWarning)('●', process.stderr)} ${file}${(0, _styles.styleTypeName)(warning.location, process.stderr)}: ` + `${warning.message}.`);
            // A dropped comment is no longer in the file, so its text is printed for adding it back.
            if ('comment' in warning && warning.comment) {
                console.warn((0, _styles.styleComment)(warning.comment, process.stderr));
            }
        }
    }
}
/** `1 module`, `2 modules`. */ function count(n, noun) {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
/**
 * One indented row per declaration, `kind  name (NativeName)  file`, sorted by file so what each
 * file contributed reads together; within a file, source order. The native name appears only when
 * the TypeScript name differs from it.
 */ function listDeclarations(declarations, packageDir) {
    const rows = declarations.map((declaration, index)=>({
            ...declaration,
            index
        })).sort((a, b)=>a.file.localeCompare(b.file) || a.index - b.index).map((declaration)=>({
            kind: declaration.kind,
            name: declaration.name,
            // The native name, when it differs, follows the TypeScript name unstyled.
            suffix: declaration.name === declaration.nativeName ? '' : ` (${declaration.nativeName})`,
            file: _path().default.relative(packageDir, declaration.file)
        }));
    const kindWidth = Math.max(...rows.map((row)=>row.kind.length));
    const nameWidth = Math.max(...rows.map((row)=>row.name.length + row.suffix.length));
    return rows.map((row)=>{
        // Pad by the visible width; the style escapes would throw `padEnd` off.
        const padding = ' '.repeat(nameWidth - row.name.length - row.suffix.length);
        const name = `${(0, _styles.styleTypeName)(row.name)}${row.suffix}${padding}`;
        const kind = `${(0, _styles.styleKind)(row.kind)}${' '.repeat(kindWidth - row.kind.length)}`;
        return `  ${kind}  ${name}  ${(0, _styles.styleFileName)(row.file)}`;
    }).join('\n');
}
function describeEmptyScan(stats, packageDir) {
    if (stats.filesScanned === 0) {
        return `No Swift files found in ${packageDir}. The scan skips dependency, build, test, and example ` + 'directories, so the Swift sources of the package must live outside those.';
    }
    return `Scanned ${count(stats.filesScanned, 'Swift file')} in ${packageDir}, but none declares a ` + 'native type exported to JavaScript.';
}
function describeWarnings(warnings) {
    if (warnings.length === 0) {
        return null;
    }
    const unknown = warnings.filter((warning)=>warning.kind === 'unknown').length;
    const skipped = warnings.filter((warning)=>warning.kind === 'skipped').length;
    const dropped = warnings.filter((warning)=>warning.kind === 'dropped').length;
    const details = [
        unknown > 0 ? `${unknown} rendered as unknown` : null,
        skipped > 0 ? `${skipped} skipped` : null,
        dropped > 0 ? `${count(dropped, 'doc comment')} dropped` : null
    ].filter((detail)=>detail !== null);
    return `${[
        count(warnings.length, 'warning'),
        ...details
    ].join(', ')}:`;
}
function describeCounts(counts) {
    const parts = [
        [
            counts.modules,
            'module'
        ],
        [
            counts.sharedObjects,
            'shared object'
        ],
        [
            counts.records,
            'record'
        ],
        [
            counts.enums,
            'enum'
        ],
        [
            counts.unions,
            'union'
        ]
    ];
    return parts.filter(([n])=>n > 0).map(([n, noun])=>count(n, noun)).join(', ');
}
/** Relative to the working directory when the file is inside it, absolute otherwise. */ function displayPath(filePath) {
    const relative = _path().default.relative(process.cwd(), filePath);
    return relative.startsWith('..') ? filePath : relative;
}

//# sourceMappingURL=generateTypesCommand.js.map
