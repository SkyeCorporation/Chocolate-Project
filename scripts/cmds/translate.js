const translate = require('translate-google');

module.exports = {
  config: {
    name: "tr",
    author: "Luxion",
    countDown: 10,
    role: 0,
    description: "Translate Text",
    category: "Tools"
  },

  onStart: async function ({ api, args, event, message }) {
    const lang = args[0];
    const text = args.slice(1).join(" ");

    if (!lang || !text) {
      return message.reply("Penggunaan: tr [kode_bahasa] [teks]\nContoh: tr en Halo dunia");
    }

    try {
      const result = await translate(text, { to: lang });
      message.reply(`# Hasil terjemahan\n\n${result}`);
    } catch (error) {
      console.error(error);
      message.reply("Terjadi kesalahan saat menerjemahkan teks.");
    }
  }
};