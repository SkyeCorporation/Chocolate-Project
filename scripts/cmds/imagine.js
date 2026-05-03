const axios = require("axios");
const { Readable } = require("stream");

const WORKER_URL = "https://amagi-worker.luxion829.workers.dev";

module.exports = {
  config: {
    name: "imagine",
    version: "2.2.0",
    author: "Luxion",
    countDown: 15,
    role: 0,
    description: "Generate gambar dari teks menggunakan Cloudflare AI",
    category: "AI",
    guide: {
      en: "{pn} <prompt>\nContoh: {pn} anime girl with silver hair in forest"
    }
  },

  onStart: async function ({ api, args, event }) {
    const prompt = args.join(" ").trim();

    if (!prompt) {
      return api.sendMessage(
        "Masukkan deskripsi gambar.\nContoh: .imagine anime girl with silver hair in forest",
        event.threadID,
        event.messageID
      );
    }

    api.sendMessage(
      "⏳ Mohon menunggu sekitar 10 hingga 30 detik...",
      event.threadID
    );

    try {
      const response = await axios.get(WORKER_URL, {
        params: { prompt },
        responseType: "arraybuffer",
        timeout: 60000
      });

      const contentType = response.headers["content-type"] || "";
      if (!contentType.includes("image")) {
        throw new Error("Bukan gambar: " + contentType);
      }

      const imageBuffer = Buffer.from(response.data);
      const imageStream = Readable.from(imageBuffer);
      imageStream.path = "image.jpg";

      api.sendMessage({ attachment: imageStream }, event.threadID);
    } catch (error) {
      console.error("imagine error:", error.message);
      api.sendMessage(
        "Gagal membuat gambar. Coba lagi nanti.",
        event.threadID,
        event.messageID
      );
    }
  }
};
