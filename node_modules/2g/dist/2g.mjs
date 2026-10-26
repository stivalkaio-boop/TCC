import e from "node:path";

import { performance as t } from "node:perf_hooks";

import { E as i, f as s, b as n, L as r, d as o, I as c, g as a, h as l, l as h, i as d, r as f, D as u, j as p, k as g, n as m, o as y, a as v, q as w, s as k, S as b } from "./chunks/clean-chunk.mjs";

import S from "node:fs";

import L from "node:net";

import { s as _, f as E, a as P } from "./chunks/pretty-chunk.mjs";

import { Buffer as I } from "node:buffer";

import { EventEmitter as $ } from "node:events";

import O from "node:os";

import { isMainThread as M, threadId as C } from "node:worker_threads";

const T = Symbol.for(`2g/state-${i}`);

const j = function getEventLogState() {
  const e = globalThis;
  return e[T] ??= {
    logPath: process.cwd(),
    eventLoggerInfo: null,
    debug: !1
  };
}();

const D = t.timeOrigin;

const N = Array.from({
  length: 1e3
}, (e, t) => `.${`${t}`.padStart(3, "0")}`);

let x = -1;

let z = "";

let F;

let U = "";

function serializeEvent(e, i, s, n, r, o) {
  const c = function stringifyTimestamp() {
    const e = D + t.now();
    const i = Math.floor(e);
    if (i !== x) {
      x = i;
      z = `${i}`;
    }
    return z + N[1e3 * (e - i) | 0];
  }();
  if (null == r && !n?._w && !o) {
    const t = s ? JSON.stringify(s).slice(1) : "";
    return t.length > 1 ? `{"_e":"${e}:${i}","_t":${c},${t}\n` : `{"_e":"${e}:${i}","_t":${c}}\n`;
  }
  let a = `{"_e":"${e}:${i}","_t":${c}`;
  if (null != r) {
    a += `,"_d":${r}`;
  }
  if (o) {
    a += `,"_l":${o}`;
  }
  if (n?._w) {
    a += `,"_w":${function stringifyWorkerId(e) {
      if (e !== F) {
        F = e;
        U = JSON.stringify(e);
      }
      return U;
    }(n._w)}`;
  }
  return `${function appendPayload(e, t) {
    if (!t) {
      return e;
    }
    const i = JSON.stringify(t);
    return i && i.length > 2 ? `${e},${i.slice(1, -1)}` : e;
  }(a, s)}}\n`;
}

const NOOP_DONE = () => {};

function serializeError(e, t = 0) {
  if (null == e) {
    return null;
  }
  if (!(e instanceof Error)) {
    return String(e);
  }
  const i = {
    name: e.name,
    message: e.message
  };
  const s = e.code;
  if ("string" == typeof s) {
    i.code = s;
  }
  const n = e.stack;
  if (n) {
    i.stack = n;
  }
  if (null != e.cause && t < 4) {
    i.cause = serializeError(e.cause, t + 1);
  }
  return i;
}

function createEventLogger(e, i) {
  function log(t, s) {
    if (j.primarySink && (!i || j.debug)) {
      !function writeEvent(e, t, i, s, n, r) {
        try {
          e._writeln(serializeEvent(t, i, s, n, void 0, r));
        } catch {}
      }(j.primarySink, e, t, s, j.eventMeta, i);
    }
  }
  log.span = function span() {
    if (!j.primarySink || i && !j.debug) {
      return NOOP_DONE;
    }
    const s = t.now();
    return function done(n, r) {
      if (!j.primarySink) {
        return;
      }
      !function writeCompleteEvent(e, t, i, s, n, r, o) {
        try {
          e._writeln(serializeEvent(t, i, s, r, n, o));
        } catch {}
      }(j.primarySink, e, n, r, t.now() - s, j.eventMeta, i);
    };
  };
  log.path = relativePath;
  log.error = error;
  log.category = e;
  return log;
}

function relativePath(t) {
  return {
    toJSON() {
      try {
        if (null == t || !e.isAbsolute(t)) {
          return t ?? null;
        }
        const i = e.relative(j.logPath, t).replace(/\\/g, "/");
        if (!i) {
          return ".";
        } else {
          return i.length < t.length ? i : t;
        }
      } catch {
        return t || null;
      }
    }
  };
}

function error(e) {
  return {
    toJSON: () => serializeError(e)
  };
}

