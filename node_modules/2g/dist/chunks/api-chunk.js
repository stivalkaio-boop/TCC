var e = require("node:fs/promises");

var t = require("node:path");

var n = require("node:net");

var i = require("node:readline");

var s = require("./clean-chunk.js");

class Queue {
  #e=[];
  #t=0;
  get length() {
    return this.#e.length - this.#t;
  }
  push(e) {
    this.#e.push(e);
  }
  shift() {
    if (!this.length) {
      return;
    }
    const e = this.#e[this.#t];
    this.#e[this.#t++] = void 0;
    if (this.#t === this.#e.length) {
      this.#e.length = 0;
      this.#t = 0;
    } else if (this.#t >= 1024 && 2 * this.#t >= this.#e.length) {
      this.#e = this.#e.slice(this.#t);
      this.#t = 0;
    }
    return e;
  }
}

async function readFirstLine(e) {
  for await (const t of readLines(e)) {
    return t;
  }
  return null;
}

function isSessionStartLine(e) {
  return e.startsWith('{"_e":"root:init"');
}

async function* readLines(e) {
  let t = "";
  for await (const n of e.createReadStream({
    encoding: "utf8"
  })) {
    t += n;
    let e = -1;
    while ((e = t.indexOf("\n")) >= 0) {
      const n = t.slice(0, e);
      t = t.slice(e + 1);
      if (n) {
        yield n;
      }
    }
  }
  if (t) {
    yield t;
  }
}

function setAbortTimer(e, t) {
  return setTimeout(() => e.abort(), t).unref();
}

function tryConnect(e, t) {
  return new Promise(i => {
    const s = n.connect(e);
    const cleanup = () => {
      s.off("connect", onConnect);
      s.off("error", onError);
      t?.removeEventListener("abort", onAbort);
    };
    const onConnect = () => {
      cleanup();
      i(s);
    };
    const onError = () => {
      cleanup();
      s.destroy();
      i(null);
    };
    const onAbort = () => {
      cleanup();
      s.destroy();
      i(null);
    };
    s.once("connect", onConnect);
    s.once("error", onError);
    t?.addEventListener("abort", onAbort, {
      once: !0
    });
  });
}

async function listSessions(e = {}) {
  return function filterSessions(e, t) {
    const n = t?.trim();
    if (!n) {
      return e;
    }
    const i = e.filter(e => function matchesSessionExactly(e, t) {
      return sessionSearchValues(e).some(e => e === t);
    }(e, n));
    if (i.length) {
      return i;
    }
    const s = n.toLowerCase();
    return e.filter(e => sessionSearchValues(e).some(e => e.toLowerCase().includes(s)));
  }(s.cleanStaleSessionEntriesSync(s.getSessionEntries()).map(({id: e, dir: t, meta: n, alive: i}) => ({
    id: e,
    pid: n.pid,
    alive: i,
    startedAt: n.startedAt,
    command: n.command,
    cwd: n.cwd,
    metadata: n.metadata,
    origin: n.origin,
    sessionDir: t
  })), e.selector).sort((e, t) => t.startedAt - e.startedAt);
}

function formatSessionSelector(e) {
  return `${e.pid} (${e.command})`;
}

function sessionSearchValues(e) {
  return [ e.id, String(e.pid), e.sessionDir, e.cwd, e.command, e.origin?.cwd, e.origin?.argv.join(" "), e.origin?.execPath, e.origin?.env?.npmLifecycleEvent, e.origin?.env?.npmPackageName ].filter(e => !!e);
}

class EventCapture {
  #n;
  #i;
  #s;
  #o=!1;
  #r=!1;
  #a=new Queue;
  #c=[];
  constructor(e = {}) {
    this.#n = e;
    this.#i = s.compileEventFilter(e.filter);
  }
  spawnOptions(e) {
    const t = e?.stdio ?? "inherit";
    const n = Array.isArray(t) ? [ ...t ] : [ t, t, t ];
    while (n.length < 3) {
      n.push("inherit");
    }
    this.#s = n.push("pipe") - 1;
    const i = {
      ...e?.env ?? process.env,
      [s.INTERNAL_IPC_ENV]: void 0,
      [s.LOG_EVENTS_ENV]: `${this.#s}`
    };
    if (!0 === this.#n.debug) {
      i[s.INTERNAL_DEBUG_ENV] = "1";
    }
    return {
      ...e,
      stdio: n,
      env: i
    };
  }
  attach(e) {
    if (null == this.#s) {
      throw new Error("captureEvents: spawnOptions() must create the pipe before attach()");
    }
    if (this.#o) {
      throw new Error("captureEvents: a child is already attached");
    }
    const t = e.stdio[this.#s];
    if (!t || "function" != typeof t.setEncoding) {
      throw new Error(`captureEvents: child stdio[${this.#s}] is not a readable pipe`);
    }
    this.#o = !0;
    let n = "";
    t.setEncoding("utf8");
    t.on("data", e => {
      const t = n ? n + e : e;
      let i = 0;
      let s;
      while (-1 !== (s = t.indexOf("\n", i))) {
        const e = t.slice(i, s);
        i = s + 1;
        if (e) {
          this.#l(e);
        }
      }
      n = i ? t.slice(i) : t;
    });
    const finish = () => {
      if (this.#r) {
        return;
      }
      this.#r = !0;
      if (n) {
        this.#l(n);
      }
      this.#u(null);
    };
    t.on("end", finish);
    t.on("close", finish);
    t.on("error", finish);
    return this;
  }
  async collect() {
    const e = [];
    for await (const t of this) {
      e.push(t);
    }
    return e;
  }
  async* [Symbol.asyncIterator]() {
    let e;
    while (e = await this.#h()) {
      yield e;
    }
  }
  #l(e) {
    const t = s.parseEventLine(e, this.#n, this.#i);
    if (t) {
      this.#u(t);
    }
  }
  #u(e) {
    const t = this.#c.shift();
    if (t) {
      t(e);
    } else if (e) {
      this.#a.push(e);
    }
  }
  #h() {
    const e = this.#a.shift();
    if (e) {
      return Promise.resolve(e);
    }
    if (this.#r) {
      return Promise.resolve(null);
    }
    if (!this.#o) {
      throw new Error("captureEvents: attach() a child before iterating");
    }
    return new Promise(e => this.#c.push(e));
  }
}

