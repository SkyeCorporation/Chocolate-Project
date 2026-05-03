const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");

const app = express();
const PORT_MAIN = 8977;
const PORT_PREVIEW = 3000;
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const WORKSPACE = path.resolve(__dirname, "..");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: "No message" });
  if (!OPENAI_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not set" });
  try {
    const { default: OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const messages = [
      { role: "system", content: "Kamu adalah Rem, AI maid setia dan cerdas. Kamu sopan, hangat, dan sangat membantu. Setia kepada Tuan Lyethilf Luxion." },
      ...history,
      { role: "user", content: message },
    ];
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      stream: false,
    });
    res.json({ reply: completion.choices[0].message.content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/chat/stream", async (req, res) => {
  const { message } = req.query;
  if (!message) return res.status(400).end();
  if (!OPENAI_KEY) { res.write(`data: ${JSON.stringify({ error: "OPENAI_API_KEY not set" })}\n\n`); return res.end(); }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  try {
    const { default: OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Kamu adalah Rem, AI maid setia dan cerdas. Setia kepada Tuan Lyethilf Luxion." },
        { role: "user", content: message },
      ],
      stream: true,
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }
  res.end();
});

app.get("/api/files", (req, res) => {
  const dir = req.query.path ? path.join(WORKSPACE, req.query.path) : WORKSPACE;
  if (!dir.startsWith(WORKSPACE)) return res.status(403).json({ error: "Forbidden" });
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !["node_modules", ".git"].includes(e.name))
      .map(e => ({ name: e.name, isDir: e.isDirectory() }));
    res.json({ entries });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/file", (req, res) => {
  const fp = path.join(WORKSPACE, req.query.path || "");
  if (!fp.startsWith(WORKSPACE)) return res.status(403).json({ error: "Forbidden" });
  try { res.json({ content: fs.readFileSync(fp, "utf8") }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function startServer(port) {
  http.createServer(app).listen(port, "0.0.0.0", () => {
    console.log(`Rem AI Agent Server running at http://0.0.0.0:${port}`);
    if (port === PORT_MAIN) {
      console.log(`Workspace: ${WORKSPACE}`);
      console.log(`Checkpoints: ${path.join(__dirname, "checkpoints")}`);
      console.log(`Preview also available at http://0.0.0.0:${PORT_PREVIEW}`);
    }
  });
}

startServer(PORT_MAIN);
startServer(PORT_PREVIEW);