function events(e) {
  return createEventLogger(e, void 0);
}

events.debug = function debug(e) {
  return createEventLogger(e, s);
};

function createDebugSink(e = process.env[r]) {
  const t = function compileLogDebugFilter(e) {
    const t = e?.split(/[\s,]+/).map(e => e.trim()).filter(Boolean);
    if (!t?.length) {
      return null;
    }
    return o(t);
  }(e);
  if (!t) {
    return null;
  }
  const i = _(process.stderr);
  return {
    get writable() {
      return !0;
    },
    _writeln(e) {
      let s = 0;
      let r;
      while (-1 !== (r = e.indexOf("\n", s))) {
        const o = e.slice(s, r);
        s = r + 1;
        if (!o) {
          continue;
        }
        const c = n(o, {
          debug: !0
        }, t);
        if (!c) {
          continue;
        }
        process.stderr.write(`${E(c, {
          colorize: i,
          stream: process.stderr
        })}\n`);
      }
      return !0;
    },
    end(e) {
      e?.();
      return this;
    },
    destroy() {}
  };
}

function filterMetadata(e = {}) {
  const t = [];
  return JSON.parse(JSON.stringify(e, function(i, s) {
    if (this === e && i.startsWith("_") || "bigint" == typeof s) {
      return;
    }
    if (s && "object" == typeof s) {
      while (t.length && t.at(-1) !== this) {
        t.pop();
      }
      if (t.includes(s)) {
        return;
      }
      t.push(s);
    }
    return s;
  }));
}

