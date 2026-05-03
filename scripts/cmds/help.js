const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");
const { getPrefix } = global.utils;
const { commands, aliases } = global.GoatBot;

module.exports = {
  config: {
    name: "help",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    shortDescription: "Daftar Perintah",
    longDescription: "Melihat daftar perintah",
    category: "info",
    guide: "{pn}",
    priority: 1
  },

  onStart: async function ({ message, args, event, threadsData, role, api }) {
    const { threadID, senderID } = event;
    const threadData = await threadsData.get(threadID);
    const prefix = getPrefix(threadID);

    if (args.length === 0) {
      try {
        let msg = "# DAFTAR PERINTAH";
        const categories = {};

        for (const [name, value] of commands) {
          if (value.config.role > 1 && role < value.config.role) continue;
          const category = value.config.category || "Uncategorized";
          if (!categories[category]) categories[category] = [];
          categories[category].push(name);
        }

        for (const category in categories) {
          if (category.toLowerCase() === "info") continue;
          const cmds = categories[category].sort();
          msg += `\n\n• ${category.toUpperCase()} (${cmds.length})`;

          for (let i = 0; i < cmds.length; i += 3) {
            msg += `\n ${cmds.slice(i, i + 3).join(", ")}`;
          }
        }

        msg += `\n\nGunakan perintah: ${prefix}help <command> untuk informasi lebih lanjut.`;
        await api.sendMessage(msg, event.threadID);

      } catch (error) {
        api.sendMessage(`Terjadi kesalahan:\n${error.message}`, threadID);
      }

    } else {
      const commandName = args[0].toLowerCase();
      const command = commands.get(commandName) || commands.get(aliases.get(commandName));

      if (!command) {
        return message.reply(`Perintah "${commandName}" tidak ditemukan.`);
      }

      const config = command.config;
      const roleString = roleTextToString(config.role);
      const description = config.longDescription || config.shortDescription || "Tidak ada deskripsi.";
      const guide = (config.guide || "Tidak tersedia.").replace(/{pn}/g, prefix).replace(/{n}/g, config.name);
      const price = config.price ? `${config.price}$` : "Gratis";

      const response =
`# INFORMASI PERINTAH

• Nama: ${config.name}
• Deskripsi: ${description}
• Versi: ${config.version || "1.0.0"}
• Author: ${config.author || "Unknown"}
• Cooldown: ${config.countDown || 5} detik`;

      await api.sendMessage(response, threadID);
    }
  }
};

function roleTextToString(role) {
  switch (role) {
    case 0: return "0 (Pengguna)";
    case 1: return "1 (Admin Grup)";
    case 2: return "2 (Admin Bot)";
    default: return "Tidak diketahui";
  }
}