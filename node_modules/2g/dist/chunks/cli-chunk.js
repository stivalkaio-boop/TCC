var e = require("node:url");

var t = require("node:util");

var n = require("./clean-chunk.js");

var s = require("./pretty-chunk.js");

var o = require("node:fs");

var r = require("./api-chunk.js");

var i = require("node:readline");

var a = require("node:crypto");

var l = require("node:child_process");

var c = require("node:os");

var p = "undefined" != typeof document ? document.currentScript : null;

function runCleanCli(e = []) {
  const o = function parseCleanOptions(e) {
    const n = t.parseArgs({
      args: e,
      options: {
        all: {
          type: "boolean",
          short: "a"
        },
        json: {
          type: "boolean"
        },
        help: {
          type: "boolean",
          short: "h"
        }
      }
    });
    return {
      all: !0 === n.values.all,
      json: !0 === n.values.json
    };
  }(e);
  if (o.json) {
    s.redirectConsoleToStderr();
  }
  const r = o.all ? n.cleanExitedSessionsSync() : n.cleanStaleSessionsSync();
  process.stdout.write(o.json ? `${JSON.stringify({
    removed: r
  })}\n` : `Removed ${r} ${o.all ? "exited" : "stale"} sessions.\n`);
}

const u = {
  since: {
    type: "string"
  },
  filter: {
    type: "string",
    multiple: !0
  },
  spans: {
    type: "boolean"
  },
  debug: {
    type: "boolean"
  },
  tail: {
    type: "boolean"
  }
};

async function warnOnRotationLoss(e, t) {
  if (!await r.detectRotationLoss(e)) {
    return;
  }
  console.warn(`⚠ Earlier events were rotated out of the retained window.\n  For a complete trace, start \`${t}\` before the workload.`);
}

async function* readJsonlStream(e) {
  const t = i.createInterface({
    input: e
  });
  for await (const e of t) {
    if (!e) {
      continue;
    }
    const t = n.parseEventLine(e, {
      debug: !0
    });
    if (t) {
      yield t;
    }
  }
}

function parseSharedTapOptions(e) {
  return {
    since: e.since,
    filter: e.filter?.flatMap(e => e.split(",")).map(e => e.trim()).filter(Boolean),
    spans: !0 === e.spans,
    debug: !0 === e.debug,
    follow: !0 === e.tail
  };
}

function parseHelp(e) {
  return !0 === t.parseArgs({
    args: e,
    allowPositionals: !0,
    strict: !1,
    options: {
      help: {
        type: "boolean",
        short: "h"
      }
    }
  }).values.help;
}

class ExportContext {
  #e;
  #t;
  constructor(e) {
    this.options = e;
    this.version = e.version;
    this.#e = n.compileEventFilter(e.filter);
    this.#t = {
      ...e,
      since: n.parseSince(e.since)
    };
  }
  get processName() {
    if (null != this.options.processName) {
      return this.options.processName;
    }
    const e = this.version;
    if (null != this.options.command) {
      return `${this.options.command} (${e ? `v${e}, ` : ""}PID ${this.options.pid})`;
    }
    return e ? `2g (v${e})` : "2g";
  }
  read(e) {
    if (!e._w && ("root:init" === e._e || "root:update" === e._e) && "string" == typeof e.version) {
      this.version = e.version;
    }
    if (!n.matchesTapOptions(e, this.#t, this.#e)) {
      return;
    }
    if ("root:init" === e._e) {
      return {
        ...e,
        _e: "root:update"
      };
    }
    return e;
  }
}

const d = [ ":started", ":done", ":failed" ];

function splitEventName(e) {
  const t = e.indexOf(":");
  if (t < 1) {
    return null;
  }
  return {
    category: e.slice(0, t),
    name: e.slice(t + 1)
  };
}

function stripSuffix(e) {
  for (const t of d) {
    if (e.endsWith(t)) {
      return e.slice(0, -t.length);
    }
  }
  return e;
}

async function convertToChromeTrace(e, t = {}) {
  const n = new TraceConverter(t);
  for await (const t of e) {
    n.add(t);
  }
  return n.toTraceFile();
}

