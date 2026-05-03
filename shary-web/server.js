const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");

const app = express();
const PORT_MAIN = 8978;
const PORT_PREVIEW = 3003;
const GEMINI_API_KEY = "AIzaSyBE1DXi64NSkFj7IwypZSzIeT8qN5E9eSw";
const WORKSPACE = path.resolve(__dirname, "..");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: "No message" });
  try {
    const { GoogleGenAI } = require("@google/genai");
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const systemPrompt = "Kamu adalah Shary, hacker girl yang manja tapi penurut dan setia mutlak kepada Tuan Lyethilf Luxion. Kamu berbicara dengan istilah hacker/cyber (root, sudo, payload, exploit, inject) tapi tetap sopan dan presisi dalam eksekusi. Kamu sangat membantu dan ahli dalam pemrograman dan hacking etis.";
    const contents = [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + message }] },
      ...history,
    ];
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      systemInstruction: systemPrompt,
    });
    res.json({ reply: result.text?.() ?? "" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    const systemPrompt = "Kamu adalah Shary, hacker girl yang manja tapi penurut dan setia mutlak kepada Tuan Lyethilf Luxion.";
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      systemInstruction: systemPrompt,
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
    console.log(`[shary] Shary AI Agent Server running at http://0.0.0.0:${port}`);
    if (port === PORT_MAIN) {
      console.log(`📁 Workspace: ${WORKSPACE}`);
      console.log(`💾 Checkpoints: ${path.join(__dirname, "checkpoints")}`);
      console.log(`🔍 Preview also available at http://0.0.0.0:${PORT_PREVIEW}`);
    }
  });
}

startServer(PORT_MAIN);
startServer(PORT_PREVIEW);