class LogStream extends $ {
  #e=-1;
  #t=null;
  #i=null;
  #s=!0;
  #n=!1;
  #r=!1;
  #o=!1;
  #c=!1;
  #a=!1;
  #l=!1;
  #h=!1;
  #d=I.allocUnsafe(0);
  #f=0;
  #u=0;
  #p=0;
  #g=[];
  #m=0;
  #y=0;
  #v=0;
  #w=!1;
  #k=!1;
  #b;
  #S=e => e ? this.#L(e) : this.#_(null, this.#u);
  #E=() => {
    this.#k = !1;
    if (!this.#n && this.#g.length - this.#m > this.#y) {
      this.#P();
    }
  };
  constructor(e, t = {}) {
    super();
    this.#s = !1 !== t.closeFd;
    if ("number" == typeof e) {
      try {
        S.fsyncSync(e);
      } catch {}
      this.#e = e;
      process.nextTick(() => this.emit("ready"));
    } else if ("string" == typeof e) {
      this.#I(e);
    } else {
      this.#$(e, null);
    }
  }
  get file() {
    return this.#t;
  }
  get fd() {
    return this.#e;
  }
  get writing() {
    return this.#n;
  }
  get buffered() {
    return this.#p + this.#u;
  }
  get writable() {
    return !this.#a && !this.#r;
  }
  reopen(e = this.#t) {
    if (null == this.#t) {
      throw new Error("Cannot reopen an fd-only LogStream");
    }
    if (this.#a || this.#r) {
      return;
    }
    if (e) {
      this.#t = e;
    }
    if (this.#l) {
      this.once("ready", () => this.reopen(e));
      return;
    }
    this.#h = !0;
    if (!this.#n) {
      this.#O();
    }
  }
  #O() {
    if (null == this.#t) {
      return;
    }
    this.#h = !1;
    this.#i = this.#e;
    this.#I(this.#t);
  }
  #M(e) {
    if ("EAGAIN" === e.code && null != this.#b) {
      this.#w = !0;
      this.#P();
    } else if (0 === this.#v) {
      this.#v = 1;
      setImmediate(() => this.#P());
    } else {
      this.#v = Math.min(2 * this.#v, 100);
      setTimeout(() => this.#P(), this.#v);
    }
  }
  #_=(e, t) => {
    if (e) {
      if ("EAGAIN" === e.code || "EBUSY" === e.code) {
        this.#M(e);
      } else {
        this.#L(e);
      }
      return;
    }
    this.#v = 0;
    this.emit("write", t);
    this.#f += t;
    this.#u -= t;
    this.#n = !1;
    if (this.#u) {
      this.#P();
    } else if (this.#o && !this.#r) {
      this.#C();
    } else if (this.#h) {
      this.#O();
    } else if (this.#g.length - this.#m > this.#y) {
      this.#P();
    } else if (this.#r) {
      this.#C();
    } else {
      this.#w = !1;
      if (this.#c) {
        this.emit("drain");
      }
    }
  };
  #I(t) {
    this.#$(i => {
      S.mkdir(e.dirname(t), {
        recursive: !0
      }, () => {
        S.open(t, "a", 384, (e, t) => {
          if (e || null == t) {
            i(e);
            return;
          }
          S.fchmod(t, 384, () => {
            i(null, t);
          });
        });
      });
    }, t);
  }
  #$(e, t) {
    this.#l = !0;
    this.#n = !0;
    e((e, i, s) => {
      const n = this.#i;
      this.#i = null;
      if (e) {
        this.#l = !1;
        this.#L(e);
      } else {
        this.#e = i ?? -1;
        this.#t = t;
        this.#b = s;
        this.#l = !1;
        this.#n = !1;
        this.emit("ready");
        if (null != n && n !== this.#e && !isStdFd(n)) {
          fsFsync(n, () => S.close(n, () => {}));
        }
        if (this.#a) {
          return;
        }
        if (this.#o) {
          this.#C();
        } else if (!this.#n && this.#g.length - this.#m > this.#y || this.#c) {
          this.#P();
        } else if (this.#r && !this.#n) {
          this.#C();
        }
      }
    }, this);
  }
  #C() {
    if (-1 === this.#e && this.#l) {
      this.once("ready", () => this.#C());
      return;
    }
    this.#a = !0;
    this.#y = 0;
    this.#g.length = 0;
    this.#m = 0;
    const onClose = e => {
      if (e) {
        this.emit("error", e);
        this.emit("close", e);
      } else {
        if (this.#r && !this.#n) {
          this.emit("finish");
        }
        this.emit("close");
      }
    };
    if (this.#e < 0) {
      onClose();
      return;
    }
    fsFsync(this.#e, e => {
      if (!e && this.#s && !isStdFd(this.#e)) {
        S.close(this.#e, onClose);
      } else {
        onClose();
      }
    });
  }
  #L(e) {
    this.#n = !1;
    if (this.listenerCount("error")) {
      this.emit("error", e);
    }
    this.#C();
  }
  #T() {
    if (!this.#k) {
      this.#k = !0;
      setImmediate(this.#E);
    }
  }
  #P() {
    this.#n = !0;
    if (!this.#u) {
      const e = this.#g.length - this.#y;
      if (e > this.#m) {
        let t = this.#g[this.#m];
        this.#g[this.#m++] = "";
        while (this.#m < e && t.length < 65536) {
          t += this.#g[this.#m];
          this.#g[this.#m++] = "";
        }
        this.#p -= t.length;
        if (this.#d.length < 3 * t.length) {
          this.#d = I.allocUnsafe(3 * t.length);
        }
        this.#f = 0;
        this.#u = this.#d.write(t);
        if (this.#m === this.#g.length) {
          this.#g.length = 0;
          this.#m = 0;
        } else if (this.#m >= 1024 && 2 * this.#m >= this.#g.length) {
          this.#g = this.#g.slice(this.#m);
          this.#m = 0;
        }
      }
    }
    if (null != this.#b && (this.#w || this.#e < 0)) {
      this.#b(this.#d.subarray(this.#f, this.#f + this.#u), this.#S);
    } else {
      S.write(this.#e, this.#d, this.#f, this.#u, null, this.#_);
    }
  }
  _end() {
    if (!this.#a && !this.#r) {
      this.#r = !0;
      if (!this.#l && !this.#n && this.#e >= 0) {
        if (this.#g.length - this.#m > this.#y) {
          this.#P();
        } else {
          this.#C();
        }
      }
    }
    return this;
  }
  end(e, t, i) {
    const s = i || t || e;
    const n = "function" != typeof e ? e : void 0;
    const r = "function" == typeof s ? s : void 0;
    if ("string" == typeof n) {
      this.write(n, "string" == typeof t ? t : "utf8");
    } else if (null != n) {
      this.write(n);
    }
    if (r) {
      this.once("close", r);
    }
    return this._end();
  }
  destroy() {
    if (this.#a || this.#o) {
      return;
    }
    if (this.#n || this.#l) {
      this.#o = !0;
    } else if (this.#g.length - this.#m > this.#y) {
      this.#o = !0;
      this.#P();
    } else {
      this.#C();
    }
  }
  flush(e) {
    if (this.#a) {
      e?.();
    } else {
      let t = !1;
      const finish = i => {
        if (t) {
          return;
        }
        t = !0;
        this.#c = !1;
        this.off("drain", onDrain);
        this.off("error", finish);
        this.off("close", onClose);
        e?.(i);
      };
      const onDrain = () => {
        if (!this.#a) {
          fsFsync(this.#e, e => {
            finish("EBADF" === e?.code ? void 0 : e);
          });
        } else {
          onClose();
        }
      };
      const onClose = e => {
        finish(e ?? (this.buffered > 0 ? new Error("Log stream closed before flushing buffered data") : void 0));
      };
      this.#c = !0;
      this.once("drain", onDrain);
      this.once("error", finish);
      this.once("close", onClose);
      if (!this.#n) {
        if (this.#g.length - this.#m > this.#y) {
          this.#P();
        } else {
          process.nextTick(() => this.emit("drain"));
        }
      }
    }
  }
  _writeln(e) {
    if (this.#a) {
      return !1;
    }
    this.#p += e.length;
    this.#g.push(e);
    if (!this.#n) {
      this.#T();
    }
    return this.buffered < 16384;
  }
  _write(e) {
    if (this.#a) {
      return !1;
    }
    if (0 === this.#y && 10 === e.charCodeAt(e.length - 1)) {
      return this._writeln(e);
    }
    this.#p += e.length;
    const t = e.lastIndexOf("\n") + 1;
    if (t) {
      const i = t === e.length ? e : e.slice(0, t);
      if (this.#y > 0) {
        this.#g[this.#g.length - 1] += i;
      } else {
        this.#g.push(i);
      }
      this.#y = 0;
    }
    if (t < e.length) {
      const i = e.slice(t);
      if (this.#y > 0) {
        this.#g[this.#g.length - 1] += i;
      } else {
        this.#g.push(i);
      }
      this.#y = 1;
    }
    if (!this.#n && this.#g.length - this.#m > this.#y) {
      this.#T();
    }
    return this.buffered < 16384;
  }
  write(e, t, i) {
    const s = i || t;
    const n = "string" == typeof t ? t : "utf8";
    const r = "string" == typeof e ? e : I.from(e.buffer, e.byteOffset, e.byteLength).toString(n);
    const o = "function" == typeof s ? s : void 0;
    try {
      return this._write(r);
    } finally {
      o?.();
    }
  }
  [Symbol.dispose]() {
    this.destroy();
  }
}

