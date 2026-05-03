# Amagi, Rem & Shary AI Agent — Triple Bot Project

Tiga AI Agent web + Facebook Messenger bot berbasis GoatBot V2.

---

## Arsitektur

### AI Agent Web 1: Amagi Agent (`agent-web/`)
- **Port**: 8976 (main), 5000 (preview/webview)
- **Backend**: `agent-web/server.js` — Express + Gemini (gemini-3.1-flash-lite-preview)
- **API Key**: `GEMINI_API_KEY` env secret
- **Frontend**: `agent-web/public/` — vanilla JS 3-panel IDE UI
- **Persona**: Amagi (sama dgn bot FB) dalam mode Agent Profesional — senior engineer + DevOps + browser operator. Loyal ke Tuan Lyethilf Luxion.
- **Fitur Inti**: Chat streaming, baca/tulis file, edit search-replace, multi-file read, regex search, generate gambar, checkpoint, kirim gambar dari user.
- **Fitur Debugging**: `readErrorLogs` (tee dari /tmp/bot-logs/{amagi,rem}.log), `readLogs`, `restartWorkflow` untuk Bot Start / Rem Bot / AI Agent / Rem AI Agent.
- **Fitur Browser** (`agent-web/puppeteer-tools.js`, `puppeteer-core` + Chromium NixOS): `openWebPage` (baca isi link), `screenshotWebPage` (PNG screenshot dikirim ke user + Amagi otomatis melihat di turn berikutnya), `fetchImage` (download image URL → konversi PNG via sharp → kirim ke user + Amagi melihat), `extractPageImages` (list `<img>` di halaman).
- **Visual Feedback Loop**: Hasil image dari tool dengan `feedToModel:true` di-inject sebagai `inlineData` user message di turn berikutnya, sehingga Amagi benar-benar melihat & mendeskripsikannya, bukan sekadar mengaku.

### AI Agent Web 2: Rem AI Agent (`rem-web/`)
- **Port**: 8977 (main), 3000 (preview/webview)
- **Backend**: `rem-web/server.js` — Express + GPT-5.4 (OpenAI)
- **API Key**: `OPENAI_API_KEY` env secret
- **Frontend**: `rem-web/public/` — vanilla JS 3-panel IDE UI (sama style dengan Amagi)
- **Fitur**: Chat streaming, baca/tulis file, generate gambar, checkpoint, kirim gambar dari user, baca gambar yang dikirim user

