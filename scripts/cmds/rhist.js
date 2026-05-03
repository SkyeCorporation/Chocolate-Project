const fs = require("fs");
const path = require("path");
const axios = require("axios");

const brainPath = path.join(__dirname, "amagiBrain.json");

module.exports = {
  config: {
    name: "rhist",
    version: "1.0.0",
    author: "Luxion",
    countDown: 3,
    role: 0,
    description: "hapus riwayat percakapan AI",
    category: "AI"
  },

  onStart: async function ({ api, event }) {
    try {
      // Pastikan brain.json ada
      if (!fs.existsSync(brainPath)) {
        return api.sendMessage("Tidak ada riwayat untuk dihapus.", event.threadID);
      }

      const brain = JSON.parse(fs.readFileSync(brainPath, "utf8"));

      if (brain[event.senderID]) {
        delete brain[event.senderID];
        fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2));
        api.sendMessage("Riwayat percakapan kamu dengan Amagi telah dihapus.", event.threadID);

        const imageStream = await axios.get("https://i.postimg.cc/sf5zHyrP/IMG-20250524-193905.jpg", { responseType: "stream" });

      api.sendMessage({ attachment: imageStream.data }, event.threadID);
        
      } else {
        api.sendMessage("Kamu belum punya riwayat percakapan dengan Amagi.", event.threadID);
      }
    } catch (error) {
      console.error("rhist error:", error);
      api.sendMessage("Gagal menghapus riwayat.", event.threadID);
    }
  }
};