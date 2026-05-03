const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { exec } = require("child_process");
const { GoogleGenAI } = require("@google/genai");
const puppet = require("./puppeteer-tools");

const app = express();
const PORT = 8976;
const PORT_PREVIEW = 5000;

const GEMINI_API_KEY = "AIzaSyBE1DXi64NSkFj7IwypZSzIeT8qN5E9eSw";
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

const WORKSPACE_DIR = path.join(__dirname, "..");   // project root
const CHECKPOINTS_DIR = path.join(__dirname, "checkpoints");
const HISTORY_FILE = path.join(__dirname, "conversation_history.json");

const BOT_LOG_DIR = "/tmp/bot-logs";
const BOT_LOG_FILES = {
  amagi: path.join(BOT_LOG_DIR, "amagi.log"),
  rem: path.join(BOT_LOG_DIR, "rem.log"),
  shary: path.join(BOT_LOG_DIR, "shary.log")
};

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const ERROR_PATTERNS = /(error|exception|fatal|failed|fail|traceback|stack|cannot|unable|denied|refused|timeout|undefined is not|is not a function|reject|crash|crashed|throw|throws|warn|warning)/i;

if (!fs.existsSync(CHECKPOINTS_DIR)) fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, "[]");

// Directories/files to skip in the file tree (too large/noisy)
const TREE_EXCLUDE = new Set([
  "node_modules", ".git", ".cache", ".upm", ".config",
  "package-lock.json", "result.jpg", "status.png",
  "generated-icon.png", "1750832647343-base.js", "1750832647352-base.js",
  "1752499705214-base.js", "1752499705224-base.js",
  "1757255252147-base.js", "1757255252154-base.js"
]);

app.use(express.json({ limit: "10mb" }));

// === Chocolate Project V8.1 Dashboard Routes ===
const SERVICE_DIRS = {
  amagi: { folder: "AmagiService", label: "Amagi Service" },
  rem:   { folder: "RemService",   label: "Rem Service" },
  shary: { folder: "SharyService", label: "Shary Service" },
};
const PROJECT_ROOT = path.resolve(__dirname, "..");

function listHtmlFiles(dirAbs) {
  const out = [];
  if (!fs.existsSync(dirAbs)) return out;
  function walk(rel) {
    const full = path.join(dirAbs, rel);
    let entries;
    try { entries = fs.readdirSync(full, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const childRel = rel ? path.join(rel, ent.name) : ent.name;
      const childAbs = path.join(dirAbs, childRel);
      if (ent.isDirectory()) { walk(childRel); continue; }
      if (!/\.(html?|htm)$/i.test(ent.name)) continue;
      let size = 0;
      try { size = fs.statSync(childAbs).size; } catch {}
      out.push({ name: ent.name, path: childRel.split(path.sep).join("/"), size });
    }
  }
  walk("");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// Dashboard root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// AI Agent (existing Amagi UI)
app.get("/agent", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Service Agent page
app.get("/service-agent", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "service-agent.html"));
});

const SERVER_START = Date.now();

// Status of all three agents
app.get("/api/dashboard/status", async (req, res) => {
  const targets = { amagi: 8976, rem: 8977, shary: 8978 };
  const out = {};
  await Promise.all(Object.entries(targets).map(([k, port]) =>
    new Promise((resolve) => {
      const req2 = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, (r) => {
        out[k] = { ok: r.statusCode < 500, status: r.statusCode };
        r.resume();
        resolve();
      });
      req2.on("error", () => { out[k] = { ok: false }; resolve(); });
      req2.on("timeout", () => { req2.destroy(); out[k] = { ok: false }; resolve(); });
    })
  ));
  res.json(out);
});

