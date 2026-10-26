"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.default = nodeCrawl;
var _RootPathUtils = require("../../lib/RootPathUtils");
var fs = _interopRequireWildcard(require("graceful-fs"));
var path = _interopRequireWildcard(require("node:path"));
function _interopRequireWildcard(e, t) {
  if ("function" == typeof WeakMap)
    var r = new WeakMap(),
      n = new WeakMap();
  return (_interopRequireWildcard = function (e, t) {
    if (!t && e && e.__esModule) return e;
    var o,
      i,
      f = { __proto__: null, default: e };
    if (null === e || ("object" != typeof e && "function" != typeof e))
      return f;
    if ((o = t ? n : r)) {
      if (o.has(e)) return o.get(e);
      o.set(e, f);
    }
    for (const t in e)
      "default" !== t &&
        {}.hasOwnProperty.call(e, t) &&
        ((i =
          (o = Object.defineProperty) &&
          Object.getOwnPropertyDescriptor(e, t)) &&
        (i.get || i.set)
          ? o(f, t, i)
          : (f[t] = e[t]));
    return f;
  })(e, t);
}
function find(
  roots,
  extensions,
  ignore,
  includeSymlinks,
  rootDir,
  console,
  callback,
) {
  const result = new Map();
  let activeCalls = 0;
  const pathUtils = new _RootPathUtils.RootPathUtils(rootDir);
  function search(directory) {
    activeCalls++;
    fs.readdir(
      directory,
      {
        withFileTypes: true,
      },
      (err, entries) => {
        activeCalls--;
        if (err) {
          console.warn(
            `Error "${err.code ?? err.message}" reading contents of "${directory}", skipping. Add this directory to your ignore list to exclude it.`,
          );
        } else {
          entries.forEach((entry) => {
            const file = path.join(directory, entry.name.toString());
            if (ignore(file)) {
              return;
            }
            if (entry.isSymbolicLink() && !includeSymlinks) {
              return;
            }
            if (entry.isDirectory()) {
              search(file);
              return;
            }
            activeCalls++;
            fs.lstat(file, (err, stat) => {
              activeCalls--;
              if (!err && stat) {
                const ext = path.extname(file).substr(1);
                if (stat.isSymbolicLink() || extensions.includes(ext)) {
                  result.set(pathUtils.absoluteToNormal(file), [
                    stat.mtime.getTime(),
                    stat.size,
                    0,
                    null,
                    stat.isSymbolicLink() ? 1 : 0,
                    null,
                  ]);
                }
              }
              if (activeCalls === 0) {
                callback(result);
              }
            });
          });
        }
        if (activeCalls === 0) {
          callback(result);
        }
      },
    );
  }
  if (roots.length > 0) {
    roots.forEach(search);
  } else {
    callback(result);
  }
}
async function nodeCrawl(options) {
  const {
    console,
    previousState,
    extensions,
    ignore,
    rootDir,
    includeSymlinks,
    perfLogger,
    roots,
    abortSignal,
    subpath,
  } = options;
  abortSignal?.throwIfAborted();
  perfLogger?.point("nodeCrawl_start");
  return new Promise((resolve, reject) => {
    const callback = (fileData) => {
      const difference = previousState.fileSystem.getDifference(fileData, {
        subpath,
      });
      perfLogger?.point("nodeCrawl_end");
      try {
        abortSignal?.throwIfAborted();
      } catch (e) {
        reject(e);
      }
      resolve(difference);
    };
    find(
      roots,
      extensions,
      ignore,
      includeSymlinks,
      rootDir,
      console,
      callback,
    );
  });
}
