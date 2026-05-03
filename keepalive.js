const http = require("http");
const https = require("https");

const REPLIT_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : null;

const PING_INTERVAL_MS = 4 * 60 * 1000;

function ping(url) {
  const lib = url.startsWith("https") ? https : http;
  const req = lib.get(url, (res) => {
    console.log(`[KeepAlive] ${new Date().toISOString()} — Ping ${url} → ${res.statusCode}`);
    res.resume();
  });
  req.on("error", (err) => {
    console.log(`[KeepAlive] ${new Date().toISOString()} — Error ${url}: ${err.message}`);
  });
  req.setTimeout(10000, () => { req.destroy(); });
}

const localTargets = [
  "http://localhost:5000",
  "http://localhost:8976",
  "http://localhost:8977",
  "http://localhost:8978",
];

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "alive", time: new Date().toISOString(), uptime: process.uptime() }));
});

server.listen(9000, "0.0.0.0", () => {
  console.log(`[KeepAlive] Server listening on port 9000`);
  console.log(`[KeepAlive] Ping interval: ${PING_INTERVAL_MS / 1000}s`);
});

function doPing() {
  for (const t of localTargets) ping(t);
  if (REPLIT_URL) ping(REPLIT_URL);
}

doPing();
setInterval(doPing, PING_INTERVAL_MS);