class TraceConverter {
  #n=[];
  #s=new Map;
  #o;
  #r;
  constructor(e = {}) {
    this.#o = e.pid ?? 1;
    this.#r = new ExportContext(e);
  }
  add(e) {
    const t = this.#r.read(e);
    if (!t) {
      return;
    }
    const n = splitEventName(t._e) ?? {
      category: "uncategorized",
      name: t._e
    };
    const s = this.#i(n.category, "string" == typeof t._w ? t._w : void 0);
    const o = function extractArgs(e) {
      const t = {};
      for (const n of Object.keys(e)) {
        if (n.startsWith("_")) {
          continue;
        }
        t[n] = e[n];
      }
      return Object.keys(t).length ? t : void 0;
    }(t);
    if ("number" == typeof t._d) {
      const e = {
        kind: "span",
        track: s,
        name: stripSuffix(n.name),
        cat: n.category,
        ts: Math.round(1e3 * (t._t - t._d)),
        dur: Math.round(1e3 * t._d),
        args: o,
        lane: 0
      };
      s.spans.push(e);
      this.#n.push(e);
    } else {
      this.#n.push({
        kind: "instant",
        track: s,
        name: stripSuffix(n.name),
        cat: n.category,
        ts: Math.round(1e3 * t._t),
        args: o
      });
    }
  }
  toTraceFile() {
    let e = this.#n.length ? 1 / 0 : 0;
    for (const t of this.#n) {
      if (t.ts < e) {
        e = t.ts;
      }
    }
    const t = [ {
      ph: "M",
      name: "process_name",
      pid: this.#o,
      args: {
        name: this.#r.processName
      }
    } ];
    let n = 1;
    for (const e of this.#s.values()) {
      const s = Math.max(assignLanes(e.spans), 1);
      e.tid = n;
      for (let o = 0; o < s; o++) {
        const s = n++;
        t.push({
          ph: "M",
          name: "thread_name",
          pid: this.#o,
          tid: s,
          args: {
            name: 0 === o ? e.name : `${e.name} #${o + 1}`
          }
        }, {
          ph: "M",
          name: "thread_sort_index",
          pid: this.#o,
          tid: s,
          args: {
            sort_index: s
          }
        });
      }
    }
    for (const n of this.#n) {
      const s = n.track.tid + ("span" === n.kind ? n.lane : 0);
      if ("span" === n.kind) {
        t.push({
          ph: "X",
          name: n.name,
          cat: n.cat,
          pid: this.#o,
          tid: s,
          ts: n.ts - e,
          dur: n.dur,
          args: n.args
        });
      } else {
        t.push({
          ph: "i",
          name: n.name,
          cat: n.cat,
          pid: this.#o,
          tid: s,
          ts: n.ts - e,
          s: "t",
          args: n.args
        });
      }
    }
    return {
      traceEvents: t,
      metadata: {
        source: "2g",
        version: this.#r.version,
        convertedAt: (new Date).toISOString(),
        startTime: new Date(e / 1e3).toISOString(),
        startTimestampMs: e / 1e3
      }
    };
  }
  #i(e, t) {
    const n = t ? `${e}:${t}` : e;
    let s = this.#s.get(n);
    if (!s) {
      s = {
        name: t ? `${e} ${t}` : e,
        spans: [],
        tid: 0
      };
      this.#s.set(n, s);
    }
    return s;
  }
}

function assignLanes(e) {
  e.sort((e, t) => e.ts - t.ts || t.ts + t.dur - (e.ts + e.dur));
  const t = [];
  for (const n of e) {
    const e = n.ts + n.dur;
    let s = -1;
    for (let o = 0; o < t.length; o++) {
      const r = t[o];
      while (r.length && r[r.length - 1].ts + r[r.length - 1].dur <= n.ts) {
        r.pop();
      }
      const i = r[r.length - 1];
      if (!i || i.ts + i.dur >= e) {
        r.push(n);
        s = o;
        break;
      }
    }
    if (s < 0) {
      t.push([ n ]);
      s = t.length - 1;
    }
    n.lane = s;
  }
  return t.length;
}

