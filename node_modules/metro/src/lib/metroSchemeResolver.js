"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.default = void 0;
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
const BABEL_RUNTIME_SPECIFIER = "babel-runtime";
const BABEL_RUNTIME_PACKAGE = "@babel/runtime";
let babelRuntimePackageJsonPath = null;
function getBabelRuntimePackageJsonPath() {
  if (babelRuntimePackageJsonPath == null) {
    const metroRuntimeDir = path.dirname(
      require.resolve("metro-runtime/package.json"),
    );
    babelRuntimePackageJsonPath = require.resolve(
      "@babel/runtime/package.json",
      {
        paths: [metroRuntimeDir],
      },
    );
  }
  return babelRuntimePackageJsonPath;
}
var _default = (context, specifier, platform) => {
  const { protocol, pathname } = new URL(specifier);
  if (
    pathname === BABEL_RUNTIME_SPECIFIER ||
    pathname.startsWith(BABEL_RUNTIME_SPECIFIER + "/")
  ) {
    const subpath = pathname.slice(BABEL_RUNTIME_SPECIFIER.length);
    return context.resolveRequest(
      {
        ...context,
        originModulePath: getBabelRuntimePackageJsonPath(),
      },
      BABEL_RUNTIME_PACKAGE + subpath,
      platform,
    );
  }
  throw new Error(`Unsupported '${protocol}' pathname: ${pathname}`);
};
exports.default = _default;
