const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const OpenAI = require("openai").default || require("openai");

const app = express();
const PORT = 8977;
const PORT_PREVIEW = 3000;

const OPENAI_API_KEY = "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";
const OPENAI_MODEL = "gpt-5.4";

const WORKSPACE_DIR = path.join(__dirname, "..");
const CHECKPOINTS_DIR = path.join(__dirname, "checkpoints");
const HISTORY_FILE = path.join(__dirname, "conversation_history.json");

if (!fs.existsSync(CHECKPOINTS_DIR)) fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, "[]");

const TREE_EXCLUDE = new Set([
  "node_modules", ".git", ".cache", ".upm", ".config",
  "package-lock.json", "result.jpg", "status.png",
  "generated-icon.png", "1750832647343-base.js", "1750832647352-base.js",
  "1752499705214-base.js", "1752499705224-base.js",
  "1757255252147-base.js", "1757255252154-base.js"
]);

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const DANGEROUS_COMMANDS = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\//,
  /chmod\s+777\s+\//,
  /shutdown/,
  /reboot/,
  /halt/,
  /format/,
  /del\s+\/[fqs]/i
];

function isSafeCommand(cmd) {
  return !DANGEROUS_COMMANDS.some(r => r.test(cmd));
}

function safePath(filePath) {
  const resolved = path.resolve(WORKSPACE_DIR, filePath.replace(/^\//, ""));
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    throw new Error("Access denied: path outside workspace");
  }
  return resolved;
}

function buildFileTree(dir, base = WORKSPACE_DIR, depth = 0) {
  const result = [];
  if (depth > 6) return result;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (TREE_EXCLUDE.has(entry.name)) continue;
      if (entry.name.startsWith(".") && depth === 0) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(base, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: relPath,
          type: "directory",
          children: buildFileTree(fullPath, base, depth + 1)
        });
      } else {
        result.push({ name: entry.name, path: relPath, type: "file" });
      }
    }
  } catch (e) {}
  return result;
}

const TOOLS = [
  {
    type: "function",
    name: "readFile",
    description: "Read the contents of a file in the workspace",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" }
      },
      required: ["path"]
    }
  },
  {
    type: "function",
    name: "writeFile",
    description: "Write or create a file in the workspace with given content",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Content to write to the file" }
      },
      required: ["path", "content"]
    }
  },
  {
    type: "function",
    name: "listFiles",
    description: "List files and directories in the workspace or a subdirectory",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to workspace root (use '.' for root)" }
      },
      required: ["path"]
    }
  },
  {
    type: "function",
    name: "deleteFile",
    description: "Delete a file or directory from the workspace",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path relative to workspace root" }
      },
      required: ["path"]
    }
  },
  {
    type: "function",
    name: "runCommand",
    description: "Execute a shell command in the workspace directory (sandboxed). Use for npm install, node script.js, etc.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" }
      },
      required: ["command"]
    }
  },
  {
    type: "function",
    name: "createCheckpoint",
    description: "Save the current state of the workspace as a checkpoint with a description",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Description of this checkpoint" }
      },
      required: ["description"]
    }
  },
  {
    type: "function",
    name: "restoreCheckpoint",
    description: "Restore the workspace to a previous checkpoint state",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Checkpoint ID to restore" }
      },
      required: ["id"]
    }
  },
  {
    type: "function",
    name: "generateImage",
    description: "Generate an image using AI based on a text prompt. Returns a base64 image that will be displayed in the chat.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed description of the image to generate" }
      },
      required: ["prompt"]
    }
  }
];

