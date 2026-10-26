Object.defineProperty(exports, "__esModule", {
  value: !0
});

var e = require("node:path");

var t = require("node:perf_hooks");

var i = require("./chunks/clean-chunk.js");

var s = require("node:fs");

var n = require("node:net");

var r = require("./chunks/pretty-chunk.js");

var o = require("node:buffer");

var c = require("node:events");

var l = require("node:os");

var a = require("node:worker_threads");

const h = Symbol.for(`2g/state-${i.EVENT_LOG_STATE_VERSION}`);

const d = function getEventLogState() {
  const e = globalThis;
  return e[h] ??= {
    logPath: process.cwd(),
    eventLoggerInfo: null,
    debug: !1
  };
}();

const u = t.performance.timeOrigin;

const f = Array.from({
  length: 1e3
}, (e, t) => `.${`${t}`.padStart(3, "0")}`);

let g = -1;

let p = "";

let y;

let m = "";

function serializeEvent(e, i, s, n, r, o) {
  const c = function stringifyTimestamp() {
    const e = u + t.performance.now();
    const i = Math.floor(e);
    if (i !== g) {
      g = i;
      p = `${i}`;
    }
    return p + f[1e3 * (e - i) | 0];
  }();
  if (null == r && !n?._w && !o) {
    const t = s ? JSON.stringify(s).slice(1) : "";
    return t.length > 1 ? `{"_e":"${e}:${i}","_t":${c},${t}\n` : `{"_e":"${e}:${i}","_t":${c}}\n`;
  }
  let l = `{"_e":"${e}:${i}","_t":${c}`;
  if (null != r) {
    l += `,"_d":${r}`;
  }
  if (o) {
    l += `,"_l":${o}`;
  }
  if (n?._w) {
    l += `,"_w":${function stringifyWorkerId(e) {
      if (e !== y) {
        y = e;
        m = JSON.stringify(e);
      }
      return m;
    }(n._w)}`;
  }
  return `${function appendPayload(e, t) {
    if (!t) {
      return e;
    }
    const i = JSON.stringify(t);
    return i && i.length > 2 ? `${e},${i.slice(1, -1)}` : e;
  }(l, s)}}\n`;
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
    if (d.primarySink && (!i || d.debug)) {
      !function writeEvent(e, t, i, s, n, r) {
        try {
          e._writeln(serializeEvent(t, i, s, n, void 0, r));
        } catch {}
      }(d.primarySink, e, t, s, d.eventMeta, i);
    }
  }
  log.span = function span() {
    if (!d.primarySink || i && !d.debug) {
      return NOOP_DONE;
    }
    const s = t.performance.now();
    return function done(n, r) {
      if (!d.primarySink) {
        return;
      }
      !function writeCompleteEvent(e, t, i, s, n, r, o) {
        try {
          e._writeln(serializeEvent(t, i, s, r, n, o));
        } catch {}
      }(d.primarySink, e, n, r, t.performance.now() - s, d.eventMeta, i);
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
        const i = e.relative(d.logPath, t).replace(/\\/g, "/");
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
  return createEventLogger(e, i.EVENT_LEVEL_DEBUG);
};

function createDebugSink(e = process.env[i.LOG_DEBUG_ENV]) {
  const t = function compileLogDebugFilter(e) {
    const t = e?.split(/[\s,]+/).map(e => e.trim()).filter(Boolean);
    if (!t?.length) {
      return null;
    }
    return i.compileEventFilter(t);
  }(e);
  if (!t) {
    return null;
  }
  const s = r.shouldColorizeStream(process.stderr);
  return {
    get writable() {
      return !0;
    },
    _writeln(e) {
      let n = 0;
      let o;
      while (-1 !== (o = e.indexOf("\n", n))) {
        const c = e.slice(n, o);
        n = o + 1;
        if (!c) {
          continue;
        }
        const l = i.parseEventLine(c, {
          debug: !0
        }, t);
        if (!l) {
          continue;
        }
        process.stderr.write(`${r.formatPrettyEvent(l, {
          colorize: s,
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

class LogStream extends c.EventEmitter {
  #e=-1;
  #t=null;
  #i=null;
  #s=!0;
  #n=!1;
  #r=!1;
  #o=!1;
  #c=!1;
  #l=!1;
  #a=!1;
  #h=!1;
  #d=o.Buffer.allocUnsafe(0);
  #u=0;
  #f=0;
  #g=0;
  #p=[];
  #y=0;
  #m=0;
  #S=0;
  #v=!1;
  #E=!1;
  #k;
  #w=e => e ? this.#_(e) : this.#b(null, this.#f);
  #L=() => {
    this.#E = !1;
    if (!this.#n && this.#p.length - this.#y > this.#m) {
      this.#N();
    }
  };
  constructor(e, t = {}) {
    super();
    this.#s = !1 !== t.closeFd;
    if ("number" == typeof e) {
      try {
        s.fsyncSync(e);
      } catch {}
      this.#e = e;
      process.nextTick(() => this.emit("ready"));
    } else if ("string" == typeof e) {
      this.#I(e);
    } else {
      this.#O(e, null);
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
    return this.#g + this.#f;
  }
  get writable() {
    return !this.#l && !this.#r;
  }
  reopen(e = this.#t) {
    if (null == this.#t) {
      throw new Error("Cannot reopen an fd-only LogStream");
    }
    if (this.#l || this.#r) {
      return;
    }
    if (e) {
      this.#t = e;
    }
    if (this.#a) {
      this.once("ready", () => this.reopen(e));
      return;
    }
    this.#h = !0;
    if (!this.#n) {
      this.#P();
    }
  }
  #P() {
    if (null == this.#t) {
      return;
    }
    this.#h = !1;
    this.#i = this.#e;
    this.#I(this.#t);
  }
  #T(e) {
    if ("EAGAIN" === e.code && null != this.#k) {
      this.#v = !0;
      this.#N();
    } else if (0 === this.#S) {
      this.#S = 1;
      setImmediate(() => this.#N());
    } else {
      this.#S = Math.min(2 * this.#S, 100);
      setTimeout(() => this.#N(), this.#S);
    }
  }
  #b=(e, t) => {
    if (e) {
      if ("EAGAIN" === e.code || "EBUSY" === e.code) {
        this.#T(e);
      } else {
        this.#_(e);
      }
      return;
    }
    this.#S = 0;
    this.emit("write", t);
    this.#u += t;
    this.#f -= t;
    this.#n = !1;
    if (this.#f) {
      this.#N();
    } else if (this.#o && !this.#r) {
      this.#M();
    } else if (this.#h) {
      this.#P();
    } else if (this.#p.length - this.#y > this.#m) {
      this.#N();
    } else if (this.#r) {
      this.#M();
    } else {
      this.#v = !1;
      if (this.#c) {
        this.emit("drain");
      }
    }
  };
  #I(t) {
    this.#O(i => {
      s.mkdir(e.dirname(t), {
        recursive: !0
      }, () => {
        s.open(t, "a", 384, (e, t) => {
          if (e || null == t) {
            i(e);
            return;
          }
          s.fchmod(t, 384, () => {
            i(null, t);
          });
        });
      });
    }, t);
  }
  #O(e, t) {
    this.#a = !0;
    this.#n = !0;
    e((e, i, n) => {
      const r = this.#i;
      this.#i = null;
      if (e) {
        this.#a = !1;
        this.#_(e);
      } else {
        this.#e = i ?? -1;
        this.#t = t;
        this.#k = n;
        this.#a = !1;
        this.#n = !1;
        this.emit("ready");
        if (null != r && r !== this.#e && !isStdFd(r)) {
          fsFsync(r, () => s.close(r, () => {}));
        }
        if (this.#l) {
          return;
        }
        if (this.#o) {
          this.#M();
        } else if (!this.#n && this.#p.length - this.#y > this.#m || this.#c) {
          this.#N();
        } else if (this.#r && !this.#n) {
          this.#M();
        }
      }
    }, this);
  }
  #M() {
    if (-1 === this.#e && this.#a) {
      this.once("ready", () => this.#M());
      return;
    }
    this.#l = !0;
    this.#m = 0;
    this.#p.length = 0;
    this.#y = 0;
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
        s.close(this.#e, onClose);
      } else {
        onClose();
      }
    });
  }
  #_(e) {
    this.#n = !1;
    if (this.listenerCount("error")) {
      this.emit("error", e);
    }
    this.#M();
  }
  #$() {
    if (!this.#E) {
      this.#E = !0;
      setImmediate(this.#L);
    }
  }
  #N() {
    this.#n = !0;
    if (!this.#f) {
      const e = this.#p.length - this.#m;
      if (e > this.#y) {
        let t = this.#p[this.#y];
        this.#p[this.#y++] = "";
        while (this.#y < e && t.length < 65536) {
          t += this.#p[this.#y];
          this.#p[this.#y++] = "";
        }
        this.#g -= t.length;
        if (this.#d.length < 3 * t.length) {
          this.#d = o.Buffer.allocUnsafe(3 * t.length);
        }
        this.#u = 0;
        this.#f = this.#d.write(t);
        if (this.#y === this.#p.length) {
          this.#p.length = 0;
          this.#y = 0;
        } else if (this.#y >= 1024 && 2 * this.#y >= this.#p.length) {
          this.#p = this.#p.slice(this.#y);
          this.#y = 0;
        }
      }
    }
    if (null != this.#k && (this.#v || this.#e < 0)) {
      this.#k(this.#d.subarray(this.#u, this.#u + this.#f), this.#w);
    } else {
      s.write(this.#e, this.#d, this.#u, this.#f, null, this.#b);
    }
  }
  _end() {
    if (!this.#l && !this.#r) {
      this.#r = !0;
      if (!this.#a && !this.#n && this.#e >= 0) {
        if (this.#p.length - this.#y > this.#m) {
          this.#N();
        } else {
          this.#M();
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
    if (this.#l || this.#o) {
      return;
    }
    if (this.#n || this.#a) {
      this.#o = !0;
    } else if (this.#p.length - this.#y > this.#m) {
      this.#o = !0;
      this.#N();
    } else {
      this.#M();
    }
  }
  flush(e) {
    if (this.#l) {
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
        if (!this.#l) {
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
        if (this.#p.length - this.#y > this.#m) {
          this.#N();
        } else {
          process.nextTick(() => this.emit("drain"));
        }
      }
    }
  }
  _writeln(e) {
    if (this.#l) {
      return !1;
    }
    this.#g += e.length;
    this.#p.push(e);
    if (!this.#n) {
      this.#$();
    }
    return this.buffered < 16384;
  }
  _write(e) {
    if (this.#l) {
      return !1;
    }
    if (0 === this.#m && 10 === e.charCodeAt(e.length - 1)) {
      return this._writeln(e);
    }
    this.#g += e.length;
    const t = e.lastIndexOf("\n") + 1;
    if (t) {
      const i = t === e.length ? e : e.slice(0, t);
      if (this.#m > 0) {
        this.#p[this.#p.length - 1] += i;
      } else {
        this.#p.push(i);
      }
      this.#m = 0;
    }
    if (t < e.length) {
      const i = e.slice(t);
      if (this.#m > 0) {
        this.#p[this.#p.length - 1] += i;
      } else {
        this.#p.push(i);
      }
      this.#m = 1;
    }
    if (!this.#n && this.#p.length - this.#y > this.#m) {
      this.#$();
    }
    return this.buffered < 16384;
  }
  write(e, t, i) {
    const s = i || t;
    const n = "string" == typeof t ? t : "utf8";
    const r = "string" == typeof e ? e : o.Buffer.from(e.buffer, e.byteOffset, e.byteLength).toString(n);
    const c = "function" == typeof s ? s : void 0;
    try {
      return this._write(r);
    } finally {
      c?.();
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
    s.fsync(e, t);
  } catch (e) {
    t(e);
  }
};

class SocketSink {
  #C;
  constructor(e) {
    this.#C = e;
    e.on("error", () => {});
  }
  get writable() {
    return this.#C.writable;
  }
  get buffered() {
    return this.#C.writableLength;
  }
  _writeln(e) {
    return this.#C.write(e);
  }
  end(e) {
    this.#C.end(e);
    return this;
  }
  destroy() {
    this.#C.destroy();
  }
}

class BroadcastChannel {
  #D;
  #G=[];
  #l=!1;
  constructor(e) {
    this.#D = e;
    this.#G.push({
      sink: e,
      dropOnBackpressure: !1,
      destroy: () => e.destroy()
    });
  }
  get writable() {
    if (this.#l) {
      return !1;
    }
    for (let e = 0; e < this.#G.length; e++) {
      if (this.#G[e].sink.writable) {
        return !0;
      }
    }
    return !1;
  }
  add(e) {
    if (!e) {
      return;
    }
    if (this.#l) {
      e.destroy();
    } else {
      this.#G.push({
        sink: e,
        dropOnBackpressure: !1,
        destroy: () => e.destroy()
      });
    }
  }
  attach(e) {
    if (this.#l) {
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
    this.#G.push(i);
    const detach = () => {
      const e = this.#G.indexOf(i);
      if (e > -1) {
        this.#G.splice(e, 1);
      }
      i.destroy();
    };
    e.on("close", detach);
    e.on("error", detach);
  }
  _writeln(e) {
    const t = this.#G;
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
    for (const t of this.#G) {
      t.sink.end(t.sink === this.#D ? e : void 0);
    }
    return this;
  }
  destroy() {
    this.#l = !0;
    for (const e of this.#G) {
      e.destroy();
    }
    this.#G.length = 0;
  }
}

const S = Symbol.for("2g/process-cleanup");

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
  return e[S] ??= {
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

const v = Symbol.for("2g/process-origin");

function setLocalProcessOrigin(e) {
  const t = globalThis;
  if (e) {
    t[v] = e;
  } else {
    delete t[v];
  }
}

function getProcessWorkerId() {
  const e = function getProcessOrigin() {
    if (!a.isMainThread) {
      return {
        kind: "worker_thread",
        id: String(a.threadId)
      };
    }
    const e = globalThis[v];
    const t = process.env[i.INTERNAL_PROCESS_ORIGIN_ENV];
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
  process.env[i.INTERNAL_IPC_ENV] = e;
  const t = d.debug;
  if (t) {
    process.env[i.INTERNAL_DEBUG_ENV] = "1";
  }
  delete process.env[i.LOG_DEBUG_ENV];
  delete process.env[i.LOG_EVENTS_ENV];
  const s = function publishProcessOrigin() {
    const e = String(process.pid);
    process.env[i.INTERNAL_PROCESS_ORIGIN_ENV] = e;
    setLocalProcessOrigin(e);
    return () => {
      if (process.env[i.INTERNAL_PROCESS_ORIGIN_ENV] === e) {
        delete process.env[i.INTERNAL_PROCESS_ORIGIN_ENV];
      }
      setLocalProcessOrigin(void 0);
    };
  }();
  return () => {
    if (process.env[i.INTERNAL_IPC_ENV] === e) {
      delete process.env[i.INTERNAL_IPC_ENV];
    }
    if (t) {
      delete process.env[i.INTERNAL_DEBUG_ENV];
    }
    s();
  };
}

function publishTempIpcSink(t) {
  const s = function createTempIpcPath() {
    const t = Date.now().toString(36);
    const i = Math.random().toString(36).slice(2, 10);
    const s = `${process.pid}-${t}-${i}`;
    return "win32" === process.platform ? `\\\\.\\pipe\\event-log-${s}-ipc` : e.join(l.tmpdir(), `event-log-${s}.sock`);
  }();
  const r = i.listenSocket(n.createServer(e => ingestIpcSocket(e, t)), s);
  const o = publishChildEnv(s);
  let c = !1;
  const cleanup = () => {
    if (c) {
      return;
    }
    c = !0;
    r();
    o();
    i.removeSocket(s);
  };
  const a = t.destroy.bind(t);
  t.destroy = () => {
    cleanup();
    a();
  };
  t.once("close", cleanup);
  registerProcessCleanup(cleanup);
}

function openIpc(e, t = {}) {
  const i = t.retryMs ?? 50;
  const s = t.maxRetryMs ?? 750;
  return (t, r) => {
    const o = Date.now();
    const attempt = () => {
      const c = n.connect(e);
      let l = !1;
      c.once("connect", () => {
        const e = c._handle?.fd;
        l = !0;
        c.unref();
        c.once("close", () => r.destroy());
        const drain = (e, t) => {
          c.ref();
          c.write(e, e => {
            c.unref();
            t(e);
          });
        };
        if ("number" == typeof e && e >= 0) {
          t(null, e, drain);
        } else {
          t(null, null, drain);
        }
      });
      c.once("error", e => {
        if (l) {
          return;
        }
        c.destroy();
        ((e, n) => {
          if (Date.now() - o > s) {
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
  const r = i.getSessionBaseDir();
  const o = Date.now();
  const c = `${process.pid}-${o.toString(36)}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
  const l = e.join(r, c);
  try {
    s.mkdirSync(l, {
      recursive: !0,
      mode: 448
    });
    s.chmodSync(r, 448);
  } catch {}
  const a = t.maxSegments ?? (d.debug ? i.DEBUG_SEGMENTS : i.DEFAULT_SEGMENTS);
  const h = t.maxSegmentSize ?? (d.debug ? i.DEBUG_SEGMENT_SIZE : i.DEFAULT_SEGMENT_SIZE);
  const u = i.createSocketAddress(l, c, "live");
  const f = i.createSocketAddress(l, c, "ipc");
  const g = new LogStream(e.join(l, "0.jsonl"));
  const p = new BroadcastChannel(g);
  p.add(createDebugSink());
  !function trackSegmentRotation(t, i, n, r) {
    let o = 0;
    t.on("write", c => {
      o += c;
      if (o < r) {
        return;
      }
      o = 0;
      try {
        !function rotateSegments(t, i) {
          s.rmSync(e.join(t, i - 1 + ".jsonl"), {
            force: !0
          });
          for (let n = i - 1; n >= 1; n--) {
            const i = e.join(t, n - 1 + ".jsonl");
            const r = e.join(t, `${n}.jsonl`);
            try {
              s.renameSync(i, r);
            } catch {}
          }
        }(i, n);
      } catch {
        return;
      }
      t.reopen();
    });
  }(g, l, a, h);
  const y = n.createServer(e => p.attach(e));
  const m = i.listenSocket(y, u.path);
  const S = i.listenSocket(n.createServer(e => ingestIpcSocket(e, p)), f.path);
  const v = publishChildEnv(f.path);
  const E = {
    format: i.EVENT_LOG_FORMAT,
    pid: process.pid,
    startedAt: o,
    command: t.command ?? process.argv.slice(1).join(" "),
    cwd: process.cwd(),
    maxSegments: a,
    socket: u.name,
    ipcSocket: f.name,
    origin: createSessionOrigin(),
    metadata: Object.create(null)
  };
  let k = !1;
  function updateMetadata(t) {
    if (k) {
      return;
    }
    try {
      if (t) {
        for (const e in t) {
          const i = t[e];
          if (void 0 !== i) {
            E.metadata[e] = i;
          }
        }
      }
      !function writeJsonAtomic(e, t) {
        const i = `${e}.${process.pid}.tmp`;
        s.writeFileSync(i, JSON.stringify(t, null, 2), {
          mode: 384
        });
        s.renameSync(i, e);
      }(e.join(l, i.SESSION_FILES.meta), {
        ...E,
        metadata: filterMetadata(E.metadata)
      });
    } catch {}
  }
  updateMetadata(t.metadata);
  const destroy = () => {
    if (k) {
      return;
    }
    k = !0;
    p.destroy();
    m();
    S();
    v();
    i.removeSocket(u.path);
    i.removeSocket(f.path);
  };
  registerProcessCleanup(destroy);
  setImmediate(() => {
    try {
      i.cleanStaleSessionsSync();
    } catch {}
  });
  return {
    sessionDir: l,
    meta: E,
    sink: p,
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

const E = events("root");

function installChildEventLogger(e) {
  if (d.primarySink) {
    return !0;
  }
  setWorkerMetadata();
  return connectToParent(e);
}

function setWorkerMetadata() {
  const e = getProcessWorkerId();
  if (e) {
    d.eventMeta = {
      _w: e
    };
  }
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
    d.primarySink = void 0;
    d.updateMetadata = void 0;
    d.eventLoggerInfo = null;
  });
  return i;
}

function activateSink(e, t) {
  d.primarySink = e;
  emitMetadata("init", t);
}

function emitMetadata(e, t) {
  try {
    E(e, filterMetadata(t));
  } catch {}
}

function connectToParent(e) {
  const t = function getParentIpcPath() {
    return process.env[i.INTERNAL_IPC_ENV];
  }();
  if (!t) {
    return !1;
  }
  d.debug = e?.debug ?? (function isParentDebugEnabled() {
    return "1" === process.env[i.INTERNAL_DEBUG_ENV];
  }() || !!process.env[i.LOG_DEBUG_ENV]);
  const s = createPrimarySink(openIpc(t), {
    closeFd: !1
  });
  d.eventLoggerInfo = {
    destination: "ipc",
    isUserVisibleOutput: !1,
    debug: d.debug
  };
  activateSink(s, e?.metadata);
  return !0;
}

installChildEventLogger();

exports.events = events;

exports.flushEventLogger = function flushEventLogger() {
  return new Promise(e => {
    const t = d.primarySink;
    if (t?.flush) {
      t.flush(() => e());
    } else {
      e();
    }
  });
};

exports.getEventLoggerInfo = () => d.primarySink?.writable ? d.eventLoggerInfo : null;

exports.installChildEventLogger = installChildEventLogger;

exports.installEventLogger = function installEventLogger(e) {
  if (d.primarySink) {
    return;
  }
  setWorkerMetadata();
  const t = e && "object" == typeof e ? e : void 0;
  if (connectToParent(t)) {
    return;
  }
  const s = parseLogTarget(process.env[i.LOG_EVENTS_ENV]) ?? parseLogTarget("string" == typeof e || "number" == typeof e ? e : void 0);
  if (null != s) {
    if ("number" == typeof s) {
      r.redirectConsoleForFd(s);
    }
    d.debug = t?.debug ?? !0;
    d.eventLoggerInfo = "number" == typeof s ? {
      destination: 1 === s ? "stdout" : 2 === s ? "stderr" : "fd",
      isUserVisibleOutput: 1 === s || 2 === s,
      debug: d.debug,
      fd: s
    } : {
      destination: "file",
      isUserVisibleOutput: !1,
      debug: d.debug,
      file: s
    };
    const e = createPrimarySink(s);
    publishTempIpcSink(e);
    activateSink(e, t?.metadata);
    return;
  }
  if (t && !1 !== t.session) {
    d.debug = t.debug ?? !!process.env[i.LOG_DEBUG_ENV];
    const e = createSession(t);
    d.eventLoggerInfo = {
      destination: "session",
      isUserVisibleOutput: !1,
      debug: d.debug,
      sessionDir: e.sessionDir
    };
    d.updateMetadata = e.updateMetadata;
    activateSink(e.sink, t.metadata);
  }
};

exports.updateEventLoggerMetadata = function updateEventLoggerMetadata(e) {
  if (!d.primarySink?.writable) {
    return;
  }
  d.updateMetadata?.(e);
  emitMetadata("update", e);
};
//# sourceMappingURL=2g.js.map
