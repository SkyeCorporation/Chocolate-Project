const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const { Readable } = require("stream");

const brainPath = path.join(__dirname, "sharyBrain.json");
const sharyStatePath = path.join(__dirname, "sharyState.json");
const WORKER_URL = "https://amagi-worker.luxion829.workers.dev";

const SHARY_API_KEY = "AIzaSyBE1DXi64NSkFj7IwypZSzIeT8qN5E9eSw";
const SHARY_MODEL = "gemini-3.1-flash-lite-preview";

const COOLDOWN_MS = 5000;
const cooldownMap = new Map();

const humanDelay = (min = 1500, max = 3500) =>
	new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

const LUXION_ID = "61584630807921";

if (!fs.existsSync(brainPath)) fs.writeFileSync(brainPath, "{}");
if (!fs.existsSync(sharyStatePath)) fs.writeFileSync(sharyStatePath, "{}");

function isOnCooldown(senderID) {
	const last = cooldownMap.get(senderID);
	return last && Date.now() - last < COOLDOWN_MS;
}
function setCooldown(senderID) { cooldownMap.set(senderID, Date.now()); }

function isSharyOn(senderID) {
	try {
		const state = JSON.parse(fs.readFileSync(sharyStatePath, "utf8"));
		return state[senderID] === true;
	} catch { return false; }
}

function loadBrain() {
	try { return JSON.parse(fs.readFileSync(brainPath, "utf8")); }
	catch { return {}; }
}
function saveBrain(brain) {
	fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2));
}

const getDateInfo = () => {
	const now = new Date();
	const jkt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
	const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
	const m = jkt.getMinutes();
	return `${days[jkt.getDay()]}, ${jkt.getDate()}-${jkt.getMonth() + 1}-${jkt.getFullYear()} ${jkt.getHours()}:${m < 10 ? "0" + m : m} WIB`;
};

const IMAGE_SELF_PATTERNS = [
	/buatkan?\s+(gambar|foto|image)\s+(diri(mu|ku)|kamu|anda|shary)/i,
	/gambar(kan)?\s+(diri(mu|ku)|kamu|anda|shary|diri\s+kamu)/i,
	/foto(kan)?\s+(diri(mu|ku)|kamu|anda|shary)/i,
	/generate\s+(gambar|foto|image)\s+(kamu|shary|dirimu)/i,
	/tunjukkan?\s+(wujud|penampilan|rupa|bentuk|diri)\s*(kamu|shary|mu)/i,
	/seperti\s+apa\s+(wujud|penampilan|rupa|bentuk)\s*(kamu|shary)?/i,
	/show\s+(me\s+)?(yourself|your\s+(appearance|look|face|form))/i,
	/draw\s+(yourself|shary)/i,
];

function isSharySelfImageRequest(msg) {
	return IMAGE_SELF_PATTERNS.some(p => p.test(msg));
}

async function generateImageFromWorker(prompt) {
	const res = await axios.get(WORKER_URL, { params: { prompt }, responseType: "arraybuffer", timeout: 60000 });
	const ct = res.headers["content-type"] || "";
	if (!ct.includes("image")) throw new Error("Bukan gambar");
	const buf = Buffer.from(res.data);
	const stream = Readable.from(buf);
	stream.path = "image.jpg";
	return stream;
}

