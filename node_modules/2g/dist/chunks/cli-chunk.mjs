import { fileURLToPath as t } from "node:url";

import { parseArgs as e } from "node:util";

import { c as n, a as o, p as s, b as r, d as i, e as a, m as l } from "./clean-chunk.mjs";

import { r as c, s as p, f as u } from "./pretty-chunk.mjs";

import d from "node:fs";

import { d as m, r as f, t as h, l as g, c as y } from "./api-chunk.mjs";

import { createInterface as v } from "node:readline";

import w from "node:crypto";

import { spawn as b } from "node:child_process";

import { constants as x } from "node:os";

function runCleanCli(t = []) {
  const s = function parseCleanOptions(t) {
    const n = e({
      args: t,
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
  }(t);
  if (s.json) {
    c();
  }
  const r = s.all ? n() : o();
  process.stdout.write(s.json ? `${JSON.stringify({
    removed: r
  })}\n` : `Removed ${r} ${s.all ? "exited" : "stale"} sessions.\n`);
}

const S = {
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

async function warnOnRotationLoss(t, e) {
  if (!await m(t)) {
    return;
  }
  console.warn(`⚠ Earlier events were rotated out of the retained window.\n  For a complete trace, start \`${e}\` before the workload.`);
}

async function* readJsonlStream(t) {
  const e = v({
    input: t
  });
  for await (const t of e) {
    if (!t) {
      continue;
    }
    const e = r(t, {
      debug: !0
    });
    if (e) {
      yield e;
    }
  }
}

function parseSharedTapOptions(t) {
  return {
    since: t.since,
    filter: t.filter?.flatMap(t => t.split(",")).map(t => t.trim()).filter(Boolean),
    spans: !0 === t.spans,
    debug: !0 === t.debug,
    follow: !0 === t.tail
  };
}

function parseHelp(t) {
  return !0 === e({
    args: t,
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
  #t;
  #e;
  constructor(t) {
    this.options = t;
    this.version = t.version;
    this.#t = i(t.filter);
    this.#e = {
      ...t,
      since: a(t.since)
    };
  }
  get processName() {
    if (null != this.options.processName) {
      return this.options.processName;
    }
    const t = this.version;
    if (null != this.options.command) {
      return `${this.options.command} (${t ? `v${t}, ` : ""}PID ${this.options.pid})`;
    }
    return t ? `2g (v${t})` : "2g";
  }
  read(t) {
    if (!t._w && ("root:init" === t._e || "root:update" === t._e) && "string" == typeof t.version) {
      this.version = t.version;
    }
    if (!l(t, this.#e, this.#t)) {
      return;
    }
    if ("root:init" === t._e) {
      return {
        ...t,
        _e: "root:update"
      };
    }
    return t;
  }
}

const T = [ ":started", ":done", ":failed" ];

function splitEventName(t) {
  const e = t.indexOf(":");
  if (e < 1) {
    return null;
  }
  return {
    category: t.slice(0, e),
    name: t.slice(e + 1)
  };
}

function stripSuffix(t) {
  for (const e of T) {
    if (t.endsWith(e)) {
      return t.slice(0, -e.length);
    }
  }
  return t;
}

async function convertToChromeTrace(t, e = {}) {
  const n = new TraceConverter(e);
  for await (const e of t) {
    n.add(e);
  }
  return n.toTraceFile();
}

class TraceConverter {
  #n=[];
  #o=new Map;
  #s;
  #r;
  constructor(t = {}) {
    this.#s = t.pid ?? 1;
    this.#r = new ExportContext(t);
  }
  add(t) {
    const e = this.#r.read(t);
    if (!e) {
      return;
    }
    const n = splitEventName(e._e) ?? {
      category: "uncategorized",
      name: e._e
    };
    const o = this.#i(n.category, "string" == typeof e._w ? e._w : void 0);
    const s = function extractArgs(t) {
      const e = {};
      for (const n of Object.keys(t)) {
        if (n.startsWith("_")) {
          continue;
        }
        e[n] = t[n];
      }
      return Object.keys(e).length ? e : void 0;
    }(e);
    if ("number" == typeof e._d) {
      const t = {
        kind: "span",
        track: o,
        name: stripSuffix(n.name),
        cat: n.category,
        ts: Math.round(1e3 * (e._t - e._d)),
        dur: Math.round(1e3 * e._d),
        args: s,
        lane: 0
      };
      o.spans.push(t);
      this.#n.push(t);
    } else {
      this.#n.push({
        kind: "instant",
        track: o,
        name: stripSuffix(n.name),
        cat: n.category,
        ts: Math.round(1e3 * e._t),
        args: s
      });
    }
  }
  toTraceFile() {
    let t = this.#n.length ? 1 / 0 : 0;
    for (const e of this.#n) {
      if (e.ts < t) {
        t = e.ts;
      }
    }
    const e = [ {
      ph: "M",
      name: "process_name",
      pid: this.#s,
      args: {
        name: this.#r.processName
      }
    } ];
    let n = 1;
    for (const t of this.#o.values()) {
      const o = Math.max(assignLanes(t.spans), 1);
      t.tid = n;
      for (let s = 0; s < o; s++) {
        const o = n++;
        e.push({
          ph: "M",
          name: "thread_name",
          pid: this.#s,
          tid: o,
          args: {
            name: 0 === s ? t.name : `${t.name} #${s + 1}`
          }
        }, {
          ph: "M",
          name: "thread_sort_index",
          pid: this.#s,
          tid: o,
          args: {
            sort_index: o
          }
        });
      }
    }
    for (const n of this.#n) {
      const o = n.track.tid + ("span" === n.kind ? n.lane : 0);
      if ("span" === n.kind) {
        e.push({
          ph: "X",
          name: n.name,
          cat: n.cat,
          pid: this.#s,
          tid: o,
          ts: n.ts - t,
          dur: n.dur,
          args: n.args
        });
      } else {
        e.push({
          ph: "i",
          name: n.name,
          cat: n.cat,
          pid: this.#s,
          tid: o,
          ts: n.ts - t,
          s: "t",
          args: n.args
        });
      }
    }
    return {
      traceEvents: e,
      metadata: {
        source: "2g",
        version: this.#r.version,
        convertedAt: (new Date).toISOString(),
        startTime: new Date(t / 1e3).toISOString(),
        startTimestampMs: t / 1e3
      }
    };
  }
  #i(t, e) {
    const n = e ? `${t}:${e}` : t;
    let o = this.#o.get(n);
    if (!o) {
      o = {
        name: e ? `${t} ${e}` : t,
        spans: [],
        tid: 0
      };
      this.#o.set(n, o);
    }
    return o;
  }
}

function assignLanes(t) {
  t.sort((t, e) => t.ts - e.ts || e.ts + e.dur - (t.ts + t.dur));
  const e = [];
  for (const n of t) {
    const t = n.ts + n.dur;
    let o = -1;
    for (let s = 0; s < e.length; s++) {
      const r = e[s];
      while (r.length && r[r.length - 1].ts + r[r.length - 1].dur <= n.ts) {
        r.pop();
      }
      const i = r[r.length - 1];
      if (!i || i.ts + i.dur >= t) {
        r.push(n);
        o = s;
        break;
      }
    }
    if (o < 0) {
      e.push([ n ]);
      o = e.length - 1;
    }
    n.lane = o;
  }
  return e.length;
}

async function convertToOpenTelemetry(t, e = {}) {
  const n = new OpenTelemetryConverter(e);
  for await (const e of t) {
    n.add(e);
  }
  return n.toFile();
}

class OpenTelemetryConverter {
  #a=w.randomBytes(16).toString("hex");
  #l=createSpanId();
  #c=[];
  #p=[];
  #r;
  #u;
  #d;
  constructor(t) {
    this.options = t;
    this.#r = new ExportContext(t);
  }
  add(t) {
    const e = this.#r.read(t);
    if (!e) {
      return;
    }
    const n = unixNano(e._t);
    const o = "number" == typeof e._d ? unixNano(e._t - e._d) : n;
    this.#u = null == this.#u || o < this.#u ? o : this.#u;
    this.#d = null == this.#d || n > this.#d ? n : this.#d;
    if ("number" == typeof e._d) {
      this.#c.push(this.#m(e, o, n));
    } else {
      this.#p.push(this.#f(e, n));
    }
  }
  toFile() {
    const t = this.#u ?? unixNano(Date.now());
    const e = this.#d ?? t;
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
            startTimeUnixNano: String(t),
            endTimeUnixNano: String(e),
            attributes: attributes({
              "event_log.kind": "session"
            }),
            events: this.#p.length ? this.#p : void 0
          }, ...this.#c ]
        } ]
      } ]
    };
  }
  #m(t, e, n) {
    const o = splitEventName(t._e);
    return {
      traceId: this.#a,
      spanId: createSpanId(),
      parentSpanId: this.#l,
      name: o ? stripSuffix(o.name) : t._e,
      startTimeUnixNano: String(e),
      endTimeUnixNano: String(n),
      attributes: eventAttributes(t, o)
    };
  }
  #f(t, e) {
    const n = splitEventName(t._e);
    return {
      timeUnixNano: String(e),
      name: n ? stripSuffix(n.name) : t._e,
      attributes: eventAttributes(t, n)
    };
  }
}