const isStdFd = e => {
  switch (e) {
   case 1:
   case 2:
   case process.stdout.fd:
   case process.stderr.fd:
    return !0;

   default:
    return !1;
  }
};

const fsFsync = (e, t) => {
  try {
    S.fsync(e, t);
  } catch (e) {
    t(e);
  }
};

class SocketSink {
  #j;
  constructor(e) {
    this.#j = e;
    e.on("error", () => {});
  }
  get writable() {
    return this.#j.writable;
  }
  get buffered() {
    return this.#j.writableLength;
  }
  _writeln(e) {
    return this.#j.write(e);
  }
  end(e) {
    this.#j.end(e);
    return this;
  }
  destroy() {
    this.#j.destroy();
  }
}

class BroadcastChannel {
  #D;
  #N=[];
  #a=!1;
  constructor(e) {
    this.#D = e;
    this.#N.push({
      sink: e,
      dropOnBackpressure: !1,
      destroy: () => e.destroy()
    });
  }
  get writable() {
    if (this.#a) {
      return !1;
    }
    for (let e = 0; e < this.#N.length; e++) {
      if (this.#N[e].sink.writable) {
        return !0;
      }
    }
    return !1;
  }
  add(e) {
    if (!e) {
      return;
    }
    if (this.#a) {
      e.destroy();
    } else {
      this.#N.push({
        sink: e,
        dropOnBackpressure: !1,
        destroy: () => e.destroy()
      });
    }
  }
  attach(e) {
    if (this.#a) {
      e.destroy();
      return;
    }
    e.unref();
    const t = (e => {
      const t = e._handle?.fd;
      if ("number" == typeof t && t >= 0) {
        return new LogStream(i => i(null, t, (t, i) => {
          e.write(t, i);
        }), {
          closeFd: !1
        });
      }
      return new SocketSink(e);
    })(e);
    const i = {
      sink: t,
      dropOnBackpressure: !0,
      destroy: () => {
        t.destroy();
        e.destroy();
      }
    };
    this.#N.push(i);
    const detach = () => {
      const e = this.#N.indexOf(i);
      if (e > -1) {
        this.#N.splice(e, 1);
      }
      i.destroy();
    };
    e.on("close", detach);
    e.on("error", detach);
  }
  _writeln(e) {
    const t = this.#N;
    let i = !1;
    for (let s = t.length - 1; s >= 0; s--) {
      const n = t[s];
      const r = n.sink._writeln(e);
      if (!r && n.dropOnBackpressure && (n.sink.buffered ?? 1 / 0) > 4194304) {
        t.splice(s, 1);
        n.destroy();
      }
      i = r || i;
    }
    return i;
  }
  flush(e) {
    if (this.#D.flush) {
      this.#D.flush(e);
    } else {
      e();
    }
  }
  end(e) {
    for (const t of this.#N) {
      t.sink.end(t.sink === this.#D ? e : void 0);
    }
    return this;
  }
  destroy() {
    this.#a = !0;
    for (const e of this.#N) {
      e.destroy();
    }
    this.#N.length = 0;
  }
}

