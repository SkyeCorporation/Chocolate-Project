const moment = require("moment-timezone");

module.exports = {
  config: {
    name: "daily",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: "mengambil hadiah harian",
    category: "Economy"
  },

  onStart: async function ({ api, event, usersData }) {
    if (event.threadID === event.senderID) {
      return api.sendMessage("Perintah tidak dapat digunakan dalam chat pribadi.", event.threadID);
    }

    const userID = event.senderID;
    const user = await usersData.get(userID) || { data: {} };
    if (user.data.progress !== "none") {
      return api.sendMessage(`Kamu sedang berada dalam progres ${user.data.progress}`, event.threadID);
    }
    const now = moment.tz("Asia/Jakarta");

    const lastClaim = user.data.lastDaily;
    if (lastClaim) {
      const lastTime = moment.tz(lastClaim, "Asia/Jakarta");
      const diff = now.diff(lastTime, "milliseconds");

      //disini sebelumnya 777
    }

    user.data.progress = "daily";
    await usersData.set(userID, user);

    return api.sendMessage(`# Claim Daily\n\n- Euro: 3€\n- Exp: Dalam Proses\n\nKetik "euro" untuk mengklaim.`, event.threadID);
  },

  onChat: async function ({ api, event, usersData }) {
    const userID = event.senderID;
    const user = await usersData.get(userID) || { data: {} };

    if (event.body && event.body.toLowerCase() === "euro" && user.data.progress === "daily") {
      try {
        const now = moment.tz("Asia/Jakarta");

        user.money = (user.money || 0) + 3;
        user.data.lastDaily = now.format(); // Simpan waktu klaim di sini
        user.data.progress = "none";

        await usersData.set(userID, user);

        return api.sendMessage(`${user.name || "Pengguna"} berhasil mengambil 3€`, event.threadID);
      } catch (error) {
        console.error("Gagal klaim daily:", error);
        return api.sendMessage("Terjadi kesalahan saat klaim daily. Silakan coba lagi nanti.", event.threadID);
      }
    }
  }
}