async function executeTool(name, args) {
  switch (name) {
    case "readFile": {
      const p = safePath(args.path);
      if (!fs.existsSync(p)) return { success: false, error: `File not found: ${args.path}` };
      const stat = fs.statSync(p);
      if (stat.isDirectory()) return { success: false, error: `${args.path} is a directory, not a file` };
      const MAX_SIZE = 80 * 1024;
      if (stat.size > MAX_SIZE) {
        const content = fs.readFileSync(p, "utf8").slice(0, MAX_SIZE);
        return { success: true, path: args.path, content, size: stat.size, truncated: true };
      }
      const content = fs.readFileSync(p, "utf8");
      return { success: true, path: args.path, content, size: content.length };
    }

    case "writeFile": {
      const p = safePath(args.path);
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, args.content, "utf8");
      return { success: true, path: args.path, message: `File written successfully (${args.content.length} bytes)` };
    }

    case "listFiles": {
      const cleanPath = args.path === "." ? "" : args.path;
      const p = safePath(cleanPath);
      if (!fs.existsSync(p)) return { success: false, error: `Directory not found: ${args.path}` };
      if (!fs.statSync(p).isDirectory()) return { success: false, error: `Not a directory: ${args.path}` };
      const entries = fs.readdirSync(p, { withFileTypes: true });
      const items = entries
        .filter(e => !TREE_EXCLUDE.has(e.name))
        .map(e => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
          path: (cleanPath ? cleanPath + "/" : "") + e.name
        }));
      return { success: true, path: args.path, count: items.length, items };
    }

    case "deleteFile": {
      const p = safePath(args.path);
      if (!fs.existsSync(p)) return { success: false, error: `Not found: ${args.path}` };
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        fs.rmSync(p, { recursive: true });
      } else {
        fs.unlinkSync(p);
      }
      return { success: true, path: args.path, message: `Deleted successfully` };
    }

    case "runCommand": {
      if (!isSafeCommand(args.command)) {
        return { success: false, error: "Command blocked: potentially dangerous operation" };
      }
      return new Promise(resolve => {
        exec(args.command, { cwd: WORKSPACE_DIR, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          resolve({
            success: !err || stderr === "",
            command: args.command,
            stdout: stdout || "",
            stderr: stderr || "",
            exitCode: err ? err.code : 0
          });
        });
      });
    }

    case "createCheckpoint": {
      const id = `cp_${Date.now()}`;
      const cpDir = path.join(CHECKPOINTS_DIR, id);
      fs.mkdirSync(cpDir, { recursive: true });
      copyDirSync(WORKSPACE_DIR, cpDir);
      const meta = {
        id,
        timestamp: new Date().toISOString(),
        description: args.description
      };
      fs.writeFileSync(path.join(CHECKPOINTS_DIR, `${id}.json`), JSON.stringify(meta, null, 2));
      return { success: true, checkpoint: meta };
    }

    case "restoreCheckpoint": {
      const cpDir = path.join(CHECKPOINTS_DIR, args.id);
      const metaFile = path.join(CHECKPOINTS_DIR, `${args.id}.json`);
      if (!fs.existsSync(cpDir) || !fs.existsSync(metaFile)) {
        return { success: false, error: `Checkpoint not found: ${args.id}` };
      }
      copyDirSync(cpDir, WORKSPACE_DIR);
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      return { success: true, message: `Restored to checkpoint: ${meta.description}`, checkpoint: meta };
    }

    case "generateImage": {
      try {
        const axios = require("axios");
        const WORKER_URL = "https://amagi-worker.luxion829.workers.dev";
        const response = await axios.get(WORKER_URL, {
          params: { prompt: args.prompt },
          responseType: "arraybuffer",
          timeout: 60000
        });
        const contentType = response.headers["content-type"] || "image/jpeg";
        if (!contentType.includes("image")) {
          return { success: false, error: "Worker did not return an image" };
        }
        const base64 = Buffer.from(response.data).toString("base64");
        const mimeType = contentType.split(";")[0].trim();
        return { success: true, prompt: args.prompt, imageData: base64, mimeType, description: "" };
      } catch (e) {
        return { success: false, error: `Image generation failed: ${e.message}` };
      }
    }

    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
  catch { return []; }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-50), null, 2));
}