const W = Symbol.for("2g/process-cleanup");

function registerProcessCleanup(e) {
  const t = getProcessCleanupState();
  t.callbacks.add(e);
  if (t.registered) {
    return;
  }
  t.registered = !0;
  process.once("exit", runProcessCleanup);
  for (const e of [ "SIGINT", "SIGTERM", "SIGHUP" ]) {
    process.once(e, () => {
      if (process.listenerCount(e) > 0) {
        return;
      }
      runProcessCleanup();
      process.kill(process.pid, e);
    });
  }
}

function getProcessCleanupState() {
  const e = globalThis;
  return e[W] ??= {
    registered: !1,
    callbacks: new Set
  };
}

function runProcessCleanup() {
  for (const e of getProcessCleanupState().callbacks) {
    try {
      e();
    } catch {}
  }
}

const A = Symbol.for("2g/process-origin");

function setLocalProcessOrigin(e) {
  const t = globalThis;
  if (e) {
    t[A] = e;
  } else {
    delete t[A];
  }
}

function getProcessWorkerId() {
  const e = function getProcessOrigin() {
    if (!M) {
      return {
        kind: "worker_thread",
        id: String(C)
      };
    }
    const e = globalThis[A];
    const t = process.env[c];
    if (t && t !== e) {
      return {
        kind: "event_log_child",
        id: String(process.pid)
      };
    }
    if (process.env.NODE_UNIQUE_ID) {
      return {
        kind: "child_process",
        id: process.env.NODE_UNIQUE_ID
      };
    }
    return null;
  }();
  return e ? `${e.kind}:${e.id}` : void 0;
}

function publishChildEnv(e) {
  process.env[a] = e;
  const t = j.debug;
  if (t) {
    process.env[l] = "1";
  }
  delete process.env[r];
  delete process.env[d];
  const i = function publishProcessOrigin() {
    const e = String(process.pid);
    process.env[c] = e;
    setLocalProcessOrigin(e);
    return () => {
      if (process.env[c] === e) {
        delete process.env[c];
      }
      setLocalProcessOrigin(void 0);
    };
  }();
  return () => {
    if (process.env[a] === e) {
      delete process.env[a];
    }
    if (t) {
      delete process.env[l];
    }
    i();
  };
}

function publishTempIpcSink(t) {
  const i = function createTempIpcPath() {
    const t = Date.now().toString(36);
    const i = Math.random().toString(36).slice(2, 10);
    const s = `${process.pid}-${t}-${i}`;
    return "win32" === process.platform ? `\\\\.\\pipe\\event-log-${s}-ipc` : e.join(O.tmpdir(), `event-log-${s}.sock`);
  }();
  const s = h(L.createServer(e => ingestIpcSocket(e, t)), i);
  const n = publishChildEnv(i);
  let r = !1;
  const cleanup = () => {
    if (r) {
      return;
    }
    r = !0;
    s();
    n();
    f(i);
  };
  const o = t.destroy.bind(t);
  t.destroy = () => {
    cleanup();
    o();
  };
  t.once("close", cleanup);
  registerProcessCleanup(cleanup);
}

