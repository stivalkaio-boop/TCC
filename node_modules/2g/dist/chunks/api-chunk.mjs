import t from "node:fs/promises";

import e from "node:path";

import n from "node:net";

import { createInterface as s } from "node:readline";

import { e as i, d as o, t as r, b as a, j as c, u as l, S as u, v as f, w as h, i as d, h as m, g as p } from "./clean-chunk.mjs";

class Queue {
  #t=[];
  #e=0;
  get length() {
    return this.#t.length - this.#e;
  }
  push(t) {
    this.#t.push(t);
  }
  shift() {
    if (!this.length) {
      return;
    }
    const t = this.#t[this.#e];
    this.#t[this.#e++] = void 0;
    if (this.#e === this.#t.length) {
      this.#t.length = 0;
      this.#e = 0;
    } else if (this.#e >= 1024 && 2 * this.#e >= this.#t.length) {
      this.#t = this.#t.slice(this.#e);
      this.#e = 0;
    }
    return t;
  }
}

async function* tap(n, f = {}) {
  const h = !0 === f.follow;
  const d = i(f.since);
  const m = o(f.filter);
  const p = function createTapAbortController(t, e) {
    if (!e) {
      return;
    }
    const n = new AbortController;
    const s = null != t.timeout ? setAbortTimer(n, t.timeout) : void 0;
    const onAbort = () => n.abort();
    t.signal?.addEventListener("abort", onAbort, {
      once: !0
    });
    n.signal.addEventListener("abort", () => {
      clearTimeout(s);
      t.signal?.removeEventListener("abort", onAbort);
    }, {
      once: !0
    });
    if (t.signal?.aborted) {
      n.abort();
    }
    return n;
  }(f, h);
  const w = p?.signal ?? f.signal;
  const v = r(n);
  let g;
  try {
    const i = h ? await async function connectLive(t, e, n) {
      const i = l(t, e?.socket ?? u.liveSocket);
      const o = await async function connectWithRetry(t, e) {
        for (let n = 0; n < 20 && !e?.aborted; n++) {
          const n = await tryConnect(t, e);
          if (n) {
            return n;
          }
          await new Promise(t => setTimeout(t, 50));
        }
        return null;
      }(i, n);
      if (!o) {
        return;
      }
      const r = s({
        input: o
      });
      const a = new Queue;
      let c;
      let f = !1;
      const push = t => {
        if (c) {
          const e = c;
          c = void 0;
          e(t);
        } else if (null != t) {
          a.push(t);
        }
      };
      const close = () => r.close();
      r.on("line", t => push(t));
      r.on("close", () => {
        f = !0;
        push(null);
        o.destroy();
        n?.removeEventListener("abort", close);
      });
      o.on("error", close);
      n?.addEventListener("abort", close, {
        once: !0
      });
      if (n?.aborted) {
        close();
      }
      return {
        buffer: a,
        next() {
          const t = a.shift();
          if (void 0 !== t) {
            return Promise.resolve(t);
          }
          if (f) {
            return Promise.resolve(null);
          }
          return new Promise(t => c = t);
        }
      };
    }(n, v, w) : void 0;
    const o = await async function openHistoryFiles(n, s) {
      const i = s?.maxSegments ?? c;
      const o = await Promise.all(Array.from({
        length: i
      }, (s, i) => t.open(e.join(n, `${i}.jsonl`), "r").catch(() => null)));
      return o.filter(t => null != t).reverse();
    }(n, v);
    try {
      for (const t of o) {
        for await (const e of readLines(t)) {
          const t = a(e, f, m, d);
          if (t) {
            yield t;
          }
        }
      }
    } finally {
      await Promise.all(o.map(t => t.close().catch(() => {})));
    }
    if (!i) {
      return;
    }
    if (null != f.idleTimeout && p) {
      g = setAbortTimer(p, f.idleTimeout);
    }
    for (let t = i.buffer.length; t > 0; t--) {
      if (w?.aborted) {
        break;
      }
      const t = i.buffer.shift();
      const e = a(t, f, m, d);
      if (e) {
        g?.refresh();
        yield e;
      }
    }
    while (!w?.aborted) {
      const t = await i.next();
      if (null == t || w?.aborted) {
        break;
      }
      g?.refresh();
      const e = a(t, f, m, d);
      if (e) {
        yield e;
      }
    }
  } finally {
    clearTimeout(g);
    p?.abort();
  }
}

async function detectRotationLoss(n) {
  const s = r(n);
  for (let i = (s?.maxSegments ?? c) - 1; i >= 0; i--) {
    const s = await t.open(e.join(n, `${i}.jsonl`), "r").catch(() => null);
    if (!s) {
      continue;
    }
    try {
      const t = await readFirstLine(s);
      return null != t && !isSessionStartLine(t);
    } finally {
      await s.close().catch(() => {});
    }
  }
  return !1;
}

async function readFirstLine(t) {
  for await (const e of readLines(t)) {
    return e;
  }
  return null;
}

function isSessionStartLine(t) {
  return t.startsWith('{"_e":"root:init"');
}

async function* readLines(t) {
  let e = "";
  for await (const n of t.createReadStream({
    encoding: "utf8"
  })) {
    e += n;
    let t = -1;
    while ((t = e.indexOf("\n")) >= 0) {
      const n = e.slice(0, t);
      e = e.slice(t + 1);
      if (n) {
        yield n;
      }
    }
  }
  if (e) {
    yield e;
  }
}