async function convertToOpenTelemetry(e, t = {}) {
  const n = new OpenTelemetryConverter(t);
  for await (const t of e) {
    n.add(t);
  }
  return n.toFile();
}

class OpenTelemetryConverter {
  #a=a.randomBytes(16).toString("hex");
  #l=createSpanId();
  #c=[];
  #p=[];
  #r;
  #u;
  #d;
  constructor(e) {
    this.options = e;
    this.#r = new ExportContext(e);
  }
  add(e) {
    const t = this.#r.read(e);
    if (!t) {
      return;
    }
    const n = unixNano(t._t);
    const s = "number" == typeof t._d ? unixNano(t._t - t._d) : n;
    this.#u = null == this.#u || s < this.#u ? s : this.#u;
    this.#d = null == this.#d || n > this.#d ? n : this.#d;
    if ("number" == typeof t._d) {
      this.#c.push(this.#m(t, s, n));
    } else {
      this.#p.push(this.#f(t, n));
    }
  }
  toFile() {
    const e = this.#u ?? unixNano(Date.now());
    const t = this.#d ?? e;
    return {
      resourceSpans: [ {
        resource: {
          attributes: attributes({
            "service.name": this.#r.processName,
            "service.version": this.#r.version,
            "process.pid": this.options.pid,
            "telemetry.sdk.name": "2g",
            "telemetry.sdk.language": "nodejs"
          })
        },
        scopeSpans: [ {
          scope: {
            name: "2g"
          },
          spans: [ {
            traceId: this.#a,
            spanId: this.#l,
            name: this.#r.processName,
            startTimeUnixNano: String(e),
            endTimeUnixNano: String(t),
            attributes: attributes({
              "event_log.kind": "session"
            }),
            events: this.#p.length ? this.#p : void 0
          }, ...this.#c ]
        } ]
      } ]
    };
  }
  #m(e, t, n) {
    const s = splitEventName(e._e);
    return {
      traceId: this.#a,
      spanId: createSpanId(),
      parentSpanId: this.#l,
      name: s ? stripSuffix(s.name) : e._e,
      startTimeUnixNano: String(t),
      endTimeUnixNano: String(n),
      attributes: eventAttributes(e, s)
    };
  }
  #f(e, t) {
    const n = splitEventName(e._e);
    return {
      timeUnixNano: String(t),
      name: n ? stripSuffix(n.name) : e._e,
      attributes: eventAttributes(e, n)
    };
  }
}

function eventAttributes(e, t) {
  const n = [];
  addAttribute(n, "event.name", e._e);
  if (t) {
    addAttribute(n, "event.category", t.category);
    addAttribute(n, "event.action", t.name);
  }
  if ("string" == typeof e._w) {
    addAttribute(n, "event.worker.id", e._w);
  }
  for (const t of Object.keys(e)) {
    if ("_e" === t || "_t" === t || "_d" === t || "_l" === t || "_w" === t) {
      continue;
    }
    addAttribute(n, `event_log.${t}`, e[t]);
  }
  return n;
}

function attributes(e) {
  const t = [];
  for (const [n, s] of Object.entries(e)) {
    addAttribute(t, n, s);
  }
  return t;
}

function addAttribute(e, t, n) {
  const s = anyValue(n);
  if (s) {
    e.push({
      key: t,
      value: s
    });
  }
}

function anyValue(e) {
  if ("string" == typeof e) {
    return {
      stringValue: e
    };
  }
  if ("boolean" == typeof e) {
    return {
      boolValue: e
    };
  }
  if ("number" == typeof e) {
    if (!Number.isFinite(e)) {
      return null;
    }
    return Number.isInteger(e) ? {
      intValue: String(e)
    } : {
      doubleValue: e
    };
  }
  if (Array.isArray(e)) {
    const t = [];
    e.forEach(e => {
      const n = anyValue(e);
      if (n) {
        t.push(n);
      }
    });
    return {
      arrayValue: {
        values: t
      }
    };
  }
  if (e && "object" == typeof e) {
    return {
      kvlistValue: {
        values: attributes(e)
      }
    };
  }
  return null;
}

function createSpanId() {
  return a.randomBytes(8).toString("hex");
}

