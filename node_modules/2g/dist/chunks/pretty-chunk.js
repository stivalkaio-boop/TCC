var e = require("node:console");

var r = require("node:util");

const t = [ "cyan", "green", "yellow", "blue", "magenta", "red" ];

function formatDurationNumber(e) {
  if (e >= 100) {
    return String(Math.round(e));
  }
  if (e >= 10) {
    return e.toFixed(1).replace(/\.0$/, "");
  }
  return e.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

exports.formatPrettyEvent = function formatPrettyEvent(e, o) {
  const n = function formatTimestamp(e, t) {
    if (!t.colorize) {
      return e;
    }
    return r.styleText("dim", e, {
      stream: t.stream ?? process.stdout
    });
  }(new Date(e._t).toISOString(), o);
  const s = "number" == typeof e._d ? ` ${function formatSpanDuration(e) {
    if (e < 1e3) {
      return `${formatDurationNumber(e)}ms`;
    }
    if (e < 6e4) {
      return `${formatDurationNumber(e / 1e3)}s`;
    }
    return `${formatDurationNumber(e / 6e4)}m`;
  }(e._d)}` : "";
  return `${n} ${function formatPrettyEventName(e, o) {
    if (!o.colorize) {
      return e;
    }
    return r.styleText(function pickCategoryColor(e) {
      const r = e.indexOf(":");
      const o = -1 === r ? e : e.slice(0, r);
      let n = 0;
      for (let e = 0; e < o.length; e++) {
        n = (n << 5) - n + o.charCodeAt(e);
        n |= 0;
      }
      return t[Math.abs(n) % t.length];
    }(e), e, {
      stream: o.stream ?? process.stdout
    });
  }(e._e, o)}${s} ${JSON.stringify(e)}`;
};

exports.redirectConsoleForFd = function redirectConsoleForFd(r) {
  if (1 === r) {
    const r = process.stderr;
    Object.defineProperty(process, "stdout", {
      get: () => r
    });
    globalThis.console = new e.Console(r, r);
  } else if (2 === r) {
    const r = process.stdout;
    Object.defineProperty(process, "stderr", {
      get: () => r
    });
    globalThis.console = new e.Console(r, r);
  }
};

exports.redirectConsoleToStderr = function redirectConsoleToStderr() {
  globalThis.console = new e.Console(process.stderr, process.stderr);
};

exports.shouldColorizeStream = function shouldColorizeStream(e) {
  return !0 === e.isTTY && ("function" != typeof e.hasColors || e.hasColors());
};
//# sourceMappingURL=pretty-chunk.js.map
