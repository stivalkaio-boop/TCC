"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.isMacOSAtLeast = isMacOSAtLeast;
function isMacOSAtLeast(major) {
  return (
    process.platform === "darwin" &&
    Number.parseInt(process.getSystemVersion().split(".")[0], 10) >= major
  );
}