function setAbortTimer(t, e) {
  return setTimeout(() => t.abort(), e).unref();
}

function tryConnect(t, e) {
  return new Promise(s => {
    const i = n.connect(t);
    const cleanup = () => {
      i.off("connect", onConnect);
      i.off("error", onError);
      e?.removeEventListener("abort", onAbort);
    };
    const onConnect = () => {
      cleanup();
      s(i);
    };
    const onError = () => {
      cleanup();
      i.destroy();
      s(null);
    };
    const onAbort = () => {
      cleanup();
      i.destroy();
      s(null);
    };
    i.once("connect", onConnect);
    i.once("error", onError);
    e?.addEventListener("abort", onAbort, {
      once: !0
    });
  });
}

async function listSessions(t = {}) {
  return function filterSessions(t, e) {
    const n = e?.trim();
    if (!n) {
      return t;
    }
    const s = t.filter(t => function matchesSessionExactly(t, e) {
      return sessionSearchValues(t).some(t => t === e);
    }(t, n));
    if (s.length) {
      return s;
    }
    const i = n.toLowerCase();
    return t.filter(t => sessionSearchValues(t).some(t => t.toLowerCase().includes(i)));
  }(f(h()).map(({id: t, dir: e, meta: n, alive: s}) => ({
    id: t,
    pid: n.pid,
    alive: s,
    startedAt: n.startedAt,
    command: n.command,
    cwd: n.cwd,
    metadata: n.metadata,
    origin: n.origin,
    sessionDir: e
  })), t.selector).sort((t, e) => e.startedAt - t.startedAt);
}

async function resolveSession(t) {
  const e = await listSessions({
    selector: t
  });
  const n = e.filter(t => t.alive);
  const s = 1 === e.length ? e[0] : 1 === n.length ? n[0] : null;
  if (!s) {
    throw new Error(null != t ? e.length ? `Ambiguous 2g session "${t}"; specify one of: ${e.map(formatSessionSelector).join(", ")}` : `No 2g session matching "${t}"` : e.length ? `Ambiguous 2g session; specify one of: ${e.map(formatSessionSelector).join(", ")}` : "No 2g sessions found");
  }
  return s;
}

function formatSessionSelector(t) {
  return `${t.pid} (${t.command})`;
}

function sessionSearchValues(t) {
  return [ t.id, String(t.pid), t.sessionDir, t.cwd, t.command, t.origin?.cwd, t.origin?.argv.join(" "), t.origin?.execPath, t.origin?.env?.npmLifecycleEvent, t.origin?.env?.npmPackageName ].filter(t => !!t);
}

class EventCapture {
  #n;
  #s;
  #i;
  #o=!1;
  #r=!1;
  #a=new Queue;
  #c=[];
  constructor(t = {}) {
    this.#n = t;
    this.#s = o(t.filter);
  }
  spawnOptions(t) {
    const e = t?.stdio ?? "inherit";
    const n = Array.isArray(e) ? [ ...e ] : [ e, e, e ];
    while (n.length < 3) {
      n.push("inherit");
    }
    this.#i = n.push("pipe") - 1;
    const s = {
      ...t?.env ?? process.env,
      [p]: void 0,
      [d]: `${this.#i}`
    };
    if (!0 === this.#n.debug) {
      s[m] = "1";
    }
    return {
      ...t,
      stdio: n,
      env: s
    };
  }
  attach(t) {
    if (null == this.#i) {
      throw new Error("captureEvents: spawnOptions() must create the pipe before attach()");
    }
    if (this.#o) {
      throw new Error("captureEvents: a child is already attached");
    }
    const e = t.stdio[this.#i];
    if (!e || "function" != typeof e.setEncoding) {
      throw new Error(`captureEvents: child stdio[${this.#i}] is not a readable pipe`);
    }
    this.#o = !0;
    let n = "";
    e.setEncoding("utf8");
    e.on("data", t => {
      const e = n ? n + t : t;
      let s = 0;
      let i;
      while (-1 !== (i = e.indexOf("\n", s))) {
        const t = e.slice(s, i);
        s = i + 1;
        if (t) {
          this.#l(t);
        }
      }
      n = s ? e.slice(s) : e;
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
    e.on("end", finish);
    e.on("close", finish);
    e.on("error", finish);
    return this;
  }
  async collect() {
    const t = [];
    for await (const e of this) {
      t.push(e);
    }
    return t;
  }
  async* [Symbol.asyncIterator]() {
    let t;
    while (t = await this.#f()) {
      yield t;
    }
  }
  #l(t) {
    const e = a(t, this.#n, this.#s);
    if (e) {
      this.#u(e);
    }
  }
  #u(t) {
    const e = this.#c.shift();
    if (e) {
      e(t);
    } else if (t) {
      this.#a.push(t);
    }
  }
  #f() {
    const t = this.#a.shift();
    if (t) {
      return Promise.resolve(t);
    }
    if (this.#r) {
      return Promise.resolve(null);
    }
    if (!this.#o) {
      throw new Error("captureEvents: attach() a child before iterating");
    }
    return new Promise(t => this.#c.push(t));
  }
}

function captureEvents(t) {
  return new EventCapture(t);
}

export { captureEvents as c, detectRotationLoss as d, listSessions as l, resolveSession as r, tap as t };
//# sourceMappingURL=api-chunk.mjs.map
