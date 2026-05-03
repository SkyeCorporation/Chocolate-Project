const axios = require("axios");
const { Readable } = require("stream");

module.exports = {
  config: {
    name: "upscale",
    version: "1.2.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: "Memperbesar kualitas attachment",
    category: "Tools"
  },

  onStart: async function ({ api, event, usersData }) {
    const userID = event.senderID;
    const user = await usersData.get(userID) || { data: {} };

    if (user.data.progress && user.data.progress !== "none") {
      return api.sendMessage(`Kamu sedang berada dalam progres ${user.data.progress}`, event.threadID);
    }

    user.data.progress = "upscale";
    await usersData.set(userID, user);
    api.sendMessage("Kirimkan attachments.", event.threadID);
  },

  onChat: async function ({ api, event, usersData }) {
    const userID = event.senderID;
    const user = await usersData.get(userID) || { data: {} };

    if (
      user.data.progress === "upscale" &&
      event.attachments &&
      event.attachments.length > 0
    ) {
      try {
        api.sendMessage("Sedang memproses attachment, mohon tunggu...", event.threadID);

        const imageUrl = event.attachments[0].url;

        const apiUrl = `https://api.popcat.xyz/image/upscale?image=${encodeURIComponent(imageUrl)}`;

        // 🔥 ambil sebagai buffer
        const response = await axios.get(apiUrl, {
          responseType: "arraybuffer"
        });

        // convert ke stream
        const stream = Readable.from(response.data);

        // Kirim gambar hasil upscale
        api.sendMessage({ attachment: stream }, event.threadID);

      } catch (error) {
        console.error("Upscale error:", error.message);
        api.sendMessage("Terjadi kesalahan saat memproses attachment. Coba lagi nanti.", event.threadID);
      } finally {
        user.data.progress = "none";
        await usersData.set(userID, user);
      }
    }
  }
};