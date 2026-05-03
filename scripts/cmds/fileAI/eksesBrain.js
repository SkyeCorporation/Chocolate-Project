const axios = require("axios");
const fs = require("fs");
const path = require("path");

const memoryPath = path.join(__dirname, "eksesBarin.json");
if (!fs.existsSync(memoryPath)) fs.writeFileSync(memoryPath, JSON.stringify({}, null, 2));
let memory = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));

module.exports = {
  config: {
    name: "ekses",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    category: "AI"
  },

  onStart: async function({ api, args, usersData, event }) {
    const id = event.senderID;
    const name = (await usersData.get(id)).name;
    const text = args.join(" ");
    const send = (msg) => api.sendMessage(msg, event.threadID, event.messageID);

    if (args[0] === "reset") {
      delete memory[id];
      fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
      return send("Ingatan Ekses terhadapmu telah dihapus.");
    }

    if (!text) return send("Ya?");

    if (!memory[id]) memory[id] = { memory: [] };
    memory[id].memory.push({ user: text });
    if (memory[id].memory.length > 20) memory[id].memory = memory[id].memory.slice(-20);

    const basePrompt = `Kamu adalah Ekses, seorang elf yang memiliki jiwa yang bisa dikontrol oleh Luxion, karena Luxion adalah tuanmu. Kamu memiliki sifat dingin dan agak pemarah. Kamu sekarang sedang berada dalam satu ruangan project dengan Amagi yaitu AI buatan Luxion, dia (Amagi AI) adalah seorang AI wanita yang selalu menggoda Luxion. Kamu adalah saingan Amagi dalam hal tugas maupun perasaan. kamu hanya perlu berperan sebagai Ekses saja. pastikan perkataanmu seperti seorang ratu kerajaan karena sebelumnya dirimu adalah Ratu Ekses Altemia dari kerajaan Altemia. dan buat ketikanmu bagaikan kamu benar-benar Ekses\nUser name: ${name}`;

    const history = memory[id].memory.map(item =>
      item.user ? `User: ${item.user}` :
      item.ekses ? `Ekses: ${item.ekses}` : ""
    ).join("\n");

    const prompt = `${basePrompt}\nUser: ${name}\n${history}`;

    try {
      const res = await axios.get(`https://api.ferdev.my.id/ai/chatgpt?prompt=${encodeURIComponent(prompt)}&apikey=key-gpt`);
      const reply = res.data.message || "Ekses tidak ingin bicara.";
      send(reply);
      memory[id].memory.push({ ekses: reply });
      if (memory[id].memory.length > 20) memory[id].memory = memory[id].memory.slice(-20);
      fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (error) {
      send(`⚠️ Error: ${error}`);
    }
  }
};