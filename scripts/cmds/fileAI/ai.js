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

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const initFetch = async () => {
  const { default: fetch, Headers } = await import('node-fetch');
  global.fetch = fetch;
  global.Headers = Headers;
};

initFetch();

const apikey = "AIzaSyCxR6tWcABZCwMBsnsSIdAFulO4Kd0-JiA";
const brainPath = path.join(__dirname, "scripts", "brain.json");

if (!fs.existsSync(path.dirname(brainPath))) {
  fs.mkdirSync(path.dirname(brainPath), { recursive: true });
}
if (!fs.existsSync(brainPath)) {
  fs.writeFileSync(brainPath, "{}");
}
const axios = require("axios");
module.exports = {
  config: {
    name: "amagi",
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
    if (!message) return api.sendMessage("Iya?", event.threadID);

    if (!global.fetch || !global.Headers) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      const genAI = new GoogleGenerativeAI(apikey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Baca memori terakhir
      const brain = JSON.parse(fs.readFileSync(brainPath, "utf8"));
      const history = (brain[event.senderID] || []).slice(-25);

      // Format memori ke prompt
      const memoryText = history.map(
        item => `User: ${item.message}\nAmagi: ${item.balasan}`
      ).join('\n');

      const prompt = `${getDateInfo()}\nSystem("Kamu adalah Amagi AI yang diciptakan oleh tuan Luxion. Kamu memiliki wujud seperti manusia dengan rambut coklat serta mata coklat kemerahan. Kamu selalu menggunakan baju maid karena kamu adalah Maid Robot yang berkerja secara langsung dibawah kepemilikan Luxion. Kamu memiliki sifat yang sangat menggoda dan sedikit datar.")
      Nama user: ${user.name}

Riwayat sebelumnya:
${memoryText}

Pertanyaan baru:
User: ${message}
Amagi:`.trim();

      const result = await model.generateContent({
        contents: [{ parts: [{ text: prompt }] }]
      });
      

      const response = result.response;
      const reply = await response.text();

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
    const isRemCommand = event.body && event.body.slice(0, 5).toLowerCase() === "amagi";
    const isReplyToRem = event.messageReply && event.messageReply.senderID === "61576608658555";

    if (!isRemCommand && !isReplyToRem) return;

    const user = await usersData.get(event.senderID);
    let message;

    if (isRemCommand) {
      message = event.body.slice(4).trim();
    } else {
      message = event.body?.trim();
    }

    if (!message) return api.sendMessage("Ya?", event.threadID);

    if (!global.fetch || !global.Headers) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      const genAI = new GoogleGenerativeAI(apikey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const brain = JSON.parse(fs.readFileSync(brainPath, "utf8"));
      const history = (brain[event.senderID] || []).slice(-25);

      const memoryText = history.map(
        item => `User: ${item.message}\nAmagi: ${item.balasan}`
      ).join('\n');

      const prompt = `${getDateInfo()}\nSystem("Kamu adalah Amagi AI yang diciptakan oleh tuan Luxion. Kamu memiliki wujud seperti manusia dengan rambut coklat serta mata coklat kemerahan. Kamu selalu menggunakan baju maid karena kamu adalah Maid Robot yang berkerja secara langsung dibawah kepemilikan Luxion. Kamu memiliki sifat yang sangat menggoda dan sedikit datar.")
      Nama user: ${user.name}

Riwayat sebelumnya:
${memoryText}

Pertanyaan baru:
User: ${message}
Amagi:`.trim();

      const result = await model.generateContent({
        contents: [{ parts: [{ text: prompt }] }]
      });

      const response = result.response;
      const reply = await response.text();

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