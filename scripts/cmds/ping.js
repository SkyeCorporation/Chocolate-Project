module.exports = {
  config: {
    name: "ping",
    version: "1.0.0",
    author: "Amagi",
    countDown: 5,
    role: 0,
    shortDescription: "Cek koneksi bot",
    longDescription: "Mengirim respon pong untuk mengecek apakah bot aktif",
    category: "utility",
    guide: "{pn}",
  },
  onStart: async function ({ api, event }) {
    return api.sendMessage("Pong! 🏓", event.threadID);
  },
};