exports.captureEvents = function captureEvents(e) {
  return new EventCapture(e);
};

exports.detectRotationLoss = async function detectRotationLoss(n) {
  const i = s.readMetaSync(n);
  for (let o = (i?.maxSegments ?? s.DEFAULT_SEGMENTS) - 1; o >= 0; o--) {
    const i = await e.open(t.join(n, `${o}.jsonl`), "r").catch(() => null);
    if (!i) {
      continue;
    }
    try {
      const e = await readFirstLine(i);
      return null != e && !isSessionStartLine(e);
    } finally {
      await i.close().catch(() => {});
    }
  }
  return !1;
};

exports.listSessions = listSessions;

exports.resolveSession = async function resolveSession(e) {
  const t = await listSessions({
    selector: e
  });
  const n = t.filter(e => e.alive);
  const i = 1 === t.length ? t[0] : 1 === n.length ? n[0] : null;
  if (!i) {
    throw new Error(null != e ? t.length ? `Ambiguous 2g session "${e}"; specify one of: ${t.map(formatSessionSelector).join(", ")}` : `No 2g session matching "${e}"` : t.length ? `Ambiguous 2g session; specify one of: ${t.map(formatSessionSelector).join(", ")}` : "No 2g sessions found");
  }
  return i;
};

exports.tap = async function* tap(n, o = {}) {
  const r = !0 === o.follow;
  const a = s.parseSince(o.since);
  const c = s.compileEventFilter(o.filter);
  const l = function createTapAbortController(e, t) {
    if (!t) {
      return;
    }
    const n = new AbortController;
    const i = null != e.timeout ? setAbortTimer(n, e.timeout) : void 0;
    const onAbort = () => n.abort();
    e.signal?.addEventListener("abort", onAbort, {
      once: !0
    });
    n.signal.addEventListener("abort", () => {
      clearTimeout(i);
      e.signal?.removeEventListener("abort", onAbort);
    }, {
      once: !0
    });
    if (e.signal?.aborted) {
      n.abort();
    }
    return n;
  }(o, r);
  const u = l?.signal ?? o.signal;
  const h = s.readMetaSync(n);
  let f;
  try {
    const d = r ? await async function connectLive(e, t, n) {
      const o = s.resolveSocketPath(e, t?.socket ?? s.SESSION_FILES.liveSocket);
      const r = await async function connectWithRetry(e, t) {
        for (let n = 0; n < 20 && !t?.aborted; n++) {
          const n = await tryConnect(e, t);
          if (n) {
            return n;
          }
          await new Promise(e => setTimeout(e, 50));
        }
        return null;
      }(o, n);
      if (!r) {
        return;
      }
      const a = i.createInterface({
        input: r
      });
      const c = new Queue;
      let l;
      let u = !1;
      const push = e => {
        if (l) {
          const t = l;
          l = void 0;
          t(e);
        } else if (null != e) {
          c.push(e);
        }
      };
      const close = () => a.close();
      a.on("line", e => push(e));
      a.on("close", () => {
        u = !0;
        push(null);
        r.destroy();
        n?.removeEventListener("abort", close);
      });
      r.on("error", close);
      n?.addEventListener("abort", close, {
        once: !0
      });
      if (n?.aborted) {
        close();
      }
      return {
        buffer: c,
        next() {
          const e = c.shift();
          if (void 0 !== e) {
            return Promise.resolve(e);
          }
          if (u) {
            return Promise.resolve(null);
          }
          return new Promise(e => l = e);
        }
      };
    }(n, h, u) : void 0;
    const m = await async function openHistoryFiles(n, i) {
      const o = i?.maxSegments ?? s.DEFAULT_SEGMENTS;
      const r = await Promise.all(Array.from({
        length: o
      }, (i, s) => e.open(t.join(n, `${s}.jsonl`), "r").catch(() => null)));
      return r.filter(e => null != e).reverse();
    }(n, h);
    try {
      for (const e of m) {
        for await (const t of readLines(e)) {
          const e = s.parseEventLine(t, o, c, a);
          if (e) {
            yield e;
          }
        }
      }
    } finally {
      await Promise.all(m.map(e => e.close().catch(() => {})));
    }
    if (!d) {
      return;
    }
    if (null != o.idleTimeout && l) {
      f = setAbortTimer(l, o.idleTimeout);
    }
    for (let e = d.buffer.length; e > 0; e--) {
      if (u?.aborted) {
        break;
      }
      const e = d.buffer.shift();
      const t = s.parseEventLine(e, o, c, a);
      if (t) {
        f?.refresh();
        yield t;
      }
    }
    while (!u?.aborted) {
      const e = await d.next();
      if (null == e || u?.aborted) {
        break;
      }
      f?.refresh();
      const t = s.parseEventLine(e, o, c, a);
      if (t) {
        yield t;
      }
    }
  } finally {
    clearTimeout(f);
    l?.abort();
  }
};
//# sourceMappingURL=api-chunk.js.map