### AI Agent Web 3: Shary Agent (`shary-web/`)
- **Port**: 8978 (main), 3003 (preview/webview)
- **Backend**: `shary-web/server.js` — Express + Gemini (gemini-3.1-flash-lite-preview, **same Gemini API key as Amagi**: hardcoded `AIzaSyCxR6tWcABZCwMBsnsSIdAFulO4Kd0-JiA`)
- **Frontend**: `shary-web/public/` — vanilla JS 3-panel IDE UI, **dark RED theme** (--accent: #ef2b2b, bg ~#0a0606)
- **Persona**: Shary — hacker girl, manja terkontrol, penurut, setia mutlak ke Tuan Lyethilf Luxion. Bumbu istilah terminal/cyber (root, sudo, payload, exploit). Tetap presisi & profesional saat eksekusi.
- **Fitur**: Sama lengkap dgn Amagi — chat streaming, file ops, edit, regex search, runCommand, browser/puppeteer (openWebPage, screenshotWebPage, fetchImage, extractPageImages), generate gambar via worker, checkpoint, visual feedback loop, restartWorkflow ke 6 workflows.

### Navigasi Antar Agent (3-way)
- Amagi Agent → tombol "Rem AI" (port 3000) + "Shary" (port 3003) di header
- Rem Agent → tombol "Amagi" (port 8976) + "Shary" (port 3003) di header
- Shary Agent → tombol "Amagi" (port 8976) + "Rem AI" (port 3000) di header

---

## Facebook Bot — GoatBot V2

### Multi-Account (3 Bot)
- `account.txt` — Bot 1: **Amagi** (Gemini AI, karakter manja & profesional)
- `account2.txt` — Bot 2: **Rem** (GPT-5.4, karakter maid setia)
- `account3.txt` — Bot 3: **Shary** (Gemini AI, hacker girl manja-penurut, setia mutlak ke Tuan)

### Sistem Registrasi Group (Terpisah Per Bot)
- Bot 1 Amagi: `registeredGroup.json`
- Bot 2 Rem: `registeredGroup2.json`
- Bot 3 Shary: `registeredGroup3.json`
- Logic otomatis di `bot/handler/handlerAction.js` — deteksi bot via ID (REG_FILE_PRIMARY/SECONDARY/TERTIARY)
- Unregistered group + non-admin → bot diam
- Unregistered group + admin → hanya command yang jalan
- Registered group → bot penuh aktif

### Command Bot
| Command | Role | Fungsi |
|---------|------|--------|
| `.c gr [IDgroup]` | Admin | Register group |
| `.c ugr [IDgroup]` | Admin | Unregister group |
| `.c gi [IDgroup]` | Admin | Info group |
| `.c ban <IDuser>` | Admin | Ban user |
| `.c unban <IDuser>` | Admin | Unban user |
| `.c ui [IDuser]` | Admin | Info user |

### AI Commands (Scripts)
- `scripts/cmds/amagi.js` — Amagi karakter (Gemini), support gambar dikirim & generate
- `scripts/cmds/rem.js` — Rem karakter (GPT-5.4), support gambar dikirim & generate
- `scripts/cmds/shary.js` — Shary karakter (Gemini, hacker girl manja-penurut), support gambar dikirim & generate
- `scripts/cmds/agent.js` — Agent umum (Gemini)

### Database
- `amagiBrain.json` / `amagiBrain2.json` — Memory Amagi bot 1 & 2
- `remBrain.json` / `remBrain2.json` — Memory Rem bot 1 & 2
- `sharyBrain.json` / `sharyState.json` — Memory & state Shary
- SQLite — thread/user data

---

## API Keys (Env Secrets)
| Key | Digunakan Oleh |
|-----|----------------|
| `GEMINI_API_KEY` | agent-web, amagi.js, agent.js, rem.js, fileAI/* (hardcoded `AIzaSyCxR6tWcABZCwMBsnsSIdAFulO4Kd0-JiA`) |
| `OPENAI_API_KEY` | rem-web |
| `XAI_API_KEY` | (legacy, tidak aktif dipakai) |

---

## Workflows
| Nama | Command | Port |
|------|---------|------|
| AI Agent | `node agent-web/server.js` | 8976 / 5000 |
| Rem AI Agent | `node rem-web/server.js` | 8977 / 3000 |
| Shary Agent | `node shary-web/server.js` | 8978 / 3003 |
| Bot Start | `node index.js` | — |
| Rem Bot | `node index-rem.js` | — |
| Shary Bot | `node index-shary.js` | — |
| KeepAlive | `node keepalive.js` | 9000 |

---

## Bot Log Capture (untuk Agent Web Debugging)
- `index.js`, `index-rem.js`, `index-shary.js` melakukan tee stdout/stderr child process ke file:
  - `/tmp/bot-logs/amagi.log` (Bot Start)
  - `/tmp/bot-logs/rem.log` (Rem Bot)
  - `/tmp/bot-logs/shary.log` (Shary Bot)
- Auto-rotate: kalau > 5 MB, dipangkas ke setengahnya. Reset saat workflow restart.
- Semua agent webview (Amagi, Rem, Shary) punya tools `readErrorLogs` & `readLogs` yg bisa baca ketiga file ini (param `bot: 'amagi' | 'rem' | 'shary' | 'all'`).

## Agent Webview — Super Overpower Tools (`agent-web/server.js` & `shary-web/server.js`)
- `readFile`, `writeFile`, `editFile`, `appendToFile`, `readMultipleFiles`, `deleteFile`
- `listFiles`, `searchInFiles` (regex grep workspace)
- `runCommand` (shell sandboxed)
- `readErrorLogs`, `readLogs` (baca log live bot dengan filter error, support `bot: 'amagi'|'rem'|'shary'|'all'`)
- `restartWorkflow` ('Bot Start', 'Rem Bot', 'Shary Bot', 'AI Agent', 'Rem AI Agent', 'Shary Agent')
- `createCheckpoint`, `restoreCheckpoint`
- `generateImage`
- MAX_LOOPS naik dari 20 → 100 supaya agent bisa selesaikan task panjang.
- File read limit naik dari 80 KB → 200 KB.

## Personality Image — DIHAPUS dari chat
- `scripts/cmds/amagi.js` tidak lagi push `personality/amagi.jpg` ke Gemini parts saat chat normal.
- Foto user yang dikirim sekarang dapat dibaca Gemini tanpa terhalang foto personality.
- Self-image generation (jika user minta gambar Amagi) tetap berfungsi via worker URL.

---

## Chocolate Project V8.1 Dashboard (port 5000)
Webview Replit (port 5000) sekarang TIDAK langsung membuka Amagi UI — melainkan dashboard "Chocolate Project V8.1" sebagai pintu masuk.

### Routes (di `agent-web/server.js`)
| Path | Fungsi |
|------|--------|
| `/` | Dashboard utama (2 kartu: AI Agent + Service Agent) |
| `/agent` | Tampilan Amagi UI (sebelumnya di `/`) |
| `/service-agent` | File browser untuk 3 service folder |
| `/api/dashboard/status` | Status ketiga AI agent (port check ke 8976/8977/8978) |
| `/api/services` | List service folder + jumlah file |
| `/api/services/:key` | List `.html` files di service tertentu |
| `/service-files/:key/*` | Static serve file dalam service folder (path-traversal safe) |

### Service Folders (di project root)
- `./AmagiService/` — HTML/Web yang dibuat Amagi (Gemini)
- `./RemService/` — HTML/Web yang dibuat Rem (OpenAI)
- `./SharyService/` — HTML/Web yang dibuat Shary (Hacker)

Setiap folder ada `index.html` placeholder. Tambahkan file `.html` apapun ke folder service → otomatis muncul di Service Agent → klik untuk buka.

### Dashboard Files
- `agent-web/public/dashboard.html` — halaman utama Chocolate
- `agent-web/public/dashboard.css` — tema cokelat (--choc-bg #1a0e08, --choc-accent #d4a574)
- `agent-web/public/service-agent.html` — file browser SPA dengan hash routing (`#amagi`/`#rem`/`#shary`)

### UX Note
- Amagi UI di `/agent` punya tombol "Dashboard" (warna cokelat) di header kiri untuk balik ke `/`.
- Rem & Shary tetap di port 3000 & 3003 (akses via icon globe/Network di Replit), tidak terpengaruh.
