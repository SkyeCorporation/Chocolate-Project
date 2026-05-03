const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync, exec } = require("child_process");
const http = require("http");
const https = require("https");

const app = express();
const PORT_MAIN = 8976;
const PORT_PREVIEW = 5000;
const GEMINI_API_KEY = "AIzaSyBE1DXi64NSkFj7IwypZSzIeT8qN5E9eSw";
const WORKSPACE = path.resolve(__dirname, "..");
const SERVER_START = Date.now();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const SERVICE_MAP = {
  amagi: path.join(WORKSPACE, "AmagiService"),
  rem: path.join(WORKSPACE, "RemService"),
  shary: path.join(WORKSPACE, "SharyService"),
};

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      resolve(res.statusCode < 500);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function getDiskUsage() {
  try {
    const out = execSync("df -k / 2>/dev/null").toString().split("\n")[1];
    const parts = out.trim().split(/\s+/);
    const total = parseInt(parts[1]) * 1024;
    const used = parseInt(parts[2]) * 1024;
    return { total, used, free: total - used };
  } catch { return { total: 0, used: 0, free: 0 }; }
}

app.get("/api/system", (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const disk = getDiskUsage();
  const uptimeServer = Math.floor((Date.now() - SERVER_START) / 1000);
  const uptimeOS = Math.floor(os.uptime());
  res.json({
    ram: { total: totalMem, used: usedMem, free: freeMem },
    disk: { total: disk.total, used: disk.used, free: disk.free },
    uptime: { server: uptimeServer, os: uptimeOS },
    cpus: os.cpus().length,
    platform: os.platform(),
  });
});

app.get("/api/dashboard/status", async (req, res) => {
  const [a, b, c] = await Promise.all([
    checkPort(8976), checkPort(8977), checkPort(8978),
  ]);
  res.json({ amagi: a, rem: b, shary: c });
});

app.get("/api/services", (req, res) => {
  const result = {};
  for (const [key, dir] of Object.entries(SERVICE_MAP)) {
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
      result[key] = { count: files.length };
    } catch { result[key] = { count: 0 }; }
  }
  res.json(result);
});

app.get("/api/services/:key", (req, res) => {
  const dir = SERVICE_MAP[req.params.key];
  if (!dir) return res.status(404).json({ error: "Unknown service" });
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
    res.json({ files });
  } catch { res.json({ files: [] }); }
});

app.get("/service-files/:key/*", (req, res) => {
  const dir = SERVICE_MAP[req.params.key];
  if (!dir) return res.status(404).send("Not found");
  const rel = req.params[0];
  if (rel.includes("..")) return res.status(403).send("Forbidden");
  res.sendFile(path.join(dir, rel));
});

app.get("/api/chat/stream", async (req, res) => {
  const { message } = req.query;
  if (!message) return res.status(400).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  try {
    const { GoogleGenAI } = require("@google/genai");
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
    });
    for await (const chunk of stream) {
      const text = chunk.text?.() ?? "";
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }
  res.end();
});

app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: "No message" });
  try {
    const { GoogleGenAI } = require("@google/genai");
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const contents = [...history, { role: "user", parts: [{ text: message }] }];
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
    });
    const reply = result.text?.() ?? "";
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/files", (req, res) => {
  const dir = req.query.path ? path.join(WORKSPACE, req.query.path) : WORKSPACE;
  if (!dir.startsWith(WORKSPACE)) return res.status(403).json({ error: "Forbidden" });
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !["node_modules", ".git", "agent-web/checkpoints"].includes(e.name))
      .map(e => ({ name: e.name, isDir: e.isDirectory() }));
    res.json({ entries });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/file", (req, res) => {
  const fp = path.join(WORKSPACE, req.query.path || "");
  if (!fp.startsWith(WORKSPACE)) return res.status(403).json({ error: "Forbidden" });
  try {
    const content = fs.readFileSync(fp, "utf8");
    res.json({ content });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/file", (req, res) => {
  const { filePath, content } = req.body;
  const fp = path.join(WORKSPACE, filePath || "");
  if (!fp.startsWith(WORKSPACE)) return res.status(403).json({ error: "Forbidden" });
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content, "utf8");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/service-agent", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "service-agent.html"));
});

app.get("/agent", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "agent.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

function startServer(port) {
  const srv = http.createServer(app);
  srv.listen(port, "0.0.0.0", () => {
    console.log(`🤖 AI Agent Server running at http://0.0.0.0:${port}`);
    if (port === PORT_MAIN) {
      console.log(`📁 Workspace: ${WORKSPACE}`);
      console.log(`💾 Checkpoints: ${path.join(__dirname, "checkpoints")}`);
    }
  });
}

startServer(PORT_MAIN);
startServer(PORT_PREVIEW);
console.log(`\n🔍 Preview also available at http://0.0.0.0:${PORT_PREVIEW}\n`);