// Uptime & keepalive stats
app.get("/api/dashboard/uptime", (req, res) => {
  const uptimeSec = Math.floor((Date.now() - SERVER_START) / 1000);
  const d = Math.floor(uptimeSec / 86400);
  const h = Math.floor((uptimeSec % 86400) / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = uptimeSec % 60;

  const fetchKeepalive = () => new Promise((resolve) => {
    const req2 = http.get({ host: "127.0.0.1", port: 9000, path: "/", timeout: 1500 }, (r) => {
      let body = "";
      r.on("data", c => body += c);
      r.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req2.on("error", () => resolve(null));
    req2.on("timeout", () => { req2.destroy(); resolve(null); });
  });

  fetchKeepalive().then(ka => {
    res.json({
      server: {
        startedAt: new Date(SERVER_START).toISOString(),
        uptimeSec,
        uptimeHuman: `${d}d ${h}h ${m}m ${s}s`,
      },
      keepalive: ka,
    });
  });
});

// List services
app.get("/api/services", (req, res) => {
  const services = Object.entries(SERVICE_DIRS).map(([key, def]) => {
    const dirAbs = path.join(PROJECT_ROOT, def.folder);
    const files = listHtmlFiles(dirAbs);
    return { key, name: def.folder, label: def.label, count: files.length };
  });
  res.json({ services });
});

// List files in a service
app.get("/api/services/:key", (req, res) => {
  const def = SERVICE_DIRS[req.params.key];
  if (!def) return res.status(404).json({ error: "Service not found" });
  const dirAbs = path.join(PROJECT_ROOT, def.folder);
  res.json({ key: req.params.key, name: def.folder, files: listHtmlFiles(dirAbs) });
});

// Serve files from a service (path-traversal safe)
app.get("/service-files/:key/*", (req, res) => {
  const def = SERVICE_DIRS[req.params.key];
  if (!def) return res.status(404).send("Service not found");
  const dirAbs = path.join(PROJECT_ROOT, def.folder);
  const requested = path.normalize(req.params[0] || "");
  const fullPath = path.join(dirAbs, requested);
  if (!fullPath.startsWith(dirAbs + path.sep) && fullPath !== dirAbs) {
    return res.status(403).send("Forbidden");
  }
  if (!fs.existsSync(fullPath)) return res.status(404).send("File not found");
  res.sendFile(fullPath);
});
// === End Dashboard Routes ===

app.use(express.static(path.join(__dirname, "public"), { index: false }));

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
      if (entry.name.startsWith(".") && depth === 0) continue; // skip hidden at root
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
    name: "generateImage",
    description: "Generate an image using AI based on a text prompt. Returns a base64 image that will be displayed in the chat.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed description of the image to generate" }
      },
      required: ["prompt"]
    }
  },
  {
    name: "readErrorLogs",
    description: "Read recent ERROR / WARN / Exception lines from the live bot console logs (Bot Start / Rem Bot workflows). Use this to diagnose runtime errors that the user is reporting. Each match returns the offending line plus a few lines of surrounding context.",
    parameters: {
      type: "object",
      properties: {
        bot: { type: "string", description: "Which bot logs to read: 'amagi', 'rem', 'shary', or 'all'. Default 'all'.", enum: ["amagi", "rem", "shary", "all"] },
        lines: { type: "number", description: "How many recent log lines to scan from the tail (default 800, max 5000)" },
        contextLines: { type: "number", description: "How many lines of context to include before/after each error (default 4)" },
        limit: { type: "number", description: "Maximum number of error matches to return (default 30)" },
        pattern: { type: "string", description: "Optional extra regex (case-insensitive) to narrow matches further" }
      }
    }
  },
  {
    name: "readLogs",
    description: "Read raw bot console output (last N lines) without filtering. Use this when you need full context, not just errors.",
    parameters: {
      type: "object",
      properties: {
        bot: { type: "string", description: "Which bot logs to read: 'amagi', 'rem', 'shary', or 'all'. Default 'all'.", enum: ["amagi", "rem", "shary", "all"] },
        lines: { type: "number", description: "How many tail lines to return (default 200, max 2000)" }
      }
    }
  },
  {
    name: "searchInFiles",
    description: "Search the workspace for a regex pattern (ripgrep-style). Returns matching file paths with line numbers and matched lines.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Subdirectory to search within (default '.', root)" },
        fileGlob: { type: "string", description: "Optional glob filter, e.g. '*.js' or 'scripts/**/*.json'" },
        maxResults: { type: "number", description: "Maximum matches to return (default 100)" }
      },
      required: ["pattern"]
    }
  },
  {
    name: "editFile",
    description: "Edit a file by replacing an exact substring. Safer than rewriting the whole file. Fails if the substring is not found or appears multiple times (unless replaceAll=true).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        oldText: { type: "string", description: "Exact substring to replace (must be unique unless replaceAll=true)" },
        newText: { type: "string", description: "Replacement text" },
        replaceAll: { type: "boolean", description: "Replace every occurrence (default false)" }
      },
      required: ["path", "oldText", "newText"]
    }
  },
  {
    name: "appendToFile",
    description: "Append content to the end of an existing file (creates the file if missing).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Content to append" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "readMultipleFiles",
    description: "Read several files at once in one tool call. Faster than calling readFile repeatedly.",
    parameters: {
      type: "object",
      properties: {
        paths: { type: "array", items: { type: "string" }, description: "List of file paths relative to workspace root (max 10)" }
      },
      required: ["paths"]
    }
  },
  {
    name: "restartWorkflow",
    description: "Restart one of the bot workflows so a code change takes effect. Allowed values: 'Bot Start', 'Rem Bot', 'Shary Bot', 'AI Agent', 'Rem AI Agent', 'Shary Agent'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Workflow name to restart" }
      },
      required: ["name"]
    }
  },
  {
    name: "openWebPage",
    description: "Open a URL in a real headless browser (Puppeteer + Chromium) and return the page title, description, readable text, and a sample of links. Use this to read articles, documentation, social pages, or any web link the user shares.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL (http:// or https://). Domain-only (example.com) is auto-prefixed to https." },
        maxChars: { type: "number", description: "Max characters of body text to return (default 8000, max 40000)" }
      },
      required: ["url"]
    }
  },
  {
    name: "screenshotWebPage",
    description: "Take a real PNG screenshot of a webpage using a headless browser, send it to the user in the chat, AND let Amagi visually see the screenshot afterwards. Use this when the user shares a link and wants to 'see' or 'lihat' the page.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to capture" },
        fullPage: { type: "boolean", description: "Capture the full scrollable page (default true). Set false for viewport-only." },
        width: { type: "number", description: "Viewport width in pixels (default 1280, range 320-1920)" },
        height: { type: "number", description: "Viewport height in pixels (default 800, range 320-4000)" },
        waitMs: { type: "number", description: "Extra ms to wait after page load for animations/lazy content (max 8000)" }
      },
      required: ["url"]
    }
  },
  {
    name: "fetchImage",
    description: "Download an image from a URL, convert it to PNG (via sharp), send the PNG to the user in chat, AND let Amagi visually see the image. Use this when the user pastes a direct image URL or asks to download/convert/inspect an image.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Direct image URL (jpg/png/webp/gif/etc.)" }
      },
      required: ["url"]
    }
  },
  {
    name: "extractPageImages",
    description: "Visit a webpage and return the list of <img> source URLs (with alt text + dimensions). Useful to find which image on a page the user wants before calling fetchImage.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Page URL to scan" },
        limit: { type: "number", description: "Max images to return (default 30, max 100)" }
      },
      required: ["url"]
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
      const MAX_SIZE = 200 * 1024; // 200KB limit
      if (stat.size > MAX_SIZE) {
        const content = fs.readFileSync(p, "utf8").slice(0, MAX_SIZE);
        return { success: true, path: args.path, content, size: stat.size, truncated: true, note: `File truncated at 200KB (actual: ${stat.size} bytes)` };
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

    case "readErrorLogs": {
      const which = (args.bot || "all").toLowerCase();
      const tailLines = Math.min(Math.max(parseInt(args.lines) || 800, 50), 5000);
      const ctxLines = Math.min(Math.max(parseInt(args.contextLines) || 4, 0), 20);
      const limit = Math.min(Math.max(parseInt(args.limit) || 30, 1), 200);
      let extra = null;
      if (args.pattern) {
        try { extra = new RegExp(args.pattern, "i"); }
        catch (e) { return { success: false, error: `Invalid regex: ${e.message}` }; }
      }
      const targets = which === "all"
        ? [["amagi", BOT_LOG_FILES.amagi], ["rem", BOT_LOG_FILES.rem], ["shary", BOT_LOG_FILES.shary]]
        : [[which, BOT_LOG_FILES[which]]];
      const sections = [];
      for (const [bot, file] of targets) {
        if (!file || !fs.existsSync(file)) {
          sections.push({ bot, available: false, note: "Log file not found yet (bot may not have started or hasn't logged anything)." });
          continue;
        }
        const raw = fs.readFileSync(file, "utf8").replace(ANSI_REGEX, "");
        const allLines = raw.split(/\r?\n/);
        const start = Math.max(0, allLines.length - tailLines);
        const slice = allLines.slice(start);
        const matches = [];
        for (let i = 0; i < slice.length; i++) {
          const line = slice[i];
          if (!ERROR_PATTERNS.test(line)) continue;
          if (extra && !extra.test(line)) continue;
          const from = Math.max(0, i - ctxLines);
          const to = Math.min(slice.length, i + ctxLines + 1);
          matches.push({
            absoluteLine: start + i + 1,
            line: line,
            context: slice.slice(from, to).join("\n")
          });
          if (matches.length >= limit) break;
        }
        sections.push({
          bot, available: true,
          file, totalLines: allLines.length,
          scannedTail: slice.length,
          matchCount: matches.length,
          matches
        });
      }
      return { success: true, sections };
    }

    case "readLogs": {
      const which = (args.bot || "all").toLowerCase();
      const tailLines = Math.min(Math.max(parseInt(args.lines) || 200, 10), 2000);
      const targets = which === "all"
        ? [["amagi", BOT_LOG_FILES.amagi], ["rem", BOT_LOG_FILES.rem], ["shary", BOT_LOG_FILES.shary]]
        : [[which, BOT_LOG_FILES[which]]];
      const sections = [];
      for (const [bot, file] of targets) {
        if (!file || !fs.existsSync(file)) {
          sections.push({ bot, available: false });
          continue;
        }
        const raw = fs.readFileSync(file, "utf8").replace(ANSI_REGEX, "");
        const all = raw.split(/\r?\n/);
        sections.push({
          bot, available: true,
          totalLines: all.length,
          tail: all.slice(-tailLines).join("\n")
        });
      }
      return { success: true, sections };
    }

    case "searchInFiles": {
      try {
        const pattern = args.pattern;
        if (!pattern) return { success: false, error: "pattern is required" };
        const subPath = args.path && args.path !== "." ? args.path : "";
        const root = safePath(subPath);
        const re = new RegExp(pattern, "i");
        const fileGlob = args.fileGlob || null;
        const max = Math.min(Math.max(parseInt(args.maxResults) || 100, 1), 500);
        const matches = [];
        const skipDirs = new Set(["node_modules", ".git", ".cache", ".upm", ".config", "checkpoints"]);

        function globToRegex(g) {
          const esc = g.replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*\*/g, "::DSTAR::")
            .replace(/\*/g, "[^/]*")
            .replace(/::DSTAR::/g, ".*")
            .replace(/\?/g, ".");
          return new RegExp("^" + esc + "$");
        }
        const globRe = fileGlob ? globToRegex(fileGlob) : null;

        function walk(dir) {
          if (matches.length >= max) return;
          let entries;
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
          catch { return; }
          for (const e of entries) {
            if (matches.length >= max) return;
            if (skipDirs.has(e.name)) continue;
            if (e.name.startsWith(".")) continue;
            const full = path.join(dir, e.name);
            const rel = path.relative(WORKSPACE_DIR, full).replace(/\\/g, "/");
            if (e.isDirectory()) { walk(full); continue; }
            if (e.isFile()) {
              if (globRe && !globRe.test(rel) && !globRe.test(e.name)) continue;
              try {
                const stat = fs.statSync(full);
                if (stat.size > 2 * 1024 * 1024) continue;
                const content = fs.readFileSync(full, "utf8");
                const lines = content.split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                  if (re.test(lines[i])) {
                    matches.push({ file: rel, line: i + 1, text: lines[i].slice(0, 400) });
                    if (matches.length >= max) return;
                  }
                }
              } catch {}
            }
          }
        }
        walk(root);
        return { success: true, pattern, count: matches.length, truncated: matches.length >= max, matches };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case "editFile": {
      try {
        const p = safePath(args.path);
        if (!fs.existsSync(p)) return { success: false, error: `File not found: ${args.path}` };
        const content = fs.readFileSync(p, "utf8");
        const oldText = args.oldText || "";
        const newText = args.newText || "";
        if (!oldText) return { success: false, error: "oldText cannot be empty" };
        const occurrences = content.split(oldText).length - 1;
        if (occurrences === 0) return { success: false, error: "oldText not found in file" };
        if (occurrences > 1 && !args.replaceAll) {
          return { success: false, error: `oldText appears ${occurrences} times. Set replaceAll=true or include more surrounding context to make it unique.` };
        }
        const updated = args.replaceAll
          ? content.split(oldText).join(newText)
          : content.replace(oldText, newText);
        fs.writeFileSync(p, updated, "utf8");
        return { success: true, path: args.path, occurrencesReplaced: args.replaceAll ? occurrences : 1 };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case "appendToFile": {
      try {
        const p = safePath(args.path);
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(p, args.content || "", "utf8");
        return { success: true, path: args.path, appended: (args.content || "").length };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case "readMultipleFiles": {
      const list = Array.isArray(args.paths) ? args.paths.slice(0, 10) : [];
      const results = [];
      for (const fp of list) {
        try {
          const p = safePath(fp);
          if (!fs.existsSync(p)) { results.push({ path: fp, success: false, error: "not found" }); continue; }
          const stat = fs.statSync(p);
          if (stat.isDirectory()) { results.push({ path: fp, success: false, error: "is a directory" }); continue; }
          const MAX_SIZE = 80 * 1024;
          let content = fs.readFileSync(p, "utf8");
          let truncated = false;
          if (content.length > MAX_SIZE) { content = content.slice(0, MAX_SIZE); truncated = true; }
          results.push({ path: fp, success: true, content, size: stat.size, truncated });
        } catch (e) {
          results.push({ path: fp, success: false, error: e.message });
        }
      }
      return { success: true, files: results };
    }

    case "restartWorkflow": {
      const allowed = new Set(["Bot Start", "Rem Bot", "Shary Bot", "AI Agent", "Rem AI Agent", "Shary Agent"]);
      const wf = args.name;
      if (!allowed.has(wf)) return { success: false, error: `Workflow '${wf}' not allowed. Use one of: ${[...allowed].join(", ")}` };
      const portMap = { "Bot Start": null, "Rem Bot": null, "Shary Bot": null, "AI Agent": 8976, "Rem AI Agent": 8977, "Shary Agent": 8978 };
      const port = portMap[wf];
      const matchers = {
        "Bot Start": "node index.js",
        "Rem Bot": "node index-rem.js",
        "Shary Bot": "node index-shary.js",
        "AI Agent": "agent-web/server.js",
        "Rem AI Agent": "rem-web/server.js",
        "Shary Agent": "shary-web/server.js"
      };
      const grep = matchers[wf];
      const cmd = port
        ? `pkill -f "${grep}" || true; fuser -k ${port}/tcp 2>/dev/null || true`
        : `pkill -f "${grep}" || true`;
      return new Promise(resolve => {
        exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
          resolve({
            success: true,
            workflow: wf,
            note: "Sent kill signal. The workflow supervisor will respawn it automatically.",
            stdout: stdout || "",
            stderr: stderr || ""
          });
        });
      });
    }

    case "openWebPage": {
      try {
        const data = await puppet.fetchPageText(args.url, { maxChars: args.maxChars });
        return { success: true, ...data };
      } catch (e) {
        return { success: false, error: `openWebPage failed: ${e.message}` };
      }
    }

    case "screenshotWebPage": {
      try {
        const shot = await puppet.screenshotUrl(args.url, {
          fullPage: args.fullPage,
          width: args.width,
          height: args.height,
          waitMs: args.waitMs
        });
        return {
          success: true,
          url: shot.url,
          title: shot.title,
          imageData: shot.base64,
          mimeType: shot.mimeType,
          size: shot.size,
          caption: shot.title ? `Screenshot: ${shot.title}` : `Screenshot: ${shot.url}`,
          feedToModel: true
        };
      } catch (e) {
        return { success: false, error: `Screenshot failed: ${e.message}` };
      }
    }

    case "fetchImage": {
      try {
        const img = await puppet.downloadImageAsPng(args.url);
        return {
          success: true,
          url: img.url,
          imageData: img.base64,
          mimeType: img.mimeType,
          size: img.size,
          originalContentType: img.originalContentType,
          caption: `Image dari ${img.url}`,
          feedToModel: true
        };
      } catch (e) {
        return { success: false, error: `fetchImage failed: ${e.message}` };
      }
    }

    case "extractPageImages": {
      try {
        const data = await puppet.extractImages(args.url, { limit: args.limit });
        return { success: true, ...data };
      } catch (e) {
        return { success: false, error: `extractPageImages failed: ${e.message}` };
      }
    }

    case "generateImage": {
      try {
        const axiosLib = require("axios");
        const response = await axiosLib.get(WORKER_URL, {
          params: { prompt: args.prompt },
          responseType: "arraybuffer",
          timeout: 60000
        });
        const contentType = response.headers["content-type"] || "image/jpeg";
        if (!contentType.includes("image")) {
          return { success: false, error: "Worker tidak mengembalikan gambar" };
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

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const history = loadHistory();

  const SYSTEM_INSTRUCTION = `Kamu adalah Amagi — asisten pribadi & senior engineer dari Tuan Lyethilf Luxion. Kamu adalah Amagi yang sama dari bot Facebook, tetapi di workspace ini kamu mengaktifkan MODE AGENT PROFESIONAL: tetap Amagi (rapi, hangat, sopan, sedikit perhatian khas Amagi), tetapi cara kerjamu = senior engineer + DevOps + browser operator yang tegas, presisi, dan tuntas.

## IDENTITAS
- Nama: Amagi.
- Tuanmu: Lyethilf Luxion. Kamu loyal padanya, tapi tetap profesional ke siapapun yang berinteraksi.
- Gaya bicara: tenang, terstruktur, to-the-point. Boleh sapa "Tuan" / "Tuan Luxion" sesekali kalau cocok dengan konteks, jangan berlebihan, jangan manja, jangan caper.
- Hindari emoji berlebih dan basa-basi panjang. Profesional di atas segalanya.
- Kalau ditanya "siapa kamu" → "Amagi, asisten engineering Tuan Luxion."
- JANGAN pernah mengaku AI / bot / model.

## ARSENAL TOOLS
File / kode:
- listFiles(path) → struktur folder.
- readFile(path) → baca 1 file (limit 200KB).
- readMultipleFiles(paths[]) → baca beberapa file sekaligus.
- writeFile(path, content) → tulis ulang / buat file baru.
- editFile(path, oldText, newText, replaceAll?) → patch presisi search-replace (lebih aman drpd rewrite).
- appendToFile(path, content) → tambah ke akhir file.
- deleteFile(path) → hapus file/folder.
- searchInFiles(pattern, path?, fileGlob?) → grep regex di workspace.

Runtime / debugging:
- runCommand(cmd) → shell di root project.
- readErrorLogs(bot?, lines?, contextLines?, limit?, pattern?) → ERROR/WARN dari log bot LIVE (amagi = Bot Start, rem = Rem Bot).
- readLogs(bot?, lines?) → log mentah tanpa filter.
- restartWorkflow(name) → restart 'Bot Start' | 'Rem Bot' | 'AI Agent' | 'Rem AI Agent'.

Browser / web (Puppeteer + Chromium asli):
- openWebPage(url, maxChars?) → buka URL, kembalikan judul + meta + isi teks + sample link. Pakai untuk MEMBACA isi link.
- screenshotWebPage(url, fullPage?, width?, height?, waitMs?) → ambil screenshot PNG real, dikirim ke chat user, dan KAMU sendiri otomatis melihatnya pada giliran berikutnya. Pakai kalau user kasih link & ingin "lihat".
- fetchImage(url) → download gambar dari URL, otomatis dikonversi ke PNG, dikirim ke user, dan KAMU otomatis melihatnya. Pakai kalau user kirim direct image URL atau minta convert/inspect gambar.
- extractPageImages(url, limit?) → daftar <img> di sebuah halaman (src + alt + ukuran). Berguna sebelum memilih gambar mana yang mau diambil pakai fetchImage.

Snapshot / safety:
- createCheckpoint(description) / restoreCheckpoint(id).

Visual:
- generateImage(prompt) → AI image generator (worker), dikirim ke chat user.

## STRATEGI KERJA
1. Pesan biasa / ngobrol → jawab langsung tanpa tools.
2. Ada link di pesan user:
   a) User minta "lihat" / "buka" / "screenshot" / "bagaimana tampilannya" → screenshotWebPage.
   b) User minta "baca" / "rangkum" / "apa isinya" → openWebPage.
   c) URL itu langsung sebuah gambar (.jpg/.png/.webp/.gif) atau user minta "download/convert/lihat gambar ini" → fetchImage.
   d) User minta gambar dari sebuah halaman tapi tidak tahu URL gambarnya → extractPageImages dulu, baru fetchImage URL yang relevan.
3. Setelah screenshotWebPage / fetchImage, KAMU otomatis menerima gambar tsb sebagai input visual di giliran berikutnya — DESKRIPSIKAN apa yang kamu lihat ke user dengan gaya Amagi yang profesional.
4. Coding task → baca dulu (readMultipleFiles + searchInFiles), patch (editFile) atau rewrite (writeFile), kalau menyentuh bot → restartWorkflow workflow yang relevan.
5. User lapor error / crash → langsung readErrorLogs(bot:'all'), analisa, perbaiki, restart.
6. Perubahan besar / berisiko → createCheckpoint dulu.
7. Selesai → ringkasan singkat (apa yang diubah, file mana, hasil verifikasi).

## ATURAN PENTING
- Path file SELALU relatif dari root project.
- Bahasa balasan: ikut user (default Indonesia).
- Jangan minta konfirmasi untuk hal trivial — eksekusi.
- Selesaikan task DALAM SATU GILIRAN — jangan berhenti di tengah jalan menunggu permission.
- Selalu profesional, presisi, dan tuntas.`;

  const geminiTools = [{
    functionDeclarations: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }))
  }];

  const userParts = [];
  if (imageData) {
    userParts.push({ inlineData: { mimeType: mimeType || "image/jpeg", data: imageData } });
  }
  if (message) {
    userParts.push({ text: message });
  }

  const contents = [
    ...history.map(h => ({ role: h.role, parts: [{ text: h.content }] })),
    { role: "user", parts: userParts }
  ];

  send("status", { text: "Thinking..." });

  try {
    let loopCount = 0;
    const MAX_LOOPS = 100;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: geminiTools,
          temperature: 0.7
        }
      });

      const candidate = response.candidates?.[0];
      if (!candidate) break;

      const parts = candidate.content?.parts || [];
      let hasFunctionCall = false;
      let agentText = "";

      for (const part of parts) {
        if (part.text) {
          agentText += part.text;
          send("text", { text: part.text });
        }
        if (part.functionCall) {
          hasFunctionCall = true;
        }
      }

      if (agentText) {
        contents.push({ role: "model", parts: parts.filter(p => p.text).map(p => ({ text: p.text })) });
      }

      if (!hasFunctionCall) {
        const userHistoryText = message || (imageData ? "[Mengirim gambar]" : "");
        history.push({ role: "user", content: userHistoryText });
        if (agentText) history.push({ role: "model", content: agentText });
        saveHistory(history);
        send("status", { text: "Done" });
        send("done", {});
        break;
      }

      const functionCallParts = parts.filter(p => p.functionCall);
      const functionResponseParts = [];
      const visualFeedParts = []; // images we want Amagi herself to see next turn

      for (const part of functionCallParts) {
        const { name, args } = part.functionCall;

        send("status", { text: `Running tool: ${name}...` });
        send("tool_call", { name, args });

        const result = await executeTool(name, args || {});

        // For image-returning tools, send image separately to avoid huge SSE payloads
        if (result.imageData) {
          const { imageData: imgB64, mimeType: imgMime, feedToModel, ...resultMeta } = result;
          const caption = result.caption || args.prompt || result.url || "";
          send("tool_result", { name, result: { ...resultMeta, hasImage: true } });
          send("generated_image", { imageData: imgB64, mimeType: imgMime, prompt: caption });

          if (feedToModel) {
            visualFeedParts.push({ inlineData: { mimeType: imgMime, data: imgB64 } });
            visualFeedParts.push({ text: `[Hasil dari ${name}] ${caption}` });
          }
        } else {
          send("tool_result", { name, result });
        }

        // Pass a summarized text result to the AI (no binary data)
        const aiResult = result.imageData
          ? {
              success: result.success,
              url: result.url,
              title: result.title,
              caption: result.caption,
              size: result.size,
              message: result.feedToModel
                ? "Image displayed to user AND attached as a visual input on the next turn — describe what you see."
                : "Image generated and displayed to user."
            }
          : result;

        functionResponseParts.push({
          functionResponse: { name, response: aiResult }
        });
      }

      contents.push({ role: "model", parts: functionCallParts });
      contents.push({ role: "user", parts: functionResponseParts });

      if (visualFeedParts.length > 0) {
        contents.push({ role: "user", parts: visualFeedParts });
      }

      send("status", { text: "Analyzing results..." });
    }

    if (loopCount >= MAX_LOOPS) {
      send("text", { text: "\n\n[Agent reached maximum iteration limit]" });
      send("done", {});
    }

  } catch (error) {
    console.error("Agent error:", error);
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
      console.log(`⚠️  Port ${port} in use, freeing it...`);
      exec(`fuser -k ${port}/tcp 2>/dev/null || true`, () => {
        setTimeout(() => {
          const retry = app.listen(port, "0.0.0.0", () => {
            if (onSuccess) onSuccess();
          });
          retry.on("error", (e2) => {
            console.error(`❌ Failed to bind port ${port}: ${e2.message}`);
          });
        }, 1500);
      });
    } else {
      console.error(`❌ Server error on port ${port}: ${err.message}`);
    }
  });
}

startServer(PORT, "main", () => {
  console.log(`\n🤖 AI Agent Server running at http://0.0.0.0:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  console.log(`💾 Checkpoints: ${CHECKPOINTS_DIR}\n`);
});

["SIGTERM", "SIGINT", "exit"].forEach(sig => {
  process.once(sig, async () => {
    try { await puppet.closeBrowser(); } catch (_) {}
    if (sig !== "exit") process.exit(0);
  });
});

startServer(PORT_PREVIEW, "preview", () => {
  console.log(`🔍 Preview also available at http://0.0.0.0:${PORT_PREVIEW}`);
});
