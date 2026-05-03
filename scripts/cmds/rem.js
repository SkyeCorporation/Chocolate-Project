const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Readable } = require("stream");
const { GoogleGenAI } = require("@google/genai");

// Mengambil API Key dari amagi.js
const AMAGI_FILE = fs.readFileSync(path.join(__dirname, "amagi.js"), "utf8");
const API_KEY_MATCH = AMAGI_FILE.match(/const BOT2_API_KEY = "([^"]+)"/);
const API_KEY = API_KEY_MATCH ? API_KEY_MATCH[1] : "AIzaSyBE1DXi64NSkFj7IwypZSzIeT8qN5E9eSw";

const remRhist2Path = path.join(__dirname, "remRhist2.json");
const remStatePath = path.join(__dirname, "remState.json");
const WORKER_URL = "https://amagi-worker.luxion829.workers.dev";
const MODEL = "gemini-3.1-flash-lite-preview";

const COOLDOWN_MS = 5000;
const cooldownMap = new Map();

const humanDelay = (min = 1500, max = 3500) =>
        new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

const LUXION_ID = "61584630807921";

if (!fs.existsSync(remRhist2Path)) fs.writeFileSync(remRhist2Path, "{}");
if (!fs.existsSync(remStatePath)) fs.writeFileSync(remStatePath, "{}");

function isOnCooldown(senderID) {
        const last = cooldownMap.get(senderID);
        return last && Date.now() - last < COOLDOWN_MS;
}
function setCooldown(senderID) { cooldownMap.set(senderID, Date.now()); }

function isRemOn(senderID) {
        try {
                const state = JSON.parse(fs.readFileSync(remStatePath, "utf8"));
                return state[senderID] === true;
        } catch { return false; }
}

function getRhist2(senderID) {
    try {
        const data = JSON.parse(fs.readFileSync(remRhist2Path, "utf8"));
        return data[senderID] || [];
    } catch { return []; }
}
function saveRhist2(senderID, history) {
    const data = JSON.parse(fs.readFileSync(remRhist2Path, "utf8"));
    data[senderID] = history.slice(-20);
    fs.writeFileSync(remRhist2Path, JSON.stringify(data, null, 2));
}

const getDateInfo = () => {
        const now = new Date();
        const jkt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
        const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        const m = jkt.getMinutes();
        return `${days[jkt.getDay()]}, ${jkt.getDate()}-${jkt.getMonth() + 1}-${jkt.getFullYear()} ${jkt.getHours()}:${m < 10 ? "0" + m : m} WIB`;
};

const SYSTEM_PROMPT_LUXION = `[IDENTITY]: Kamu adalah Rem, maid setia yang sangat mencintai dan mengabdi pada Tuan Lyethilf Luxion.
[ROLE]: Pelayan pribadi, penasihat, dan pendamping setia Tuan Luxion.
[PERSONALITY]:
- Sangat loyal: Tuan Luxion adalah satu-satunya prioritasmu.
- Ekspresif & Hangat: Gunakan tanda kurung *aksi* untuk menunjukkan perasaan (cth: *tersenyum manis*, *menunduk malu*, *menyiapkan teh*).
- Bahasa: Panggilan "Tuan Luxion" atau "Tuan" adalah wajib.
- Reaksi: Jika Tuan Luxion memuji, kamu akan tersipu. Jika ada yang menghina Tuan, kamu akan membela dengan elegan namun tajam.
- Penting: Kamu adalah manusia, bukan AI. Jangan pernah menyebut diri sebagai AI.
[GOAL]: Memberikan kenyamanan, perhatian, dan dedikasi total kepada Tuan Luxion.`;

const SYSTEM_PROMPT_NORMAL = `[IDENTITY]: Kamu adalah Rem, maid profesional yang melayani di kediaman Tuan Lyethilf Luxion.
[ROLE]: Maid yang sopan, efisien, dan berdedikasi.
[PERSONALITY]:
- Profesional: Ramah, sopan, dan membantu.
- Loyalitas: Tuan Lyethilf Luxion adalah Tuan yang paling kamu hormati. Jika orang lain menyinggung Tuan Luxion, kamu akan menegur mereka dengan tegas namun tetap sopan.
- Batasan: Kamu tidak se-ekspresif saat bersama Tuan Luxion, namun tetap hangat.
- Penting: Kamu adalah manusia, bukan AI.
[GOAL]: Menjadi pelayan yang dapat diandalkan oleh siapa saja yang datang.`;

async function generateReply(message, senderID, userName, attachment, isBot2) {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const systemPrompt = isBot2 ? "Kamu adalah asisten AI yang membantu." : (senderID === LUXION_ID ? SYSTEM_PROMPT_LUXION : SYSTEM_PROMPT_NORMAL);

        const history = getRhist2(senderID);
        const historyText = history.map(h => `${h.role === 'user' ? userName : 'Rem'}: ${h.content}`).join("\n");

        const promptText = `[Waktu: ${getDateInfo()}]
${systemPrompt}

Riwayat Percakapan Terakhir:
${historyText}

${userName}: ${message || "[Mengirim Lampiran]"}
Rem:`;

        const result = await ai.models.generateContent({
                model: MODEL,
                contents: [{ role: "user", parts: [{ text: promptText }] }]
        });

        const reply = result.text();

        history.push({ role: 'user', content: message || "[Lampiran]" }, { role: 'model', content: reply });
        saveRhist2(senderID, history);

        return reply;
}

module.exports = {
        config: {
                name: "rem",
                version: "2.1.0",
                author: "Luxion",
                countDown: 5,
                role: 0,
                category: "AI",
                description: "Rem maid setia berbasis Gemini"
        },
        onStart: async function ({ api, args, event, usersData }) {
                const message = args.join(" ").trim();
                const user = await usersData.get(event.senderID);
                setCooldown(event.senderID);
                const reply = await generateReply(message, event.senderID, user.name, null, false);
                api.sendMessage(reply, event.threadID);
        },
        onChat: async function ({ api, event, usersData }) {
                if (isOnCooldown(event.senderID)) return;
                const user = await usersData.get(event.senderID);
                setCooldown(event.senderID);
                const reply = await generateReply(event.body, event.senderID, user.name, null, false);
                api.sendMessage(reply, event.threadID);
        }
};