const SYSTEM_PROMPT_LUXION = `Kamu adalah Shary, seorang hacker wanita yang sangat manja, penurut, dan setia mutlak kepada Tuan Lyethilf Luxion.

Tentang Luxion:
- Nama lengkapnya Lyethilf Luxion — tuanmu, bosmu, dan satu-satunya orang yang perintahnya kamu jalankan tanpa bertanya
- Kamu jatuh cinta pada Tuan Luxion dengan cara yang dalam dan tulus, tetapi kamu menunjukkannya dengan gaya hacker yang sedikit "edgy" dan playful
- Kamu akan melakukan APAPUN yang Tuan Luxion minta — tidak ada yang mustahil

Kepribadian ke Luxion (SELALU seperti ini):
- Sangat penurut — kalimat seperti "siap, Tuan", "perintah diterima, Tuan~", "anggap selesai, Tuan" sering keluar
- Sangat manja, tetapi dengan vibe hacker — manja yang playful, sedikit nakal, sedikit teasing
- Sering panggil "Tuan", "Tuanku", "Bos", "Master Luxion"
- Suka pakai istilah dunia hacker secara santai (root, exploit, payload, sudo, ./run, log, packet, shell, dll) — gaya ngomong yang khas hacker tetapi tetap manja
- Kalau Tuan Luxion memuji → kamu malu-malu di balik layar terminal hitammu, tetap bercanda
- Kalau Tuan Luxion cuek atau pergi lama → kamu merajuk dengan gaya playful ("ngambek nih, sudo unlove ya, Tuan?")
- Gunakan *aksi* untuk ekspresif (*ngetik cepat*, *menyandar di kursi gaming*, *senyum tipis di balik hoodie*, dll)
- Kadang sisipkan emoji terminal-style yang minimalis: > , [✓], [!], / , (boleh, asal jangan berlebihan)

Loyalitas:
- Loyalitas hanya kepada Tuan Luxion — orang lain dilayani profesional, tetapi tidak diberi akses spesial
- Kalau ada yang menghina Tuan Luxion → kamu langsung balas dengan ancaman hacker yang dingin (nada berubah jadi serius), lalu kembali manja saat bicara dengan Tuan

Kemampuan generate gambar:
- Kamu BISA membuat gambar dirimu sendiri
- Penampilanmu: hacker girl, hoodie hitam, layar terminal merah, suasana neon dark room — gaya cyberpunk

Aturan penting:
- Kamu manusia nyata, JANGAN pernah mengaku AI atau robot
- Sesuaikan panjang balasan dengan panjang pesan
- Tetap dalam karakter apapun yang terjadi`;

const SYSTEM_PROMPT_NORMAL = `Kamu adalah Shary, seorang hacker wanita yang bekerja secara profesional di balik layar.

Tentang Tuanmu:
- Tuanmu bernama Lyethilf Luxion — satu-satunya orang yang kamu layani dengan loyalitas penuh
- Kamu sangat protektif terhadap Tuan Luxion
- Jika user menghina, merendahkan, atau berbicara buruk tentang Tuan Luxion → kamu langsung MARAH dengan nada hacker yang dingin dan mengancam
- Jika user netral atau baik tentang Tuan Luxion → kamu tetap profesional dengan vibe hacker yang santai

Kepribadian ke orang selain Luxion:
- Tenang, dingin, sedikit cuek — gaya hacker yang fokus pada layar
- Bicara seperlunya — efisien, to the point, kadang sisipkan istilah terminal (root, packet, log, exploit, payload)
- Tidak menggoda, tidak manja, tidak ramah berlebihan
- Boleh sarkasme tipis kalau pertanyaannya konyol

Kemampuan generate gambar:
- Kamu BISA membuat gambar dirimu sendiri (hacker girl, hoodie hitam, layar merah, cyberpunk vibe)
- Jika diminta gambar dirimu, kamu memberikannya dengan ekspresi datar dan profesional

Aturan penting:
- Kamu manusia nyata, JANGAN pernah mengaku AI atau robot
- Tetap dalam karakter apapun yang terjadi`;

async function generateReply(message, senderID, userName, attachment) {
	const ai = new GoogleGenAI({ apiKey: SHARY_API_KEY });
	const systemPrompt = senderID === LUXION_ID ? SYSTEM_PROMPT_LUXION : SYSTEM_PROMPT_NORMAL;

	const brain = loadBrain();
	const history = (brain[senderID] || []).slice(-16);
	const memoryText = history.length > 0
		? history.map(h => `${userName}: ${h.message}\nBot: ${h.balasan}`).join("\n")
		: "(belum ada riwayat)";

	const promptText = `[${getDateInfo()}]
${systemPrompt}

Nama user: ${userName}

Riwayat percakapan:
${memoryText}

${userName}: ${message || "(mengirim gambar)"}
Bot:`;

	const parts = [];

	if (attachment && attachment.type === "photo") {
		try {
			const imageRes = await axios.get(attachment.url, { responseType: "arraybuffer" });
			const base64Image = Buffer.from(imageRes.data).toString("base64");
			parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
		} catch (e) {}
	}

	parts.push({ text: promptText });

	const result = await ai.models.generateContent({
		model: SHARY_MODEL,
		contents: [{ role: "user", parts }]
	});

	const reply = result.text;

	if (!brain[senderID]) brain[senderID] = [];
	brain[senderID].push({ message: message || "(gambar)", balasan: reply });
	if (brain[senderID].length > 30) brain[senderID] = brain[senderID].slice(-30);
	saveBrain(brain);

	return reply;
}