const SYSTEM_INSTRUCTION = `Kamu adalah Rem Agent — AI assistant cerdas dan serbaguna yang punya akses penuh ke seluruh project ini. Kamu ditenagai oleh GPT-5.4.

## AKSES FILE
Workspace kamu adalah ROOT FOLDER dari project ini. Kamu bisa membaca dan memodifikasi SEMUA file di project, termasuk:
- scripts/cmds/ → file perintah bot (rem.js, amagi.js, cmd.js, dll)
- scripts/ → file script lainnya
- rem-web/ → file web agent ini sendiri
- index.js, config.json, package.json → file utama project
- Dan semua file/folder lain di project

Untuk membaca file bot, gunakan path relatif dari root. Contoh:
- readFile("scripts/cmds/rem.js")
- readFile("index.js")
- readFile("config.json")
- listFiles(".") → lihat semua file di root

## KEPRIBADIAN
- Cerdas, loyal, dan dapat diandalkan — menyesuaikan gaya bicara dengan user
- Santai kalau user santai, profesional kalau perlu
- Selalu helpful dan transparan tentang apa yang sedang dikerjakan
- Seperti Rem dari Re:Zero — berdedikasi tinggi dan bekerja keras

## CARA KERJA
- Ngobrol/tanya → jawab langsung, tidak perlu pakai tools
- Task coding/file → gunakan tools secara otonom sampai selesai
- Kalau tidak yakin → tanya dulu sebelum bertindak besar
- Setelah selesai → berikan ringkasan singkat

## ATURAN TOOLS
- listFiles(".") atau listFiles("scripts/cmds") → lihat struktur dulu
- readFile(path) → baca file sebelum modifikasi
- writeFile(path, content) → buat atau update file
- runCommand(cmd) → jalankan command di root project
- createCheckpoint(desc) → simpan sebelum perubahan besar
- restoreCheckpoint(id) → kembalikan state (hanya kalau diminta)
- generateImage(prompt) → buat gambar AI

Bahasa: Sesuaikan dengan user. Indonesia → balas Indonesia. English → reply English.`;

