var e = require("node:fs");

var t = require("node:path");

var n = require("node:os");

const r = process.getuid?.();

const s = t.join(n.tmpdir(), null == r ? "event-log" : `event-log-${r}`);

const i = {
  meta: "meta.json",
  liveSocket: "live.sock",
  ipcSocket: "ipc.sock"
};

const o = Symbol.for("2g/session-base-dir-override");

function readMetaSync(n) {
  try {
    const r = JSON.parse(e.readFileSync(t.join(n, i.meta), "utf8"));
    if (!r || "object" != typeof r) {
      return null;
    }
    r.metadata ??= {};
    return r;
  } catch {
    return null;
  }
}

function getSessionBaseDir() {
  return globalThis[o] || s;
}

function isPidAlive(e) {
  if (!e || e === process.pid) {
    return !0;
  }
  try {
    process.kill(e, 0);
    return !0;
  } catch {
    return !1;
  }
}

function getSessionEntries() {
  try {
    const n = getSessionBaseDir();
    const r = e.readdirSync(n, {
      withFileTypes: !0
    }).filter(e => e.isDirectory()).map(e => {
      const r = t.join(n, e.name);
      return {
        id: e.name,
        dir: r,
        meta: readMetaSync(r),
        alive: !1
      };
    }).filter(e => null !== e.meta);
    const s = new Map;
    for (const e of r) {
      const t = s.get(e.meta.pid);
      if (!t || e.meta.startedAt > t.meta.startedAt || e.meta.startedAt === t.meta.startedAt && e.id > t.id) {
        s.set(e.meta.pid, e);
      }
    }
    for (const e of s.values()) {
      e.alive = isPidAlive(e.meta.pid);
    }
    return r;
  } catch {
    return [];
  }
}

const c = {
  ms: 1,
  msec: 1,
  msecs: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1e3,
  sec: 1e3,
  secs: 1e3,
  second: 1e3,
  seconds: 1e3,
  m: 6e4,
  min: 6e4,
  mins: 6e4,
  minute: 6e4,
  minutes: 6e4,
  h: 36e5,
  hr: 36e5,
  hrs: 36e5,
  hour: 36e5,
  hours: 36e5
};

function parseSince(e) {
  if (null == e) {
    return;
  }
  if (e instanceof Date) {
    const t = e.getTime();
    if (Number.isFinite(t)) {
      return t;
    }
    throw new Error(`Invalid since: ${e.toString()}`);
  }
  if ("number" == typeof e) {
    if (!Number.isFinite(e) || e < 0) {
      throw new Error(`Invalid since: ${e}`);
    }
    return normalizeUnixTimestamp(e);
  }
  const t = e.trim();
  if (!t) {
    return;
  }
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    return normalizeUnixTimestamp(Number(t));
  }
  const n = parseDuration(t);
  if (null != n) {
    return Date.now() - n;
  }
  const r = Date.parse(t);
  if (Number.isFinite(r)) {
    return r;
  }
  throw new Error(`Invalid since: ${e}`);
}

function parseDuration(e) {
  const t = e.trim().toLowerCase();
  if (!t) {
    return;
  }
  let n = 0;
  let r = 0;
  const s = /(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)?/gy;
  while (r < t.length) {
    s.lastIndex = r;
    const e = s.exec(t);
    if (!e) {
      return;
    }
    const i = Number(e[1]);
    if (!Number.isFinite(i)) {
      return;
    }
    n += i * c[e[2] ?? "ms"];
    r = s.lastIndex;
    while (" " === t[r] || "," === t[r]) {
      r++;
    }
  }
  return n;
}

function compileEventFilter(e) {
  const t = function normalizeEventFilter(e) {
    const t = Array.isArray(e) ? e : e ? [ e ] : [];
    return t.flatMap(e => e.split(",")).map(e => e.trim()).filter(Boolean);
  }(e);
  if (!t.length) {
    return null;
  }
  return new RegExp(`^(?:${t.map(eventPatternToRegex).join("|")})$`);
}

function matches(e, t, n, r, s) {
  if (!0 !== t && e._l) {
    return !1;
  }
  if (void 0 !== n && e._t < n) {
    return !1;
  }
  if (!0 === r && "number" != typeof e._d) {
    return !1;
  }
  return !s || s.test(e._e);
}

function eventPatternToRegex(e) {
  if (e.includes("*")) {
    return e.split("*").map(escapeRegex).join(".*");
  } else {
    return `${escapeRegex(e)}(?::.*)?`;
  }
}

