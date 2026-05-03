const axios = require("axios");

module.exports = {
  config: {
    name: "removebg",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: "Menghapus background",
    category: "Tools"
  },

  onStart: async function ({ api, event, usersData }) {
    const userID = event.senderID;
    const user = await usersData.get(userID) || { data: {} };

    if (user.data.progress && user.data.progress !== "none") {
      return api.sendMessage(`Kamu sedang berada dalam progres ${user.data.progress}`, event.threadID);
    }

    user.data.progress = "remove background";
    await usersData.set(userID, user);
    api.sendMessage("Kirimkan attachments.", event.threadID);
  },

  onChat: async function ({ api, event, usersData }) {
    const userID = event.senderID;
    const user = await usersData.get(userID) || { data: {} };

    if (user.data.progress === "remove background" && event.attachments && event.attachments.length > 0) {
      try {
        api.sendMessage("Sedang memproses attachment, mohon tunggu...", event.threadID);

          const imageUrl = event.attachments[0].url

        const apiUrl = `https://api.ferdev.my.id/tools/removebg?link=${encodeURIComponent(imageUrl)}&apikey=key-gpt`;

        const response = await axios.get(apiUrl);
        if (!response.data || !response.data.data) {
          throw new Error("Gagal mendapatkan hasil.");
        }

        const imageStream = await axios.get(response.data.data, { responseType: "stream" });

        // Kirim gambar hasil upscale
        api.sendMessage({ attachment: imageStream.data }, event.threadID);

      } catch (error) {
        console.error("Upscale error:", error.message);
        api.sendMessage("Terjadi kesalahan saat memproses attachment. Coba lagi nanti.", event.threadID);
      } finally {
        // Reset progres setelah selesai atau gagal
        user.data.progress = "none";
        await usersData.set(userID, user);
      }
    }
  }
};