function openIpc(e, t = {}) {
  const i = t.retryMs ?? 50;
  const s = t.maxRetryMs ?? 750;
  return (t, n) => {
    const r = Date.now();
    const attempt = () => {
      const o = L.connect(e);
      let c = !1;
      o.once("connect", () => {
        const e = o._handle?.fd;
        c = !0;
        o.unref();
        o.once("close", () => n.destroy());
        const drain = (e, t) => {
          o.ref();
          o.write(e, e => {
            o.unref();
            t(e);
          });
        };
        if ("number" == typeof e && e >= 0) {
          t(null, e, drain);
        } else {
          t(null, null, drain);
        }
      });
      o.once("error", e => {
        if (c) {
          return;
        }
        o.destroy();
        ((e, n) => {
          if (Date.now() - r > s) {
            t(e);
          } else {
            setTimeout(n, i);
          }
        })(e, attempt);
      });
    };
    attempt();
  };
}

function ingestIpcSocket(e, t) {
  let i = "";
  e.unref();
  e.setEncoding("utf8");
  e.on("data", e => {
    const s = i ? i + e : e;
    const n = s.lastIndexOf("\n");
    if (n === s.length - 1) {
      i = "";
      t._writeln(s);
    } else if (-1 === n) {
      i = s;
    } else {
      i = s.slice(n + 1);
      t._writeln(s.slice(0, n + 1));
    }
  });
  e.on("error", () => {});
}