function unixNano(e) {
  return BigInt(Math.round(1e6 * e));
}

async function runExportCli(e) {
  if (parseHelp(e)) {
    !function printExportHelp() {
      process.stdout.write([ "Usage: 2g export [selector]", "", "Exports session events to Chrome Trace or OTLP JSON.", "(Without --tail it reads only the retained window. Rotated out logs may be lost)", "", "--tail attaches to an already-running session and follows live from that point.", "  Run it after the session is up and leave it attached while the workload runs.", "  It will automatically stop on 30s idle.", "To trace a full command instead, use `2g record`.", "", "Options:", "  selector                 Substring of PID, CWD, or command; a running", "                           session wins ties", "  --input <file>           Read JSONL events from a file", "  -o, --output <file>      Write output to a file", "  --format <format>        chrome-trace or opentelemetry", "  --json                   Print JSON output", "  --since <time>           Duration ago (5m, 90s), Unix time, or ISO date", "  --filter <pattern>       Event name prefix (whole segments), e.g. category,", "                           category:kind; * wildcards; comma-separated", "  --spans                  Keep only span events (log.span() pairs with a _d", "                           duration); omit to include point events too. A", '                           plain "ms" payload field is not a span', "  --debug                  Include debug-level events that were captured by a", "                           command run with LOG_DEBUG. Normal app traces do not", "                           need this", "  --tail                   Follow live events after replaying history; stops", "                           automatically on 30s idle", "  --timeout <duration>     Also stop tailing after this absolute duration", "" ].join("\n"));
    }();
    return;
  }
  const i = function parseExportOptions(e) {
    const s = t.parseArgs({
      args: e,
      allowPositionals: !0,
      options: {
        ...u,
        input: {
          type: "string"
        },
        output: {
          type: "string",
          short: "o"
        },
        format: {
          type: "string"
        },
        json: {
          type: "boolean"
        },
        timeout: {
          type: "string"
        },
        help: {
          type: "boolean",
          short: "h"
        }
      }
    });
    const o = parseSharedTapOptions(s.values);
    const r = function parseDuration(e) {
      if (null == e || "" === e) {
        return;
      }
      const t = n.parseDuration(e);
      if (null == t) {
        throw new Error(`Invalid duration: ${e}`);
      }
      return t;
    }(s.values.timeout);
    const i = s.values.format ?? "chrome-trace";
    if (!function isExportFormat$1(e) {
      return "chrome-trace" === e || "opentelemetry" === e;
    }(i)) {
      throw new Error(`Unsupported format: ${i}`);
    }
    if (s.positionals[0] && s.values.input) {
      throw new Error("Use either a session selector or --input, not both");
    }
    if (null != r && !o.follow) {
      throw new Error("Use --timeout only with --tail");
    }
    return {
      selector: s.positionals[0],
      inputFile: s.values.input,
      output: s.values.output,
      format: i,
      since: o.since,
      filter: o.filter,
      spans: o.spans,
      debug: o.debug,
      follow: o.follow,
      timeout: r,
      idleTimeout: 3e4,
      json: s.values.json ?? !1
    };
  }(e);
  if (i.json) {
    s.redirectConsoleToStderr();
  }
  let a;
  let l;
  let c;
  let p;
  if (i.selector) {
    const e = await r.resolveSession(i.selector);
    l = e.command;
    c = e.pid;
    p = e.metadata.version;
    await warnOnRotationLoss(e.sessionDir, "2g export --tail");
    a = r.tap(e.sessionDir, {
      follow: i.follow,
      debug: !0,
      timeout: i.timeout,
      idleTimeout: i.follow ? i.idleTimeout : void 0
    });
  } else if (i.inputFile) {
    a = async function* readJsonlFile(e) {
      yield* readJsonlStream(o.createReadStream(e, {
        encoding: "utf8"
      }));
    }(i.inputFile);
  } else {
    a = async function* readJsonlStdin() {
      yield* readJsonlStream(process.stdin);
    }();
  }
  const d = {
    ...i,
    pid: c,
    command: l,
    version: p
  };
  const m = "opentelemetry" === i.format ? await convertToOpenTelemetry(a, d) : await convertToChromeTrace(a, d);
  const f = JSON.stringify(m, null, 2);
  if (i.output) {
    o.writeFileSync(i.output, `${f}\n`);
  } else {
    process.stdout.write(`${f}\n`);
  }
}