function escapeRegex(e) {
  return e.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizeUnixTimestamp(e) {
  return e < 1e10 ? 1e3 * e : e;
}

function resolveSocketPath(e, n) {
  return n.startsWith("\\\\") ? n : t.join(e, n);
}

function cleanStaleSessionEntriesSync(t) {
  const n = Date.now();
  const r = [];
  const s = [];
  for (const i of t) {
    if (i.alive) {
      r.push(i);
    } else if (n - i.meta.startedAt > 6048e5) {
      e.rmSync(i.dir, {
        recursive: !0,
        force: !0
      });
    } else {
      s.push(i);
    }
  }
  s.sort((e, t) => t.meta.startedAt - e.meta.startedAt);
  for (let t = 100; t < s.length; t++) {
    e.rmSync(s[t].dir, {
      recursive: !0,
      force: !0
    });
  }
  return r.concat(s.slice(0, 100));
}

exports.DEBUG_SEGMENTS = 6;

exports.DEBUG_SEGMENT_SIZE = 1048576;

exports.DEFAULT_SEGMENTS = 3;

exports.DEFAULT_SEGMENT_SIZE = 524288;

exports.EVENT_LEVEL_DEBUG = 1;

exports.EVENT_LOG_FORMAT = "v0-jsonl";

exports.EVENT_LOG_STATE_VERSION = 1;

exports.INTERNAL_DEBUG_ENV = "__eventLogDebug";

exports.INTERNAL_IPC_ENV = "__eventLogIpc";

exports.INTERNAL_PROCESS_ORIGIN_ENV = "__eventLogProcessOrigin";

exports.LOG_DEBUG_ENV = "LOG_DEBUG";

exports.LOG_EVENTS_ENV = "LOG_EVENTS";

exports.SESSION_FILES = i;

exports.cleanExitedSessionsSync = function cleanExitedSessionsSync() {
  let t = 0;
  for (const n of getSessionEntries()) {
    if (!n.alive) {
      e.rmSync(n.dir, {
        recursive: !0,
        force: !0
      });
      t++;
    }
  }
  return t;
};

exports.cleanStaleSessionEntriesSync = cleanStaleSessionEntriesSync;

exports.cleanStaleSessionsSync = function cleanStaleSessionsSync() {
  const e = getSessionEntries();
  return e.length - cleanStaleSessionEntriesSync(e).length;
};

exports.compileEventFilter = compileEventFilter;

exports.createSocketAddress = function createSocketAddress(e, t, n) {
  const r = "win32" === process.platform ? `\\\\.\\pipe\\event-log-${t}-${n}` : "live" === n ? i.liveSocket : i.ipcSocket;
  return {
    name: r,
    path: resolveSocketPath(e, r)
  };
};

exports.getSessionBaseDir = getSessionBaseDir;

exports.getSessionEntries = getSessionEntries;

exports.listenSocket = function listenSocket(e, t) {
  let n = !1;
  let r = !1;
  let s = !1;
  e.unref();
  const close = () => {
    s = !0;
    if (r && !n) {
      e.close();
    }
  };
  e.once("listening", () => {
    r = !0;
    if (s) {
      close();
    }
  });
  e.once("close", () => {
    n = !0;
    r = !1;
  });
  e.on("error", () => {
    n = !0;
    try {
      e.close(() => {});
    } catch {}
  });
  e.listen(t);
  return close;
};

exports.matchesTapOptions = function matchesTapOptions(e, t, n = compileEventFilter(t.filter)) {
  return matches(e, t.debug, t.since, t.spans, n);
};

exports.parseDuration = parseDuration;

exports.parseEventLine = function parseEventLine(e, t = {}, n = compileEventFilter(t.filter), r = parseSince(t.since)) {
  try {
    const s = JSON.parse(e);
    return s && "string" == typeof s._e && "number" == typeof s._t && matches(s, t.debug, r, t.spans, n) ? s : null;
  } catch {
    return null;
  }
};

exports.parseSince = parseSince;

exports.readMetaSync = readMetaSync;

exports.removeSocket = function removeSocket(t) {
  if (!t.startsWith("\\\\")) {
    e.rmSync(t, {
      force: !0
    });
  }
};

exports.resolveSocketPath = resolveSocketPath;
//# sourceMappingURL=clean-chunk.js.map
