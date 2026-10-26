"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "prebuiltMetadataCommand", {
    enumerable: true,
    get: function() {
        return prebuiltMetadataCommand;
    }
});
const _prebuiltMetadata = require("../prebuiltMetadata");
const _autolinkingOptions = require("./autolinkingOptions");
function prebuiltMetadataCommand(cli) {
    return (0, _autolinkingOptions.registerAutolinkingArguments)(cli.command('prebuilt-metadata [searchPaths...]')).option('-j, --json', 'Output results in the plain JSON format.', ()=>true, false).action(async (searchPaths, commandArguments)=>{
        const optionsLoader = (0, _autolinkingOptions.createAutolinkingOptionsLoader)({
            ...commandArguments,
            searchPaths
        });
        const document = await (0, _prebuiltMetadata.resolvePrebuiltMetadataAsync)(optionsLoader);
        if (commandArguments.json) {
            console.log(JSON.stringify(document));
        } else {
            console.log(require('util').inspect(document, false, null, true));
        }
    });
}

//# sourceMappingURL=prebuiltMetadataCommand.js.map