function escapeTsv(e) {
  return String(e).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

async function runRecordCli(e) {
  if (parseHelp(e)) {
    !function printRecordHelp() {
      process.stdout.write([ "Usage: 2g record [options] -- <command> [args...]", "", "Runs <command>, traces the events it emits, and writes the trace on exit.", "", "This is the reliable way to capture a one-off run (a build, a script): 2g", "owns the process, so the trace is complete end-to-end with no window to", "attach within and nothing to rotate out. To trace an already-running server", "instead, use `2g export <selector> --tail`.", "", "Options:", "  -o, --output <file>      Write the trace to a file (default: stdout)", "  --format <format>        chrome-trace or opentelemetry", "  --json                   Print JSON output", "  --filter <pattern>       Event name prefix (whole segments), e.g. category,", "                           category:kind; * wildcards; comma-separated", "  --spans                  Keep only span events (log.span() pairs with a _d", "                           duration); omit to include point events too", "  --debug                  Enable and export debug events; no LOG_DEBUG needed", "", "If you are validating instrumentation or looking for debug-level events,", "pass --debug, for example:", "  2g record --debug -o trace.json -- <command>", "Normal app traces do not need this.", "", "For raw JSONL debug output, use LOG_EVENTS=<file> directly instead of this command.", "", "Example:", "  2g record -o trace.json -- expo export   # run & trace a build end-to-end", "" ].join("\n"));
    }();
    return 0;
  }
  const n = e.indexOf("--");
  const i = -1 === n ? e : e.slice(0, n);
  const a = -1 === n ? [] : e.slice(n + 1);
  const p = function parseRecordOptions(e) {
    const n = t.parseArgs({
      args: e,
      allowPositionals: !0,
      options: {
        filter: {
          type: "string",
          multiple: !0
        },
        spans: {
          type: "boolean"
        },
        debug: {
          type: "boolean"
        },
        output: {
          type: "string",
          short: "o"
        },
        format: {
          type: "string"
        },
        json: {
          type: "boolean"
        },
        help: {
          type: "boolean",
          short: "h"
        }
      }
    });
    const s = n.values.format ?? "chrome-trace";
    if (!function isExportFormat(e) {
      return "chrome-trace" === e || "opentelemetry" === e;
    }(s)) {
      throw new Error(`Unsupported format: ${s}`);
    }
    return {
      output: n.values.output,
      format: s,
      filter: n.values.filter?.flatMap(e => e.split(",")).map(e => e.trim()).filter(Boolean),
      spans: !0 === n.values.spans,
      debug: !0 === n.values.debug,
      json: n.values.json ?? !1
    };
  }(i);
  if (!a.length) {
    throw new Error("record needs a command to run: 2g record [options] -- <command> [args...]");
  }
  if (p.json) {
    s.redirectConsoleToStderr();
  }
  const u = r.captureEvents({
    debug: p.debug
  });
  const d = l.spawn(a[0], a.slice(1), u.spawnOptions({
    env: process.env,
    stdio: [ "inherit", p.output ? "inherit" : 2, "inherit" ]
  }));
  u.attach(d);
  const onSignal = e => {
    if ("SIGINT" !== e) {
      try {
        d.kill(e);
      } catch {}
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const m = new Promise((e, t) => {
    d.on("exit", (t, n) => e(t ?? (n ? 128 + c.constants.signals[n] : 1)));
    d.on("error", e => t(new Error(`Failed to run ${a[0]}: ${e.message}`)));
  });
  const f = {
    ...p,
    pid: d.pid,
    processName: a.join(" ")
  };
  try {
    const e = "opentelemetry" === p.format ? await convertToOpenTelemetry(u, f) : await convertToChromeTrace(u, f);
    const t = await m;
    const n = JSON.stringify(e, null, 2);
    if (p.output) {
      o.writeFileSync(p.output, `${n}\n`);
    } else {
      process.stdout.write(`${n}\n`);
    }
    return t;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

async function runTapCli(e) {
  if (parseHelp(e)) {
    !function printTapHelp() {
      process.stdout.write([ "Usage: 2g tap [selector]", "", "Replays retained session history as JSONL, oldest first.", "", "Options:", "  selector                 Substring of PID, CWD, or command; a running", "                           session wins ties", "  --since <time>           Duration ago (5m, 90s), Unix time, or ISO date", "  --filter <pattern>       Event name prefix (whole segments), e.g. category,", "                           category:kind; * wildcards; comma-separated", "  --spans                  Keep only span events (log.span() pairs with a _d", "                           duration); omit to include point events too. A", '                           plain "ms" payload field is not a span', "  --debug                  Include debug events (only recorded when the", "                           command ran with LOG_DEBUG set)", "  --format pretty          Print a readable line per event", "  --tail                   Follow live events after replaying history; runs", "                           until killed (use export with a timeout for a", "                           bounded follow)", "" ].join("\n"));
    }();
    return;
  }
  const n = function parseTapOptions(e) {
    const n = t.parseArgs({
      args: e,
      allowPositionals: !0,
      options: {
        ...u,
        format: {
          type: "string"
        },
        json: {
          type: "boolean"
        },
        help: {
          type: "boolean",
          short: "h"
        }
      }
    });
    const s = parseSharedTapOptions(n.values);
    if (n.values.json && "pretty" === n.values.format) {
      throw new Error("Use either --json or --format pretty, not both");
    }
    return {
      selector: n.positionals[0],
      since: s.since,
      follow: s.follow,
      filter: s.filter,
      spans: s.spans,
      debug: s.debug,
      json: n.values.json ?? !1,
      pretty: n.values.json ? !1 : "pretty" === n.values.format
    };
  }(e);
  if (n.json) {
    s.redirectConsoleToStderr();
  }
  const o = await r.resolveSession(n.selector);
  await warnOnRotationLoss(o.sessionDir, "2g tap --tail");
  const i = s.shouldColorizeStream(process.stdout);
  for await (const e of r.tap(o.sessionDir, n)) {
    if (n.pretty) {
      process.stdout.write(`${s.formatPrettyEvent(e, {
        colorize: i,
        stream: process.stdout
      })}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(e)}\n`);
    }
  }
}

async function main(e = process.argv.slice(2)) {
  const [n, ...o] = e;
  if (!n || "--help" === n || "-h" === n || "help" === n) {
    !function printHelp() {
      process.stdout.write([ "Usage: 2g <command>", "", "Reads structured JSONL event logs that instrumented CLIs record during runs", "into the system temp dir, with no setup: run a command, then tap it here.", "", "Commands:", "  ps [selector]                 List recorded sessions", "    --active, -a (running only)  --json", "", "  tap [selector]                Replay session events as JSONL, oldest first", "    --since <time>  --filter <pattern>  --spans  --debug  --format pretty", "    --tail (follow live events after replay; runs until killed)", "", "  record -- <command>          Run a command, trace it end-to-end, write on exit", "    -o, --output <file>  --format chrome-trace|opentelemetry  --json", "    --filter <pattern>  --spans  --debug", "", "  export [selector]             Export a past or live (--tail) session", "    --input <jsonl-file>  -o, --output <file>  --json", "    --format chrome-trace|opentelemetry", "    --since <time>  --filter <pattern>  --spans  --debug", "    --tail  --timeout <duration> (absolute; tail also stops after 30s idle)", "", "  typegen                       List every event name/payload a project can emit", "    -p, --project <tsconfig>  -o, --output <file>  --format dts|json  --json", "", "  clean                         Remove stale sessions", "    --all, -a (remove all exited sessions)  --json", "", "Typical use:", "  2g ps -a                                         # what is running now?", '  2g tap "expo start" --tail                       # follow live events', '  2g tap "expo start" --since 5m --format pretty   # recent history, readable', '  2g tap "expo start" --filter metro:bundling      # narrow to one area', "", "Trace a run to a flame chart:", "  2g record -o trace.json -- expo export           # run & trace a build", '  2g export "expo start" --tail -o trace.json      # attach to a running server', '  2g export "expo start" -o trace.json             # after the fact (partial)', "", "Selectors match sessions by substring of PID, CWD, or command. If several", "match, and exactly one of them is running, it is chosen; otherwise 2g errors", "and lists the candidates.", "", "--filter takes comma-separated event-name prefixes matched on whole", 'segments: "category" and "category:kind" both match "category:kind:test";', "* matches anything. Discover names by tapping unfiltered or via typegen.", "", "--since accepts a duration ago (5m, 90s, 1h30m), Unix time, or ISO date.", '--spans keeps only span events (log.span() pairs with a "_d" duration in', "ms); without it, point events are included alongside spans.", "", 'Events are single JSON lines: {"_e":"category:kind","_t":<epoch ms>,...}.', '"_d" is a span duration, "_w" a worker id; debug events need --debug.', "", "Set LOG_EVENTS=<file|fd> on an instrumented command to redirect its events.", "Debug events are only recorded when the command runs with LOG_DEBUG set.", "", "Pass LOG_DEBUG=<filter> when debugging; it also mirrors matching events to", "stderr. Reading them back needs --debug.", "", "Run 2g <command> --help for per-command help.", "" ].join("\n"));
    }();
    return 0;
  }
  switch (n) {
   case "typegen":
    {
      const {runTypegenCli: e} = await Promise.resolve().then(function() {
        return require("./index-chunk.js");
      });
      e(o);
      return 0;
    }

   case "ps":
    if (parseHelp(o)) {
      !function printPsHelp() {
        process.stdout.write([ "Usage: 2g ps [selector]", "", "Lists recorded sessions, newest first; alive means still running.", "", "Options:", "  selector                Substring of PID, CWD, or command", "  --active, -a            Show only active sessions", "  --json                  Print sessions as JSON", "" ].join("\n"));
      }();
      return 0;
    }
    await async function runPsCli(e = []) {
      const n = t.parseArgs({
        args: e,
        allowPositionals: !0,
        options: {
          active: {
            type: "boolean",
            short: "a"
          },
          json: {
            type: "boolean"
          },
          help: {
            type: "boolean",
            short: "h"
          }
        }
      });
      if (n.values.json) {
        s.redirectConsoleToStderr();
      }
      const o = (await r.listSessions({
        selector: n.positionals[0]
      })).filter(e => !n.values.active || e.alive);
      if (n.values.json) {
        process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
        return;
      }
      process.stdout.write("PID\tSTATUS\tSTARTED\tCOMMAND\tCWD\tMETADATA\n");
      for (const e of o) {
        process.stdout.write(`${escapeTsv(e.pid)}\t${escapeTsv(e.alive ? "alive" : "exited")}\t${escapeTsv(new Date(e.startedAt).toISOString())}\t${escapeTsv(e.command)}\t${escapeTsv(e.cwd)}\t${JSON.stringify(e.metadata)}\n`);
      }
    }(o);
    return 0;

   case "tap":
    await runTapCli(o);
    return 0;

   case "clean":
    if (parseHelp(o)) {
      !function printCleanHelp() {
        process.stdout.write([ "Usage: 2g clean", "", "Removes stale exited sessions past the retention window.", "", "Options:", "  --all, -a              Remove all exited sessions", "  --json", "" ].join("\n"));
      }();
      return 0;
    }
    runCleanCli(o);
    return 0;

   case "record":
    return runRecordCli(o);

   case "export":
    await runExportCli(o);
    return 0;

   default:
    throw new Error(`Unknown command: ${n}`);
  }
}

if (function isCliEntrypoint() {
  try {
    return process.argv[1] === e.fileURLToPath("undefined" == typeof document ? require("url").pathToFileURL(__filename).href : p && "SCRIPT" === p.tagName.toUpperCase() && p.src || new URL("dist/chunks/cli-chunk.js", document.baseURI).href);
  } catch {
    return !1;
  }
}()) {
  main().then(e => {
    process.exitCode = e;
  }).catch(e => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}

exports.main = main;

exports.parseHelp = parseHelp;
//# sourceMappingURL=cli-chunk.js.map
