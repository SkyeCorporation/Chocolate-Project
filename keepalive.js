const http = require("http");
const https = require("https");

const REPLIT_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : null;

const PING_INTERVAL_MS = 25 * 1000;
const PING_TIMEOUT_MS  = 8000;
const RETRY_DELAY_MS   = 3000;
const MAX_RETRIES      = 2;

const START_TIME = Date.now();

const targets = [
  "http://localhost:8976",
  "http://localhost:8977",
  "http://localhost:8978",
  "http://localhost:9000/ping",
];
if (REPLIT_URL) targets.unshift(REPLIT_URL);

const stats = {};
for (const t of targets) {
  stats[t] = { success: 0, fail: 0, lastStatus: null, lastPingAt: null, lastMs: null };
}

function pingOnce(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const lib   = url.startsWith("https") ? https : http;
    const req   = lib.get(url, { timeout: PING_TIMEOUT_MS }, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode, ms: Date.now() - start });
    });
    req.on("error",   (err) => resolve({ ok: false, error: err.message, ms: Date.now() - start }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout", ms: PING_TIMEOUT_MS }); });
  });
}

async function pingWithRetry(url) {
  let last;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    last = await pingOnce(url);
    if (last.ok) break;
  }
  const s = stats[url];
  s.lastPingAt = new Date().toISOString();
  s.lastMs     = last.ms;
  if (last.ok) {
    s.success++;
    s.lastStatus = last.status;
    console.log(`[KeepAlive] ✓ ${url} → ${last.status} (${last.ms}ms)`);
  } else {
    s.fail++;
    s.lastStatus = null;
    console.log(`[KeepAlive] ✗ ${url} → ${last.error} (${last.ms}ms)`);
  }
}

async function doPing() {
  await Promise.all(targets.map(t => pingWithRetry(t)));
}

function uptimeSeconds() {
  return Math.floor((Date.now() - START_TIME) / 1000);
}

const server = http.createServer((req, res) => {
  if (req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("pong");
    return;
  }

  const uptimeSec = uptimeSeconds();
  const d = Math.floor(uptimeSec / 86400);
  const h = Math.floor((uptimeSec % 86400) / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = uptimeSec % 60;

  const totalSuccess = Object.values(stats).reduce((a, v) => a + v.success, 0);
  const totalFail    = Object.values(stats).reduce((a, v) => a + v.fail, 0);
  const total        = totalSuccess + totalFail;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status:    "alive",
    startedAt: new Date(START_TIME).toISOString(),
    uptimeSec,
    uptimeHuman: `${d}d ${h}h ${m}m ${s}s`,
    pingIntervalSec: PING_INTERVAL_MS / 1000,
    pingStats: {
      totalCycles: Math.max(totalSuccess, totalFail) > 0 ? Math.ceil(total / targets.length) : 0,
      totalSuccess,
      totalFail,
      successRate: total > 0 ? ((totalSuccess / total) * 100).toFixed(1) + "%" : "—",
    },
    targets: Object.fromEntries(
      Object.entries(stats).map(([url, v]) => [url, {
        success: v.success,
        fail: v.fail,
        lastStatus: v.lastStatus,
        lastPingAt: v.lastPingAt,
        lastMs: v.lastMs,
      }])
    ),
  }));
});

server.listen(9000, "0.0.0.0", () => {
  console.log(`[KeepAlive] Server listening on port 9000`);
  console.log(`[KeepAlive] Ping interval: ${PING_INTERVAL_MS / 1000}s | Targets: ${targets.length}`);
  console.log(`[KeepAlive] Targets: ${targets.join(", ")}`);
});

doPing();
setInterval(doPing, PING_INTERVAL_MS);
