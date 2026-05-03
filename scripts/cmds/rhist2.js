const fs = require("fs");
const path = require("path");

const remBrainPath = path.join(__dirname, "remRhist2.json");

module.exports = {
  config: {
    name: "rhist2",
    version: "1.0.0",
    author: "Luxion",
    countDown: 3,
    role: 0,
    description: "hapus riwayat percakapan Rem AI",
    category: "AI"
  },

  onStart: async function ({ api, event }) {
    try {
      // Pastikan remRhist2.json ada
      if (!fs.existsSync(remBrainPath)) {
        return api.sendMessage("Tidak ada riwayat untuk dihapus.", event.threadID);
      }

      const brain = JSON.parse(fs.readFileSync(remBrainPath, "utf8"));

      if (brain[event.senderID]) {
        delete brain[event.senderID];
        fs.writeFileSync(remBrainPath, JSON.stringify(brain, null, 2));
        api.sendMessage("Riwayat percakapan kamu dengan Rem telah dihapus. *Membungkuk dalam*", event.threadID);
      } else {
        api.sendMessage("Kamu belum punya riwayat percakapan dengan Rem.", event.threadID);
      }
    } catch (error) {
      console.error("rhist2 error:", error);
      api.sendMessage("Gagal menghapus riwayat Rem.", event.threadID);
    }
  }
};