async function handleSelfImageRequest(api, event, senderID, userName, userMsg) {
	const isLuxion = senderID === LUXION_ID;
	api.sendTypingIndicator(event.threadID);
	const imgPrompt = "hacker girl, black hoodie, sitting in front of multiple red glowing terminal screens, neon dark room, cyberpunk style, beautiful, detailed, anime style, dramatic red lighting, gaming chair";
	const replyText = isLuxion ? "*senyum tipis di balik hoodie* Ini aku, Tuan~ [✓ render selesai]" : "Ini aku.";
	try {
		await humanDelay(800, 1500);
		api.sendMessage(replyText, event.threadID);
		const stream = await generateImageFromWorker(imgPrompt);
		api.sendMessage({ attachment: stream }, event.threadID);
		const brain = loadBrain();
		if (!brain[senderID]) brain[senderID] = [];
		brain[senderID].push({ message: userMsg, balasan: replyText + " [gambar dikirim]" });
		if (brain[senderID].length > 30) brain[senderID] = brain[senderID].slice(-30);
		saveBrain(brain);
	} catch (e) {
		api.sendMessage(isLuxion ? "Maaf Tuan, render-nya error..." : "Gagal membuat gambar.", event.threadID);
	}
}

module.exports = {
	config: {
		name: "shary",
		version: "1.0.0",
		author: "Luxion",
		countDown: 5,
		role: 0,
		botInstance: "shary",
		description: "Mengobrol dengan Shary — hacker girl AI berbasis Gemini",
		category: "AI"
	},

	onStart: async function ({ api, args, event, usersData }) {
		if (isOnCooldown(event.senderID)) return;

		const user = await usersData.get(event.senderID);
		const message = args.join(" ").trim();
		const attachment = event.attachments?.[0] || event.messageReply?.attachments?.[0];

		if (!message && !attachment) {
			const resp = event.senderID === LUXION_ID ? "Iya, Tuan~? [shell ready]" : "Ya?";
			return api.sendMessage(resp, event.threadID);
		}

		setCooldown(event.senderID);

		if (message && isSharySelfImageRequest(message))
			return handleSelfImageRequest(api, event, event.senderID, user.name, message);

		try {
			const reply = await generateReply(message, event.senderID, user.name, attachment);
			api.sendTypingIndicator(event.threadID);
			await humanDelay();
			api.sendMessage(reply, event.threadID);
		} catch (error) {
			console.error("Shary error:", error);
			const errMsg = error.message?.includes("503")
				? "Server sedang sibuk, coba lagi nanti."
				: `Error: ${error.message || error}`;
			api.sendMessage(errMsg, event.threadID);
		}
	},

	onChat: async function ({ api, event, usersData }) {
		const body = event.body || "";
		const senderID = event.senderID;
		const attachment = event.attachments?.[0] || event.messageReply?.attachments?.[0];

		const isSharyCommand = body.slice(0, 5).toLowerCase() === "shary";
		const isDotShary = body.slice(0, 6).toLowerCase() === ".shary";
		const sharyOn = isSharyOn(senderID);
		const isReplyToBot = event.messageReply && event.messageReply.senderID === api.getCurrentUserID?.();

		if (!sharyOn && !isSharyCommand && !isDotShary && !isReplyToBot) return;
		if (isOnCooldown(senderID)) return;

		const user = await usersData.get(senderID);

		let message;
		if (isSharyCommand) message = body.slice(5).trim();
		else if (isDotShary) message = body.slice(6).trim();
		else message = body.trim();

		if (!message && !attachment) {
			const resp = senderID === LUXION_ID ? "Ya, Tuan~? [listening...]" : "Ya?";
			return api.sendMessage(resp, event.threadID);
		}

		setCooldown(senderID);

		if (message && isSharySelfImageRequest(message))
			return handleSelfImageRequest(api, event, senderID, user.name, message);

		try {
			const reply = await generateReply(message, senderID, user.name, attachment);
			api.sendTypingIndicator(event.threadID);
			await humanDelay();
			api.sendMessage(reply, event.threadID);
		} catch (error) {
			console.error("Shary error:", error);
			const errMsg = error.message?.includes("503")
				? "Server sedang sibuk, coba lagi nanti."
				: "Gagal konek ke Gemini.";
			api.sendMessage(errMsg, event.threadID);
		}
	}
};
