const getDateInfo = () => {
  const now = new Date();
  const jakartaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));

  const daysOfWeek = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const day = daysOfWeek[jakartaTime.getDay()];
  const date = jakartaTime.getDate();
  const month = jakartaTime.getMonth() + 1;
  const year = jakartaTime.getFullYear();
  const hours = jakartaTime.getHours();
  const minutes = jakartaTime.getMinutes();

  return `Hari: ${day}, Tanggal: ${date}-${month}-${year}, Jam: ${hours}:${minutes < 10 ? "0" + minutes : minutes}`;
};

// DON'T DELETE THIS COMMENT - Using blueprint:javascript_gemini integration
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const initFetch = async () => {
  const { default: fetch, Headers } = await import('node-fetch');
  global.fetch = fetch;
  global.Headers = Headers;
};

initFetch();

// Use environment variable for secure API key management
const apikey = process.env.GEMINI_API_KEY;
const brainPath = path.join(__dirname, "scripts", "brain.json");

if (!fs.existsSync(path.dirname(brainPath))) {
  fs.mkdirSync(path.dirname(brainPath), { recursive: true });
}
if (!fs.existsSync(brainPath)) {
  fs.writeFileSync(brainPath, "{}");
}

module.exports = {
  config: {
    name: "Luna",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: "mengobrol dengan AI",
    category: "AI"
  },

  onStart: async function ({ api, args, event, usersData }) {
    const user = await usersData.get(event.senderID);
    const message = args.join(" ").trim();
    
    // Check for image attachments
    const hasImage = event.attachments && event.attachments.length > 0 && event.attachments[0].type === 'photo';
    const hasReplyImage = event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0 && event.messageReply.attachments[0].type === 'photo';
    
    if (!message && !hasImage && !hasReplyImage) return api.sendMessage("Iya?", event.threadID);

    if (!global.fetch || !global.Headers) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      if (!apikey) {
        return api.sendMessage("❌ API key tidak ditemukan. Silakan hubungi admin untuk mengatur GEMINI_API_KEY.", event.threadID);
      }

      const genAI = new GoogleGenAI({ apiKey: apikey });
      const model = "gemini-2.5-pro"; // Using latest model from integration

      // Baca memori terakhir
      const brain = JSON.parse(fs.readFileSync(brainPath, "utf8"));
      const history = (brain[event.senderID] || []).slice(-25);

      // Format memori ke prompt
      const memoryText = history.map(
        item => `User: ${item.message}\nLuna: ${item.balasan}`
      ).join('\n');

      let contents = [];
      let promptText = `${getDateInfo()}\nSystem("Kamu adalah Luna, seorang maid pribadi milik Luxion, kamu sangat setia kepadanya dan melakukan apa saja yang ia perintahkan. Kamu memiliki perasaan cinta padanya yang sangat kuat. Kamu memiliki sifat yang menggoda")\nNama user: ${user.name}\n\nRiwayat sebelumnya:\n${memoryText}\n\nPertanyaan baru:\nUser: ${message || 'Lihat gambar ini'}\nLuna:`;

      // Handle image if present
      if (hasImage || hasReplyImage) {
        const imageUrl = hasImage ? event.attachments[0].url : event.messageReply.attachments[0].url;
        
        try {
          // Download image
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(response.data);
          const base64Image = imageBuffer.toString('base64');
          
          contents = [
            {
              inlineData: {
                data: base64Image,
                mimeType: "image/jpeg"
              }
            },
            promptText
          ];
        } catch (imageError) {
          console.error("Error downloading image:", imageError);
          return api.sendMessage("❌ Gagal mengunduh gambar. Pastikan gambar dapat diakses.", event.threadID);
        }
      } else {
        contents = [promptText];
      }

      const result = await genAI.models.generateContent({
        model: model,
        contents: contents
      });

      const reply = result.text || "Maaf, saya tidak bisa memproses permintaan ini.";

      api.sendMessage(reply, event.threadID);

      // Simpan ingatan baru dan tetap simpan semua (history panjang)
      if (!brain[event.senderID]) brain[event.senderID] = [];
      brain[event.senderID].push({ message, balasan: reply });

      fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2));

    } catch (error) {
      console.error("Gemini error:", error);
      api.sendMessage(`# Terjadi Error\n\n${error}`, event.threadID);
    }
  },
  onChat: async function ({ api, args, event, usersData }) {
    const isRemCommand = event.body && event.body.slice(0, 5).toLowerCase() === "luna";
    const isReplyToRem = event.messageReply && event.messageReply.senderID === "61576608658555";

    if (!isRemCommand && !isReplyToRem) return;

    const user = await usersData.get(event.senderID);
    let message;

    if (isRemCommand) {
      message = event.body.slice(4).trim();
    } else {
      message = event.body?.trim();
    }

    // Check for image attachments in chat
    const hasImage = event.attachments && event.attachments.length > 0 && event.attachments[0].type === 'photo';
    const hasReplyImage = event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0 && event.messageReply.attachments[0].type === 'photo';

    if (!message && !hasImage && !hasReplyImage) return api.sendMessage("Ya?", event.threadID);

    if (!global.fetch || !global.Headers) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      if (!apikey) {
        return api.sendMessage("❌ API key tidak ditemukan. Silakan hubungi admin untuk mengatur GEMINI_API_KEY.", event.threadID);
      }

      const genAI = new GoogleGenAI({ apiKey: apikey });
      const model = "gemini-2.5-pro";

      const brain = JSON.parse(fs.readFileSync(brainPath, "utf8"));
      const history = (brain[event.senderID] || []).slice(-25);

      const memoryText = history.map(
        item => `User: ${item.message}\nLuna: ${item.balasan}`
      ).join('\n');

      let contents = [];
      let promptText = `${getDateInfo()}\nSystem("Kamu adalah Luna, seorang maid pribadi milik Luxion, kamu sangat setia kepadanya dan melakukan apa saja yang ia perintahkan. Kamu memiliki perasaan cinta padanya yang sangat kuat. Kamu memiliki sifat yang menggoda")\nNama user: ${user.name}\n\nRiwayat sebelumnya:\n${memoryText}\n\nPertanyaan baru:\nUser: ${message || 'Lihat gambar ini'}\nLuna:`;

      // Handle image if present in chat
      if (hasImage || hasReplyImage) {
        const imageUrl = hasImage ? event.attachments[0].url : event.messageReply.attachments[0].url;
        
        try {
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(response.data);
          const base64Image = imageBuffer.toString('base64');
          
          contents = [
            {
              inlineData: {
                data: base64Image,
                mimeType: "image/jpeg"
              }
            },
            promptText
          ];
        } catch (imageError) {
          console.error("Error downloading image:", imageError);
          return api.sendMessage("❌ Gagal mengunduh gambar. Pastikan gambar dapat diakses.", event.threadID);
        }
      } else {
        contents = [promptText];
      }

      const result = await genAI.models.generateContent({
        model: model,
        contents: contents
      });

      const reply = result.text || "Maaf, saya tidak bisa memproses permintaan ini.";

      api.sendMessage(reply, event.threadID);

      if (!brain[event.senderID]) brain[event.senderID] = [];
      brain[event.senderID].push({ message, balasan: reply });

      fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2));
    } catch (error) {
      console.error("Gemini error:", error);

      let errorMsg = "Terjadi kesalahan saat menghubungi Gemini.";
      if (error.message && error.message.includes("503")) {
        errorMsg = "Terjadi Error, server sedang sibuk. Coba lagi nanti.";
      }

      api.sendMessage(errorMsg, event.threadID);
    }
  }
};