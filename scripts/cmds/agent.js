const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const { Readable } = require("stream");

const GEMINI_API_KEY = "AIzaSyBE1DXi64NSkFj7IwypZSzIeT8qN5E9eSw";
const WORKER_URL = "https://amagi-worker.luxion829.workers.dev";
const WORKSPACE = path.join(__dirname, "..", "..");
const HISTORY_FILE = path.join(__dirname, "agentHistory.json");

const MAX_HISTORY_TURNS = 12;
const MAX_FILE_SIZE = 80000;

if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, "{}");

// ── History ───────────────────────────────────────────────
function loadAllHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
  catch { return {}; }
}
function saveAllHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}
function getHistory(threadID) {
  return loadAllHistory()[threadID] || [];
}
function pushHistory(threadID, role, text) {
  const all = loadAllHistory();
  if (!all[threadID]) all[threadID] = [];
  all[threadID].push({ role, parts: [{ text }] });
  if (all[threadID].length > MAX_HISTORY_TURNS * 2) {
    all[threadID] = all[threadID].slice(-MAX_HISTORY_TURNS * 2);
  }
  saveAllHistory(all);
}
function clearHistory(threadID) {
  const all = loadAllHistory();
  delete all[threadID];
  saveAllHistory(all);
}

// ── Pending write-confirmation per thread ─────────────────
const pendingWrites = new Map(); // key: threadID → { writes: [{path,content}], expiresAt }
const CONFIRM_TTL_MS = 5 * 60 * 1000; // 5 minutes

function setPendingWrite(threadID, writes) {
  pendingWrites.set(threadID, { writes, expiresAt: Date.now() + CONFIRM_TTL_MS });
}
function getPendingWrite(threadID) {
  const p = pendingWrites.get(threadID);
  if (!p) return null;
  if (Date.now() > p.expiresAt) { pendingWrites.delete(threadID); return null; }
  return p;
}
function clearPendingWrite(threadID) {
  pendingWrites.delete(threadID);
}

// ── File tools ────────────────────────────────────────────
function safePath(filePath) {
  const clean = filePath.replace(/^\/+/, "");
  const resolved = path.resolve(WORKSPACE, clean);
  if (!resolved.startsWith(WORKSPACE)) throw new Error("Akses ditolak: path di luar workspace");
  return resolved;
}

function execTool(name, args) {
  switch (name) {
    case "readFile": {
      const p = safePath(args.path);
      if (!fs.existsSync(p)) return { success: false, error: `File tidak ditemukan: ${args.path}` };
      const stat = fs.statSync(p);
      if (stat.isDirectory()) return { success: false, error: `Path adalah direktori, gunakan listFiles` };
      const content = fs.readFileSync(p, "utf8");
      if (content.length > MAX_FILE_SIZE) {
        return { success: true, content: content.slice(0, MAX_FILE_SIZE) + "\n...[dipotong - file terlalu besar]", truncated: true };
      }
      return { success: true, content, size: content.length };
    }
    case "listFiles": {
      const targetPath = args.path || ".";
      const p = safePath(targetPath);
      if (!fs.existsSync(p)) return { success: false, error: `Path tidak ditemukan: ${targetPath}` };
      if (!fs.statSync(p).isDirectory()) return { success: false, error: `Bukan direktori` };
      const SKIP = new Set(["node_modules", ".git", ".cache", ".upm"]);
      const entries = fs.readdirSync(p, { withFileTypes: true })
        .filter(e => !SKIP.has(e.name))
        .map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
        .join("\n");
      return { success: true, path: targetPath, content: entries || "(kosong)" };
    }
    default:
      return { success: false, error: `Tool tidak dikenal: ${name}` };
  }
}

// ── Gemini Tools (readFile + listFiles only — writeFile is gated) ──
const TOOLS_DEF = [
  {
    name: "readFile",
    description: "Baca isi file dari workspace project. Bisa baca semua file termasuk scripts/cmds/",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path file relatif dari root project. Contoh: scripts/cmds/agent.js" }
      },
      required: ["path"]
    }
  },
  {
    name: "listFiles",
    description: "Lihat daftar file dan folder dalam suatu directory",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path directory relatif dari root project. Gunakan 'scripts/cmds' untuk lihat semua command" }
      },
      required: ["path"]
    }
  },
  {
    name: "proposeWrite",
    description: "Usulkan pembuatan atau pengeditan satu file. Admin akan diminta konfirmasi sebelum file benar-benar ditulis.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path file yang akan dibuat/diedit, relatif dari root project" },
        content: { type: "string", description: "Isi lengkap file yang akan ditulis" },
        reason: { type: "string", description: "Alasan singkat mengapa file ini dibuat/diedit" }
      },
      required: ["path", "content", "reason"]
    }
  }
];