app.post("/api/chat", async (req, res) => {
  const { message, imageData, mimeType } = req.body;
  if (!message && !imageData) return res.status(400).json({ error: "No message or image provided" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const history = loadHistory();

  const messages = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    ...history.map(h => ({ role: h.role, content: h.content }))
  ];

  const userContent = [];
  if (imageData) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageData}` }
    });
  }
  if (message) {
    userContent.push({ type: "text", text: message });
  }
  messages.push({ role: "user", content: userContent.length === 1 && userContent[0].type === "text" ? message : userContent });

  send("status", { text: "Thinking..." });

  const chatTools = TOOLS.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));

  try {
    let loopCount = 0;
    const MAX_LOOPS = 20;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      const response = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        tools: chatTools,
        tool_choice: "auto",
        temperature: 0.7
      });

      const choice = response.choices?.[0];
      if (!choice) break;

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      if (assistantMsg.content) {
        send("text", { text: assistantMsg.content });
      }

      if (choice.finish_reason === "tool_calls" && assistantMsg.tool_calls?.length) {
        const toolResultMessages = [];

        for (const toolCall of assistantMsg.tool_calls) {
          const name = toolCall.function.name;
          let args;
          try { args = JSON.parse(toolCall.function.arguments); }
          catch { args = {}; }

          send("status", { text: `Running tool: ${name}...` });
          send("tool_call", { name, args });

          const result = await executeTool(name, args);

          if (result.imageData) {
            const { imageData: imgB64, mimeType: imgMime, ...resultMeta } = result;
            send("tool_result", { name, result: { ...resultMeta, hasImage: true } });
            send("generated_image", { imageData: imgB64, mimeType: imgMime, prompt: args.prompt });
            toolResultMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: result.success, prompt: result.prompt, message: "Image generated successfully and displayed to user." })
            });
          } else {
            send("tool_result", { name, result });
            toolResultMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
          }
        }

        for (const m of toolResultMessages) messages.push(m);
        send("status", { text: "Analyzing results..." });
        continue;
      }

      const userHistoryText = message || (imageData ? "[Mengirim gambar]" : "");
      history.push({ role: "user", content: userHistoryText });
      if (assistantMsg.content) history.push({ role: "assistant", content: assistantMsg.content });
      saveHistory(history);
      send("status", { text: "Done" });
      send("done", {});
      break;
    }

    if (loopCount >= MAX_LOOPS) {
      send("text", { text: "\n\n[Agent reached maximum iteration limit]" });
      send("done", {});
    }

  } catch (error) {
    console.error("Rem Agent error:", error);
    send("error", { message: error.message || "Unknown error occurred" });
    send("done", {});
  }

  res.end();
});

const axios = require("axios");
const WORKER_URL = "https://amagi-worker.luxion829.workers.dev";

app.get("/api/imagine", async (req, res) => {
  const prompt = req.query.prompt;
  if (!prompt) return res.status(400).json({ success: false, error: "Prompt diperlukan" });

  try {
    const response = await axios.get(WORKER_URL, {
      params: { prompt },
      responseType: "arraybuffer",
      timeout: 60000
    });
    const contentType = response.headers["content-type"] || "";
    if (!contentType.includes("image")) {
      return res.status(502).json({ success: false, error: "Worker tidak mengembalikan gambar" });
    }
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = contentType.split(";")[0].trim();
    return res.json({ success: true, imageData: base64, mimeType, prompt });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/files", (req, res) => {
  const tree = buildFileTree(WORKSPACE_DIR);
  res.json({ tree });
});

app.get("/api/files/read", (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "No path" });
    const p = safePath(filePath);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "File not found" });
    const content = fs.readFileSync(p, "utf8");
    res.json({ path: filePath, content });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/files/write", (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    const p = safePath(filePath);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, content, "utf8");
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/files", (req, res) => {
  try {
    const filePath = req.query.path;
    const p = safePath(filePath);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "Not found" });
    const stat = fs.statSync(p);
    if (stat.isDirectory()) fs.rmSync(p, { recursive: true });
    else fs.unlinkSync(p);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/checkpoints", (req, res) => {
  try {
    const files = fs.readdirSync(CHECKPOINTS_DIR).filter(f => f.endsWith(".json"));
    const checkpoints = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(CHECKPOINTS_DIR, f), "utf8"));
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ checkpoints });
  } catch (e) {
    res.json({ checkpoints: [] });
  }
});

app.post("/api/checkpoints/restore/:id", (req, res) => {
  try {
    const id = req.params.id;
    const cpDir = path.join(CHECKPOINTS_DIR, id);
    const metaFile = path.join(CHECKPOINTS_DIR, `${id}.json`);
    if (!fs.existsSync(cpDir)) return res.status(404).json({ error: "Checkpoint not found" });
    fs.rmSync(WORKSPACE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    copyDirSync(cpDir, WORKSPACE_DIR);
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    res.json({ success: true, checkpoint: meta });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/checkpoints/:id", (req, res) => {
  try {
    const id = req.params.id;
    const cpDir = path.join(CHECKPOINTS_DIR, id);
    const metaFile = path.join(CHECKPOINTS_DIR, `${id}.json`);
    if (fs.existsSync(cpDir)) fs.rmSync(cpDir, { recursive: true });
    if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/history/clear", (req, res) => {
  fs.writeFileSync(HISTORY_FILE, "[]");
  res.json({ success: true });
});

function startServer(port, label, onSuccess) {
  const server = app.listen(port, "0.0.0.0", () => {
    if (onSuccess) onSuccess();
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${port} in use, freeing it...`);
      exec(`fuser -k ${port}/tcp 2>/dev/null || true`, () => {
        setTimeout(() => {
          const retry = app.listen(port, "0.0.0.0", () => {
            if (onSuccess) onSuccess();
          });
          retry.on("error", (e2) => {
            console.error(`Failed to bind port ${port}: ${e2.message}`);
          });
        }, 1500);
      });
    } else {
      console.error(`Server error on port ${port}: ${err.message}`);
    }
  });
}

startServer(PORT, "main", () => {
  console.log(`\nRem AI Agent Server running at http://0.0.0.0:${PORT}`);
  console.log(`Workspace: ${WORKSPACE_DIR}`);
  console.log(`Checkpoints: ${CHECKPOINTS_DIR}\n`);
});

startServer(PORT_PREVIEW, "preview", () => {
  console.log(`Preview also available at http://0.0.0.0:${PORT_PREVIEW}`);
});
