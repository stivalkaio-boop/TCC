import e from "node:fs";

import t from "node:path";

import n from "node:os";

const s = process.getuid?.();

const r = t.join(n.tmpdir(), null == s ? "event-log" : `event-log-${s}`);

const i = "v0-jsonl";

const o = 1;

const c = 1;

const a = "LOG_DEBUG";

const l = "LOG_EVENTS";

const u = "__eventLogDebug";

const m = "__eventLogIpc";

const f = "__eventLogProcessOrigin";

const p = {
  meta: "meta.json",
  liveSocket: "live.sock",
  ipcSocket: "ipc.sock"
};

const d = 3;

const S = 524288;

const v = 6;

const h = 1048576;

const g = Symbol.for("2g/session-base-dir-override");

function readMetaSync(n) {
  try {
    const s = JSON.parse(e.readFileSync(t.join(n, p.meta), "utf8"));
    if (!s || "object" != typeof s) {
      return null;
    }
    s.metadata ??= {};
    return s;
  } catch {
    return null;
  }
}

function getSessionBaseDir() {
  return globalThis[g] || r;
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
    const s = e.readdirSync(n, {
      withFileTypes: !0
    }).filter(e => e.isDirectory()).map(e => {
      const s = t.join(n, e.name);
      return {
        id: e.name,
        dir: s,
        meta: readMetaSync(s),
        alive: !1
      };
    }).filter(e => null !== e.meta);
    const r = new Map;
    for (const e of s) {
      const t = r.get(e.meta.pid);
      if (!t || e.meta.startedAt > t.meta.startedAt || e.meta.startedAt === t.meta.startedAt && e.id > t.id) {
        r.set(e.meta.pid, e);
      }
    }
    for (const e of r.values()) {
      e.alive = isPidAlive(e.meta.pid);
    }
    return s;
  } catch {
    return [];
  }
}

const y = {
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

function parseEventLine(e, t = {}, n = compileEventFilter(t.filter), s = parseSince(t.since)) {
  try {
    const r = JSON.parse(e);
    return r && "string" == typeof r._e && "number" == typeof r._t && matches(r, t.debug, s, t.spans, n) ? r : null;
  } catch {
    return null;
  }
}

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
  const s = Date.parse(t);
  if (Number.isFinite(s)) {
    return s;
  }
  throw new Error(`Invalid since: ${e}`);
}

function parseDuration(e) {
  const t = e.trim().toLowerCase();
  if (!t) {
    return;
  }
  let n = 0;
  let s = 0;
  const r = /(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)?/gy;
  while (s < t.length) {
    r.lastIndex = s;
    const e = r.exec(t);
    if (!e) {
      return;
    }
    const i = Number(e[1]);
    if (!Number.isFinite(i)) {
      return;
    }
    n += i * y[e[2] ?? "ms"];
    s = r.lastIndex;
    while (" " === t[s] || "," === t[s]) {
      s++;
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

function matchesTapOptions(e, t, n = compileEventFilter(t.filter)) {
  return matches(e, t.debug, t.since, t.spans, n);
}

function matches(e, t, n, s, r) {
  if (!0 !== t && e._l) {
    return !1;
  }
  if (void 0 !== n && e._t < n) {
    return !1;
  }
  if (!0 === s && "number" != typeof e._d) {
    return !1;
  }
  return !r || r.test(e._e);
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

function createSocketAddress(e, t, n) {
  const s = "win32" === process.platform ? `\\\\.\\pipe\\event-log-${t}-${n}` : "live" === n ? p.liveSocket : p.ipcSocket;
  return {
    name: s,
    path: resolveSocketPath(e, s)
  };
}

function resolveSocketPath(e, n) {
  return n.startsWith("\\\\") ? n : t.join(e, n);
}

function removeSocket(t) {
  if (!t.startsWith("\\\\")) {
    e.rmSync(t, {
      force: !0
    });
  }
}

function listenSocket(e, t) {
  let n = !1;
  let s = !1;
  let r = !1;
  e.unref();
  const close = () => {
    r = !0;
    if (s && !n) {
      e.close();
    }
  };
  e.once("listening", () => {
    s = !0;
    if (r) {
      close();
    }
  });
  e.once("close", () => {
    n = !0;
    s = !1;
  });
  e.on("error", () => {
    n = !0;
    try {
      e.close(() => {});
    } catch {}
  });
  e.listen(t);
  return close;
}

function cleanStaleSessionsSync() {
  const e = getSessionEntries();
  return e.length - cleanStaleSessionEntriesSync(e).length;
}

function cleanStaleSessionEntriesSync(t) {
  const n = Date.now();
  const s = [];
  const r = [];
  for (const i of t) {
    if (i.alive) {
      s.push(i);
    } else if (n - i.meta.startedAt > 6048e5) {
      e.rmSync(i.dir, {
        recursive: !0,
        force: !0
      });
    } else {
      r.push(i);
    }
  }
  r.sort((e, t) => t.meta.startedAt - e.meta.startedAt);
  for (let t = 100; t < r.length; t++) {
    e.rmSync(r[t].dir, {
      recursive: !0,
      force: !0
    });
  }
  return s.concat(r.slice(0, 100));
}

function cleanExitedSessionsSync() {
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
}

export { v as D, c as E, f as I, a as L, p as S, cleanStaleSessionsSync as a, parseEventLine as b, cleanExitedSessionsSync as c, compileEventFilter as d, parseSince as e, o as f, m as g, u as h, l as i, d as j, h as k, listenSocket as l, matchesTapOptions as m, S as n, createSocketAddress as o, parseDuration as p, i as q, removeSocket as r, getSessionBaseDir as s, readMetaSync as t, resolveSocketPath as u, cleanStaleSessionEntriesSync as v, getSessionEntries as w };
//# sourceMappingURL=clean-chunk.mjs.map
