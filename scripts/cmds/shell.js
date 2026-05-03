const { exec } = require("child_process");

module.exports = {
  config: {
    name: "shell",
    version: "1.0.0",
    author: "Luxion",
    countDown: 0,
    role: 2,
    description: "Jalankan perintah shell",
    category: "system"
  },

  onStart: async function ({ api, event, args }) {
    // Gabung command
    const cmd = args.join(" ");

    if (!cmd) {
      return api.sendMessage("⚠️ Masukkan command shell.", event.threadID);
    }

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return api.sendMessage(`Error:\n${error.message}`, event.threadID);
      }

      if (stderr) {
        return api.sendMessage(`⚠️ Stderr:\n${stderr}`, event.threadID);
      }

      if (!stdout) stdout = "✅ Command berhasil dijalankan (no output)";

      api.sendMessage(`💻 Output:\n${stdout}`, event.threadID);
    });
  }
};