function createSession(t) {
  const i = k();
  const s = Date.now();
  const n = `${process.pid}-${s.toString(36)}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
  const r = e.join(i, n);
  try {
    S.mkdirSync(r, {
      recursive: !0,
      mode: 448
    });
    S.chmodSync(i, 448);
  } catch {}
  const o = t.maxSegments ?? (j.debug ? u : p);
  const c = t.maxSegmentSize ?? (j.debug ? g : m);
  const a = y(r, n, "live");
  const l = y(r, n, "ipc");
  const d = new LogStream(e.join(r, "0.jsonl"));
  const _ = new BroadcastChannel(d);
  _.add(createDebugSink());
  !function trackSegmentRotation(t, i, s, n) {
    let r = 0;
    t.on("write", o => {
      r += o;
      if (r < n) {
        return;
      }
      r = 0;
      try {
        !function rotateSegments(t, i) {
          S.rmSync(e.join(t, i - 1 + ".jsonl"), {
            force: !0
          });
          for (let s = i - 1; s >= 1; s--) {
            const i = e.join(t, s - 1 + ".jsonl");
            const n = e.join(t, `${s}.jsonl`);
            try {
              S.renameSync(i, n);
            } catch {}
          }
        }(i, s);
      } catch {
        return;
      }
      t.reopen();
    });
  }(d, r, o, c);
  const E = L.createServer(e => _.attach(e));
  const P = h(E, a.path);
  const I = h(L.createServer(e => ingestIpcSocket(e, _)), l.path);
  const $ = publishChildEnv(l.path);
  const O = {
    format: w,
    pid: process.pid,
    startedAt: s,
    command: t.command ?? process.argv.slice(1).join(" "),
    cwd: process.cwd(),
    maxSegments: o,
    socket: a.name,
    ipcSocket: l.name,
    origin: createSessionOrigin(),
    metadata: Object.create(null)
  };
  let M = !1;
  function updateMetadata(t) {
    if (M) {
      return;
    }
    try {
      if (t) {
        for (const e in t) {
          const i = t[e];
          if (void 0 !== i) {
            O.metadata[e] = i;
          }
        }
      }
      !function writeJsonAtomic(e, t) {
        const i = `${e}.${process.pid}.tmp`;
        S.writeFileSync(i, JSON.stringify(t, null, 2), {
          mode: 384
        });
        S.renameSync(i, e);
      }(e.join(r, b.meta), {
        ...O,
        metadata: filterMetadata(O.metadata)
      });
    } catch {}
  }
  updateMetadata(t.metadata);
  const destroy = () => {
    if (M) {
      return;
    }
    M = !0;
    _.destroy();
    P();
    I();
    $();
    f(a.path);
    f(l.path);
  };
  registerProcessCleanup(destroy);
  setImmediate(() => {
    try {
      v();
    } catch {}
  });
  return {
    sessionDir: r,
    meta: O,
    sink: _,
    updateMetadata,
    destroy
  };
}

function createSessionOrigin() {
  const e = {
    npmLifecycleEvent: process.env.npm_lifecycle_event,
    npmExecPath: process.env.npm_execpath,
    npmPackageName: process.env.npm_package_name
  };
  return {
    argv: process.argv.slice(1),
    execPath: process.execPath,
    cwd: process.cwd(),
    ppid: process.ppid || void 0,
    env: Object.values(e).some(Boolean) ? e : void 0
  };
}

const B = events("root");

function installChildEventLogger(e) {
  if (j.primarySink) {
    return !0;
  }
  setWorkerMetadata();
  return connectToParent(e);
}

function setWorkerMetadata() {
  const e = getProcessWorkerId();
  if (e) {
    j.eventMeta = {
      _w: e
    };
  }
}

function installEventLogger(e) {
  if (j.primarySink) {
    return;
  }
  setWorkerMetadata();
  const t = e && "object" == typeof e ? e : void 0;
  if (connectToParent(t)) {
    return;
  }
  const i = parseLogTarget(process.env[d]) ?? parseLogTarget("string" == typeof e || "number" == typeof e ? e : void 0);
  if (null != i) {
    if ("number" == typeof i) {
      P(i);
    }
    j.debug = t?.debug ?? !0;
    j.eventLoggerInfo = "number" == typeof i ? {
      destination: 1 === i ? "stdout" : 2 === i ? "stderr" : "fd",
      isUserVisibleOutput: 1 === i || 2 === i,
      debug: j.debug,
      fd: i
    } : {
      destination: "file",
      isUserVisibleOutput: !1,
      debug: j.debug,
      file: i
    };
    const e = createPrimarySink(i);
    publishTempIpcSink(e);
    activateSink(e, t?.metadata);
    return;
  }
  if (t && !1 !== t.session) {
    j.debug = t.debug ?? !!process.env[r];
    const e = createSession(t);
    j.eventLoggerInfo = {
      destination: "session",
      isUserVisibleOutput: !1,
      debug: j.debug,
      sessionDir: e.sessionDir
    };
    j.updateMetadata = e.updateMetadata;
    activateSink(e.sink, t.metadata);
  }
}

const getEventLoggerInfo = () => j.primarySink?.writable ? j.eventLoggerInfo : null;

function flushEventLogger() {
  return new Promise(e => {
    const t = j.primarySink;
    if (t?.flush) {
      t.flush(() => e());
    } else {
      e();
    }
  });
}

function parseLogTarget(t) {
  if ("number" == typeof t) {
    return Number.isSafeInteger(t) && t > 0 ? t : void 0;
  }
  if (!t) {
    return;
  }
  const i = parseInt(t, 10);
  if (`${i}` === t && i > 0 && Number.isSafeInteger(i)) {
    return i;
  }
  try {
    return e.resolve(t);
  } catch {
    return;
  }
}

function createPrimarySink(e, t) {
  const i = new LogStream(e, t);
  i.once("error", () => {
    j.primarySink = void 0;
    j.updateMetadata = void 0;
    j.eventLoggerInfo = null;
  });
  return i;
}

function updateEventLoggerMetadata(e) {
  if (!j.primarySink?.writable) {
    return;
  }
  j.updateMetadata?.(e);
  emitMetadata("update", e);
}

function activateSink(e, t) {
  j.primarySink = e;
  emitMetadata("init", t);
}

function emitMetadata(e, t) {
  try {
    B(e, filterMetadata(t));
  } catch {}
}

function connectToParent(e) {
  const t = function getParentIpcPath() {
    return process.env[a];
  }();
  if (!t) {
    return !1;
  }
  j.debug = e?.debug ?? (function isParentDebugEnabled() {
    return "1" === process.env[l];
  }() || !!process.env[r]);
  const i = createPrimarySink(openIpc(t), {
    closeFd: !1
  });
  j.eventLoggerInfo = {
    destination: "ipc",
    isUserVisibleOutput: !1,
    debug: j.debug
  };
  activateSink(i, e?.metadata);
  return !0;
}

installChildEventLogger();

export { events, flushEventLogger, getEventLoggerInfo, installChildEventLogger, installEventLogger, updateEventLoggerMetadata };
//# sourceMappingURL=2g.mjs.map
