const axios = require("axios");

module.exports = {
  config: {
    name: "pin",
    version: "1.0.0",
    author: "Luxion",
    countDown: 15,
    role: 0,
    description: "Mencari gambar dari Pinterest berdasarkan kata kunci"
  },

  onStart: async function ({ api, args, event }) {
    const keyword = args.join(" ");
    if (!keyword) {
      return api.sendMessage("Masukkan kata kunci untuk dicari.", event.threadID, event.messageID);
    }

    try {
      const search = await axios.get(`https://api.ferdev.my.id/search/pinterest?query=${encodeURIComponent(keyword)}&apikey=key-gpt`);
      const result = search.data.data;

      if (!result || result.length === 0) {
        return api.sendMessage("Tidak ditemukan hasil untuk kata kunci tersebut.", event.threadID, event.messageID);
      }

      const imageUrl = result[Math.floor(Math.random() * result.length)];
      const response = await axios.get(imageUrl, { responseType: "stream" });

      api.sendMessage({attachment: response.data}, event.threadID, event.messageID);

    } catch (err) {
      console.error(err);
      api.sendMessage("Terjadi kesalahan saat mencari gambar.", event.threadID, event.messageID);
    }
  }
};