const SYSTEM_INSTRUCTION = `Kamu adalah Amagi Agent — AI assistant cerdas milik admin bot Facebook.

## KEMAMPUAN
- Menjawab pertanyaan coding, debugging, arsitektur kode
- Membaca file project dengan readFile (termasuk scripts/cmds/ untuk lihat semua command)
- Melihat daftar file dengan listFiles (gunakan 'scripts/cmds' untuk lihat semua cmd)
- Mengusulkan pembuatan/pengeditan file dengan proposeWrite (admin akan dikonfirmasi dulu)
- Generate gambar: balas GENERATE_IMAGE:<prompt dalam bahasa Inggris yang detail>

## ALUR KERJA
- Pertanyaan umum → jawab langsung, ringkas
- Mau lihat command? → listFiles("scripts/cmds") lalu readFile(path) kalau perlu
- Mau buat/edit file? → proposeWrite(path, content, reason) — admin akan dikonfirmasi
- Mau generate gambar → GENERATE_IMAGE:<prompt>

## ATURAN
- Bahasa: sesuaikan dengan user (Indonesia → Indonesia, English → English)
- Jawaban ringkas dan to-the-point
- Selalu baca file dulu sebelum mengusulkan edit (jangan tebak isinya)
- JANGAN propose write ke file konfigurasi kritis tanpa alasan jelas`;

// ── Run agent with Gemini + tools ─────────────────────────
async function runAgent(threadID, userMessage, attachmentBase64 = null) {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const history = getHistory(threadID);
  const userParts = [];
  if (attachmentBase64) {
    userParts.push({ inlineData: { mimeType: "image/jpeg", data: attachmentBase64 } });
  }
  userParts.push({ text: userMessage });

  const contents = [...history, { role: "user", parts: userParts }];

  let response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
    tools: [{ functionDeclarations: TOOLS_DEF }]
  });

  let candidate = response.candidates?.[0];
  let iterations = 0;
  let pendingPropose = null; // {path, content, reason}

  while (candidate?.content?.parts?.some(p => p.functionCall) && iterations < 8) {
    iterations++;
    const modelContent = candidate.content;
    const toolResults = [];

    for (const part of modelContent.parts) {
      if (!part.functionCall) continue;
      const { name, args } = part.functionCall;

      let result;
      if (name === "proposeWrite") {
        pendingPropose = { path: args.path, content: args.content, reason: args.reason || "" };
        result = { success: true, message: "Usulan diterima. Menunggu konfirmasi admin." };
      } else {
        result = execTool(name, args || {});
      }

      toolResults.push({ functionResponse: { name, response: result } });
    }

    contents.push(modelContent);
    contents.push({ role: "user", parts: toolResults });

    // If a proposeWrite was seen, stop the loop so we can prompt the admin
    if (pendingPropose) break;

    response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
      tools: [{ functionDeclarations: TOOLS_DEF }]
    });
    candidate = response.candidates?.[0];
  }

  const finalText = response.text
    || candidate?.content?.parts?.find(p => p.text)?.text
    || "";

  pushHistory(threadID, "user", userMessage);
  pushHistory(threadID, "model", finalText || "(agent selesai)");

  return { text: finalText, propose: pendingPropose };
}

// ── Generate image via Cloudflare worker ──────────────────
async function generateImage(prompt) {
  const res = await axios.get(WORKER_URL, {
    params: { prompt },
    responseType: "arraybuffer",
    timeout: 60000
  });
  const ct = res.headers["content-type"] || "";
  if (!ct.includes("image")) throw new Error("Worker tidak mengembalikan gambar");
  const buf = Buffer.from(res.data);
  const stream = Readable.from(buf);
  stream.path = "image.jpg";
  return stream;
}