function eventAttributes(t, e) {
  const n = [];
  addAttribute(n, "event.name", t._e);
  if (e) {
    addAttribute(n, "event.category", e.category);
    addAttribute(n, "event.action", e.name);
  }
  if ("string" == typeof t._w) {
    addAttribute(n, "event.worker.id", t._w);
  }
  for (const e of Object.keys(t)) {
    if ("_e" === e || "_t" === e || "_d" === e || "_l" === e || "_w" === e) {
      continue;
    }
    addAttribute(n, `event_log.${e}`, t[e]);
  }
  return n;
}

function attributes(t) {
  const e = [];
  for (const [n, o] of Object.entries(t)) {
    addAttribute(e, n, o);
  }
  return e;
}

function addAttribute(t, e, n) {
  const o = anyValue(n);
  if (o) {
    t.push({
      key: e,
      value: o
    });
  }
}

function anyValue(t) {
  if ("string" == typeof t) {
    return {
      stringValue: t
    };
  }
  if ("boolean" == typeof t) {
    return {
      boolValue: t
    };
  }
  if ("number" == typeof t) {
    if (!Number.isFinite(t)) {
      return null;
    }
    return Number.isInteger(t) ? {
      intValue: String(t)
    } : {
      doubleValue: t
    };
  }
  if (Array.isArray(t)) {
    const e = [];
    t.forEach(t => {
      const n = anyValue(t);
      if (n) {
        e.push(n);
      }
    });
    return {
      arrayValue: {
        values: e
      }
    };
  }
  if (t && "object" == typeof t) {
    return {
      kvlistValue: {
        values: attributes(t)
      }
    };
  }
  return null;
}

