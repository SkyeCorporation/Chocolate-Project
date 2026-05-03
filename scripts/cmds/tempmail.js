const axios = require("axios");

module.exports = {
  config: {
    name: "tempmail",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: "Membuat email sementara",
  },

  onStart: async function ({ api, event, args }) {
    const option = args[0];
    if (!option) {
      return api.sendMessage(
        "📩 Pilih opsi:\n• gen → buat email\n• inbox [id] → cek kotak masuk",
        event.threadID
      );
    }

    const apiUrl = {
      generateEmail: "https://api.ferdev.my.id/internet/tempmail?apikey=key-gpt",
      checkMailBox: (id) =>
        `https://api.ferdev.my.id/internet/mailbox?id=${id}&apikey=key-gpt`,
    };

    try {
      if (option === "gen") {
        const res = await axios.get(apiUrl.generateEmail);
        const data = res.data;

        if (data.success && data.data) {
          const email = data.data.addresses[0].address;
          const id = data.data.id;
          const exp = data.data.expiresAt;

          return api.sendMessage(
            `— Email sementara —\n${email}\n\n• ID: ${id}\n\nCek inbox:\n.tempmail inbox ${id}`,
            event.threadID
          );
        } else {
          return api.sendMessage("❌ Gagal membuat email.", event.threadID);
        }
      }

      if (option === "inbox") {
        const id = args[1];
        if (!id) {
          return api.sendMessage(
            "❗ Gunakan: tempmail inbox [id]",
            event.threadID
          );
        }

        const res = await axios.get(apiUrl.checkMailBox(id));
        const mails = res.data.data?.mails;

        if (!Array.isArray(mails) || mails.length === 0) {
          return api.sendMessage("📭 Belum ada email masuk.", event.threadID);
        }

        let msg = `📥 ${mails.length} email diterima:\n\n`;
        for (let i = 0; i < mails.length; i++) {
          const mail = mails[i];
          msg += `#${i + 1}\nFrom: ${mail.from?.address || "-"}\nSubj: ${mail.subject || "-"}\n${mail.text?.slice(0, 100) || "-"}\n\n`;
        }

        return api.sendMessage(msg.trim(), event.threadID);
      }

      return api.sendMessage("❗ Opsi tidak dikenali. Gunakan: gen / inbox [id]", event.threadID);
    } catch (err) {
      console.error(err);
      return api.sendMessage("❌ Error saat menghubungi API.", event.threadID);
    }
  },
};