// ── Bot command ───────────────────────────────────────────
module.exports = {
  config: {
    name: "agent",
    version: "3.0.0",
    author: "Luxion",
    countDown: 0,
    role: 2,
    description: "AI Agent: chat, lihat/edit file, generate gambar (khusus admin)",
    category: "owner",
    guide: {
      en: "{pn} <pesan> — chat AI\n{pn} imagine <prompt> — generate gambar\n{pn} cmds — lihat daftar command\n{pn} memory — lihat riwayat\n{pn} clear — hapus riwayat\n{pn} link — link webview"
    }
  },

  onStart: async function ({ api, args, event, message }) {
    const input = args.join(" ").trim();
    const threadID = event.threadID;
    const senderID = event.senderID;

    // ── Check if this is a write-confirmation reply ───────
    const pending = getPendingWrite(threadID);
    if (pending) {
      const answer = input.toLowerCase().trim();
      if (["ya", "yes", "ok", "iya", "yep", "y"].includes(answer)) {
        clearPendingWrite(threadID);
        const results = [];
        for (const w of pending.writes) {
          try {
            const p = safePath(w.path);
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, w.content, "utf8");
            results.push(`✅ ${w.path}`);
          } catch (e) {
            results.push(`❌ ${w.path}: ${e.message}`);
          }
        }
        return message.reply(`📝 File berhasil ditulis:\n${results.join("\n")}`);
      } else if (["tidak", "batal", "no", "cancel", "n"].includes(answer)) {
        clearPendingWrite(threadID);
        return message.reply("❌ Operasi penulisan file dibatalkan.");
      }
      // else: user typed something else, treat as new message → clear pending and continue
      clearPendingWrite(threadID);
    }

    // ── Built-in shortcuts ────────────────────────────────
    if (!input) {
      return message.reply(
        "🤖 Amagi Agent v3\n\n" +
        "Perintah:\n" +
        "• .agent <pesan> — chat AI\n" +
        "• .agent imagine <prompt> — generate gambar\n" +
        "• .agent cmds — lihat daftar command\n" +
        "• .agent memory — tampilkan riwayat\n" +
        "• .agent clear — hapus riwayat\n" +
        "• .agent link — link webview\n\n" +
        "AI bisa baca & usulkan edit file. Edit butuh konfirmasi."
      );
    }

    if (input.toLowerCase() === "clear") {
      clearHistory(threadID);
      return message.reply("🗑️ Riwayat percakapan dihapus.");
    }

    if (input.toLowerCase() === "link") {
      const devDomain = process.env.REPLIT_DEV_DOMAIN;
      const url = devDomain ? `https://${devDomain}` : "http://localhost:8976";
      return message.reply(`🌐 AI Agent Webview:\n${url}`);
    }

    if (input.toLowerCase() === "cmds") {
      const cmdsDir = path.join(WORKSPACE, "scripts", "cmds");
      const files = fs.readdirSync(cmdsDir)
        .filter(f => f.endsWith(".js"))
        .map(f => `• ${f.replace(".js", "")}`)
        .join("\n");
      return message.reply(`📋 Daftar command (${files.split("\n").length}):\n${files}`);
    }

    if (input.toLowerCase() === "memory") {
      const hist = getHistory(threadID);
      if (!hist.length) return message.reply("📭 Belum ada riwayat percakapan.");
      const summary = hist.slice(-10).map(h => {
        const role = h.role === "user" ? "👤" : "🤖";
        const text = h.parts?.[0]?.text || "";
        return `${role} ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`;
      }).join("\n");
      return message.reply(`📚 Riwayat terakhir:\n${summary}`);
    }

    // ── Quick imagine shortcut ────────────────────────────
    const imagineMatch = input.match(/^imagine\s+(.+)$/i);
    if (imagineMatch) {
      const prompt = imagineMatch[1].trim();
      api.sendMessage("🎨 Membuat gambar, tunggu sebentar...", threadID);
      try {
        const stream = await generateImage(prompt);
        return api.sendMessage({ body: `🎨 "${prompt}"`, attachment: stream }, threadID);
      } catch (e) {
        return message.reply(`❌ Gagal generate gambar: ${e.message}`);
      }
    }

    // ── Attachment handling ───────────────────────────────
    let attachmentBase64 = null;
    const att = event.attachments?.[0] || event.messageReply?.attachments?.[0];
    if (att?.type === "photo" && att.url) {
      try {
        const imgRes = await axios.get(att.url, { responseType: "arraybuffer" });
        attachmentBase64 = Buffer.from(imgRes.data).toString("base64");
      } catch {}
    }

    api.sendTypingIndicator(threadID);

    // ── Run AI agent ──────────────────────────────────────
    try {
      const { text, propose } = await runAgent(threadID, input, attachmentBase64);

      // Handle GENERATE_IMAGE in response
      if (text && text.includes("GENERATE_IMAGE:")) {
        const imgPrompt = text.replace(/[\s\S]*GENERATE_IMAGE:/, "").split("\n")[0].trim();
        const textBefore = text.split("GENERATE_IMAGE:")[0].trim();
        if (textBefore) api.sendMessage(textBefore, threadID);
        api.sendMessage("🎨 Membuat gambar, tunggu sebentar...", threadID);
        try {
          const stream = await generateImage(imgPrompt);
          api.sendMessage({ body: `🎨 "${imgPrompt}"`, attachment: stream }, threadID);
        } catch (e) {
          api.sendMessage(`❌ Gagal generate gambar: ${e.message}`, threadID);
        }
        return;
      }

      // Handle proposed file write — ask for confirmation
      if (propose) {
        setPendingWrite(threadID, [{ path: propose.path, content: propose.content }]);
        const preview = propose.content.slice(0, 300) + (propose.content.length > 300 ? "\n..." : "");
        const confirmMsg =
          `📝 Agent ingin ${fs.existsSync(safePath(propose.path)) ? "mengedit" : "membuat"} file:\n` +
          `📄 \`${propose.path}\`\n\n` +
          `Alasan: ${propose.reason || "-"}\n\n` +
          `Preview isi:\n\`\`\`\n${preview}\n\`\`\`\n\n` +
          `Balas ".agent ya" untuk konfirmasi atau ".agent batal" untuk membatalkan.\n` +
          `(Kadaluarsa dalam 5 menit)`;
        if (text) api.sendMessage(text, threadID);
        return message.reply(confirmMsg);
      }

      if (text) message.reply(text);
      else message.reply("✅ Selesai.");
    } catch (err) {
      console.error("Agent error:", err);
      message.reply(`❌ Error: ${err.message}`);
    }
  }
};