function createSpanId() {
  return w.randomBytes(8).toString("hex");
}

function unixNano(t) {
  return BigInt(Math.round(1e6 * t));
}

async function runExportCli(t) {
  if (parseHelp(t)) {
    !function printExportHelp() {
      process.stdout.write([ "Usage: 2g export [selector]", "", "Exports session events to Chrome Trace or OTLP JSON.", "(Without --tail it reads only the retained window. Rotated out logs may be lost)", "", "--tail attaches to an already-running session and follows live from that point.", "  Run it after the session is up and leave it attached while the workload runs.", "  It will automatically stop on 30s idle.", "To trace a full command instead, use `2g record`.", "", "Options:", "  selector                 Substring of PID, CWD, or command; a running", "                           session wins ties", "  --input <file>           Read JSONL events from a file", "  -o, --output <file>      Write output to a file", "  --format <format>        chrome-trace or opentelemetry", "  --json                   Print JSON output", "  --since <time>           Duration ago (5m, 90s), Unix time, or ISO date", "  --filter <pattern>       Event name prefix (whole segments), e.g. category,", "                           category:kind; * wildcards; comma-separated", "  --spans                  Keep only span events (log.span() pairs with a _d", "                           duration); omit to include point events too. A", '                           plain "ms" payload field is not a span', "  --debug                  Include debug-level events that were captured by a", "                           command run with LOG_DEBUG. Normal app traces do not", "                           need this", "  --tail                   Follow live events after replaying history; stops", "                           automatically on 30s idle", "  --timeout <duration>     Also stop tailing after this absolute duration", "" ].join("\n"));
    }();
    return;
  }
  const n = function parseExportOptions(t) {
    const n = e({
      args: t,
      allowPositionals: !0,
      options: {
        ...S,
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
    const o = parseSharedTapOptions(n.values);
    const r = function parseDuration(t) {
      if (null == t || "" === t) {
        return;
      }
      const e = s(t);
      if (null == e) {
        throw new Error(`Invalid duration: ${t}`);
      }
      return e;
    }(n.values.timeout);
    const i = n.values.format ?? "chrome-trace";
    if (!function isExportFormat$1(t) {
      return "chrome-trace" === t || "opentelemetry" === t;
    }(i)) {
      throw new Error(`Unsupported format: ${i}`);
    }
    if (n.positionals[0] && n.values.input) {
      throw new Error("Use either a session selector or --input, not both");
    }
    if (null != r && !o.follow) {
      throw new Error("Use --timeout only with --tail");
    }
    return {
      selector: n.positionals[0],
      inputFile: n.values.input,
      output: n.values.output,
      format: i,
      since: o.since,
      filter: o.filter,
      spans: o.spans,
      debug: o.debug,
      follow: o.follow,
      timeout: r,
      idleTimeout: 3e4,
      json: n.values.json ?? !1
    };
  }(t);
  if (n.json) {
    c();
  }
  let o;
  let r;
  let i;
  let a;
  if (n.selector) {
    const t = await f(n.selector);
    r = t.command;
    i = t.pid;
    a = t.metadata.version;
    await warnOnRotationLoss(t.sessionDir, "2g export --tail");
    o = h(t.sessionDir, {
      follow: n.follow,
      debug: !0,
      timeout: n.timeout,
      idleTimeout: n.follow ? n.idleTimeout : void 0
    });
  } else if (n.inputFile) {
    o = async function* readJsonlFile(t) {
      yield* readJsonlStream(d.createReadStream(t, {
        encoding: "utf8"
      }));
    }(n.inputFile);
  } else {
    o = async function* readJsonlStdin() {
      yield* readJsonlStream(process.stdin);
    }();
  }
  const l = {
    ...n,
    pid: i,
    command: r,
    version: a
  };
  const p = "opentelemetry" === n.format ? await convertToOpenTelemetry(o, l) : await convertToChromeTrace(o, l);
  const u = JSON.stringify(p, null, 2);
  if (n.output) {
    d.writeFileSync(n.output, `${u}\n`);
  } else {
    process.stdout.write(`${u}\n`);
  }
}

function escapeTsv(t) {
  return String(t).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

async function runRecordCli(t) {
  if (parseHelp(t)) {
    !function printRecordHelp() {
      process.stdout.write([ "Usage: 2g record [options] -- <command> [args...]", "", "Runs <command>, traces the events it emits, and writes the trace on exit.", "", "This is the reliable way to capture a one-off run (a build, a script): 2g", "owns the process, so the trace is complete end-to-end with no window to", "attach within and nothing to rotate out. To trace an already-running server", "instead, use `2g export <selector> --tail`.", "", "Options:", "  -o, --output <file>      Write the trace to a file (default: stdout)", "  --format <format>        chrome-trace or opentelemetry", "  --json                   Print JSON output", "  --filter <pattern>       Event name prefix (whole segments), e.g. category,", "                           category:kind; * wildcards; comma-separated", "  --spans                  Keep only span events (log.span() pairs with a _d", "                           duration); omit to include point events too", "  --debug                  Enable and export debug events; no LOG_DEBUG needed", "", "If you are validating instrumentation or looking for debug-level events,", "pass --debug, for example:", "  2g record --debug -o trace.json -- <command>", "Normal app traces do not need this.", "", "For raw JSONL debug output, use LOG_EVENTS=<file> directly instead of this command.", "", "Example:", "  2g record -o trace.json -- expo export   # run & trace a build end-to-end", "" ].join("\n"));
    }();
    return 0;
  }
  const n = t.indexOf("--");
  const o = -1 === n ? t : t.slice(0, n);
  const s = -1 === n ? [] : t.slice(n + 1);
  const r = function parseRecordOptions(t) {
    const n = e({
      args: t,
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
    const o = n.values.format ?? "chrome-trace";
    if (!function isExportFormat(t) {
      return "chrome-trace" === t || "opentelemetry" === t;
    }(o)) {
      throw new Error(`Unsupported format: ${o}`);
    }
    return {
      output: n.values.output,
      format: o,
      filter: n.values.filter?.flatMap(t => t.split(",")).map(t => t.trim()).filter(Boolean),
      spans: !0 === n.values.spans,
      debug: !0 === n.values.debug,
      json: n.values.json ?? !1
    };
  }(o);
  if (!s.length) {
    throw new Error("record needs a command to run: 2g record [options] -- <command> [args...]");
  }
  if (r.json) {
    c();
  }
  const i = y({
    debug: r.debug
  });
  const a = b(s[0], s.slice(1), i.spawnOptions({
    env: process.env,
    stdio: [ "inherit", r.output ? "inherit" : 2, "inherit" ]
  }));
  i.attach(a);
  const onSignal = t => {
    if ("SIGINT" !== t) {
      try {
        a.kill(t);
      } catch {}
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const l = new Promise((t, e) => {
    a.on("exit", (e, n) => t(e ?? (n ? 128 + x.signals[n] : 1)));
    a.on("error", t => e(new Error(`Failed to run ${s[0]}: ${t.message}`)));
  });
  const p = {
    ...r,
    pid: a.pid,
    processName: s.join(" ")
  };
  try {
    const t = "opentelemetry" === r.format ? await convertToOpenTelemetry(i, p) : await convertToChromeTrace(i, p);
    const e = await l;
    const n = JSON.stringify(t, null, 2);
    if (r.output) {
      d.writeFileSync(r.output, `${n}\n`);
    } else {
      process.stdout.write(`${n}\n`);
    }
    return e;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

async function runTapCli(t) {
  if (parseHelp(t)) {
    !function printTapHelp() {
      process.stdout.write([ "Usage: 2g tap [selector]", "", "Replays retained session history as JSONL, oldest first.", "", "Options:", "  selector                 Substring of PID, CWD, or command; a running", "                           session wins ties", "  --since <time>           Duration ago (5m, 90s), Unix time, or ISO date", "  --filter <pattern>       Event name prefix (whole segments), e.g. category,", "                           category:kind; * wildcards; comma-separated", "  --spans                  Keep only span events (log.span() pairs with a _d", "                           duration); omit to include point events too. A", '                           plain "ms" payload field is not a span', "  --debug                  Include debug events (only recorded when the", "                           command ran with LOG_DEBUG set)", "  --format pretty          Print a readable line per event", "  --tail                   Follow live events after replaying history; runs", "                           until killed (use export with a timeout for a", "                           bounded follow)", "" ].join("\n"));
    }();
    return;
  }
  const n = function parseTapOptions(t) {
    const n = e({
      args: t,
      allowPositionals: !0,
      options: {
        ...S,
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
    const o = parseSharedTapOptions(n.values);
    if (n.values.json && "pretty" === n.values.format) {
      throw new Error("Use either --json or --format pretty, not both");
    }
    return {
      selector: n.positionals[0],
      since: o.since,
      follow: o.follow,
      filter: o.filter,
      spans: o.spans,
      debug: o.debug,
      json: n.values.json ?? !1,
      pretty: n.values.json ? !1 : "pretty" === n.values.format
    };
  }(t);
  if (n.json) {
    c();
  }
  const o = await f(n.selector);
  await warnOnRotationLoss(o.sessionDir, "2g tap --tail");
  const s = p(process.stdout);
  for await (const t of h(o.sessionDir, n)) {
    if (n.pretty) {
      process.stdout.write(`${u(t, {
        colorize: s,
        stream: process.stdout
      })}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(t)}\n`);
    }
  }
}

async function main(t = process.argv.slice(2)) {
  const [n, ...o] = t;
  if (!n || "--help" === n || "-h" === n || "help" === n) {
    !function printHelp() {
      process.stdout.write([ "Usage: 2g <command>", "", "Reads structured JSONL event logs that instrumented CLIs record during runs", "into the system temp dir, with no setup: run a command, then tap it here.", "", "Commands:", "  ps [selector]                 List recorded sessions", "    --active, -a (running only)  --json", "", "  tap [selector]                Replay session events as JSONL, oldest first", "    --since <time>  --filter <pattern>  --spans  --debug  --format pretty", "    --tail (follow live events after replay; runs until killed)", "", "  record -- <command>          Run a command, trace it end-to-end, write on exit", "    -o, --output <file>  --format chrome-trace|opentelemetry  --json", "    --filter <pattern>  --spans  --debug", "", "  export [selector]             Export a past or live (--tail) session", "    --input <jsonl-file>  -o, --output <file>  --json", "    --format chrome-trace|opentelemetry", "    --since <time>  --filter <pattern>  --spans  --debug", "    --tail  --timeout <duration> (absolute; tail also stops after 30s idle)", "", "  typegen                       List every event name/payload a project can emit", "    -p, --project <tsconfig>  -o, --output <file>  --format dts|json  --json", "", "  clean                         Remove stale sessions", "    --all, -a (remove all exited sessions)  --json", "", "Typical use:", "  2g ps -a                                         # what is running now?", '  2g tap "expo start" --tail                       # follow live events', '  2g tap "expo start" --since 5m --format pretty   # recent history, readable', '  2g tap "expo start" --filter metro:bundling      # narrow to one area', "", "Trace a run to a flame chart:", "  2g record -o trace.json -- expo export           # run & trace a build", '  2g export "expo start" --tail -o trace.json      # attach to a running server', '  2g export "expo start" -o trace.json             # after the fact (partial)', "", "Selectors match sessions by substring of PID, CWD, or command. If several", "match, and exactly one of them is running, it is chosen; otherwise 2g errors", "and lists the candidates.", "", "--filter takes comma-separated event-name prefixes matched on whole", 'segments: "category" and "category:kind" both match "category:kind:test";', "* matches anything. Discover names by tapping unfiltered or via typegen.", "", "--since accepts a duration ago (5m, 90s, 1h30m), Unix time, or ISO date.", '--spans keeps only span events (log.span() pairs with a "_d" duration in', "ms); without it, point events are included alongside spans.", "", 'Events are single JSON lines: {"_e":"category:kind","_t":<epoch ms>,...}.', '"_d" is a span duration, "_w" a worker id; debug events need --debug.', "", "Set LOG_EVENTS=<file|fd> on an instrumented command to redirect its events.", "Debug events are only recorded when the command runs with LOG_DEBUG set.", "", "Pass LOG_DEBUG=<filter> when debugging; it also mirrors matching events to", "stderr. Reading them back needs --debug.", "", "Run 2g <command> --help for per-command help.", "" ].join("\n"));
    }();
    return 0;
  }
  switch (n) {
   case "typegen":
    {
      const {runTypegenCli: t} = await import("./index-chunk.mjs");
      t(o);
      return 0;
    }

   case "ps":
    if (parseHelp(o)) {
      !function printPsHelp() {
        process.stdout.write([ "Usage: 2g ps [selector]", "", "Lists recorded sessions, newest first; alive means still running.", "", "Options:", "  selector                Substring of PID, CWD, or command", "  --active, -a            Show only active sessions", "  --json                  Print sessions as JSON", "" ].join("\n"));
      }();
      return 0;
    }
    await async function runPsCli(t = []) {
      const n = e({
        args: t,
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
        c();
      }
      const o = (await g({
        selector: n.positionals[0]
      })).filter(t => !n.values.active || t.alive);
      if (n.values.json) {
        process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
        return;
      }
      process.stdout.write("PID\tSTATUS\tSTARTED\tCOMMAND\tCWD\tMETADATA\n");
      for (const t of o) {
        process.stdout.write(`${escapeTsv(t.pid)}\t${escapeTsv(t.alive ? "alive" : "exited")}\t${escapeTsv(new Date(t.startedAt).toISOString())}\t${escapeTsv(t.command)}\t${escapeTsv(t.cwd)}\t${JSON.stringify(t.metadata)}\n`);
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
    return process.argv[1] === t(import.meta.url);
  } catch {
    return !1;
  }
}()) {
  main().then(t => {
    process.exitCode = t;
  }).catch(t => {
    process.stderr.write(`${t instanceof Error ? t.message : String(t)}\n`);
    process.exitCode = 1;
  });
}

export { main as m, parseHelp as p };
//# sourceMappingURL=cli-chunk.mjs.map
