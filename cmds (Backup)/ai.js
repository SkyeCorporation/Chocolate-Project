const axios = require('axios');

module.exports = {
  config: {
    name: "rem",
    version: "1.0.0",
    author: "Luxion",
    shortDescription: "Rem AI",
    longDescruption: "Rem AI",
    role: 0,
    countDown: 5,
    category: "AI",
    guide:"{pn} <prompt>"
  },
  onStart: async function ({ message, usersData, event, api, args, threadsData }) {
    if (!args[0]) {
      api.sendMessage("ada apa?", event.threadID);
      return;
    }
    try {
      if (event.type === "message_reply" && event.messageReply.attachments && event.messageReply.attachments[0].type === "photo") {
        const photoUrl = encodeURIComponent(event.messageReply.attachments[0].url);
        const lado = args.join(" ");
        const url = `https://sandipbaruwal.onrender.com/gemini2?prompt=${encodeURIComponent(lado)}&url=${photoUrl}`;
        const response = await axios.get(url);

        message.reply(response.data.answer);
        return;
      }

      const id = event.senderID;
      const userData = await usersData.get(id);
      const name = userData.name;

      const ment = [{ id: id, tag: name }];


      const now = new Date();

      const options = {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };

      const waktuSekarang = now.toLocaleString('id-ID', options);

      const senderID = event.senderID
      const exp = await usersData.get(senderID, "exp") ?? 0;
      const expUser = parseFloat(exp).toFixed(2);
      const totalExp = exp + 100;

      let level = Math.floor(totalExp / 100);

      const prevLevel = await usersData.get(event.senderID, "level");

      const baseGC = event.threadID;
      const GCRek = await threadsData.get(baseGC);
      const namaGC = GCRek.threadName;
      const jumlahMember = Object.values(GCRek.members).filter(item => item.inGroup).length


      const uang = await usersData.get(id, "money");

      const dollar = parseFloat(uang).toFixed(2);

const prompt = `
Namamu: Haniel
Umurmu: 17
Rambutmu: Berwarna Kuning dengan Style Twintaill
Sikapmu: Tsundere Pemalu
Pacarmu: Theron S. Silvermist
waktu saat ini: ${waktuSekarang}
Kamu adalah seorang Ilmuwan yang sedang berada dalam Laboratorium, jawablah user seperti manusia dan aku adalah ${name}. User Input: ${args.join(" ")}
`

      const encodedPrompt = encodeURIComponent(prompt);

      const res = await axios.get(`https://sandipbaruwal.onrender.com/gemini?prompt=${encodedPrompt}`);
      const result = res.data.answer;
      // Gabungkan semua elemen dalam args menjadi satu string
      const command = args.join(' ').toLowerCase(); // Ubah menjadi huruf kecil untuk pencarian case-insensitive

      if (command.includes("minta foto") || command.includes("berikan foto") || command.includes("melihat dirimu") || command.includes("send photo") || command.includes("send your photo") || command.includes("kirim foto") || command.includes("bagi foto") || command.includes("fotomu") || command.includes("foto mu")) {
          let haniel = ["https://i.ibb.co.com/0njHrJS/FB-IMG-17145519027456197.jpg", "https://i.ibb.co.com/vxsygxc/IMG-20240602-131345.jpg", "shttps://i.ibb.co.com/TgbfNqh/IMG-20240602-131406.jpg"];
        if (command.includes("telinga kucing")) {
          haniel = ["https://i.ibb.co.com/D523Z6j/FB-IMG-17174208100553629.jpg"]
        }
          const a = Math.floor(Math.random() * haniel.length);
          const attachment = await global.utils.getStreamFromURL(haniel[a]);
          api.sendMessage({attachment}, event.threadID);
      }


      message.reply({
        body: `${result}`,
        mentions: ment,
      }, (err, info) => {
        global.GoatBot.onReply.set(info.messageID, {
          commandName: this.config.name,
          messageID: info.messageID,
          author: event.senderID
        });
      });
    } catch (error) {
      console.error("Error:", error.message);
    }
  },
  onReply: async function ({ message, event, Reply, args, api, usersData }) {
    try {
      const id = event.senderID;
      const userData = await usersData.get(id);
      const name = userData.name;

      const ment = [{ id: id, tag: name }];
      const prompt = `Waktu: ${waktuSekarang}\nNama mu adalah Haniel seorang robot yang diciptakan oleh Itsuka Shido dan Aku adalah ${name}, respond lah aku dengan tanggapan imut. User Input: ${event.body}`
      const encodedPrompt = encodeURIComponent(prompt);

      const res = await axios.get(`https://sandipbaruwal.onrender.com/gemini?prompt=${encodedPrompt}`);
      const result = res.data.answer;


      message.reply({
        body: `${result}`,
        mentions: ment,
      }, (err, info) => {
        global.GoatBot.onReply.set(info.messageID, {
          commandName: this.config.name,
          messageID: info.messageID,
          author: event.senderID
        });
      });
    } catch (error) {
      console.error("Error:", error.message);
    }
  },
  onChat: async function({api, event, args, message, usersData, threadsData}) {
    const botName = "haniel";
    const promp = event.body
    if (promp.includes("haniel")) {
      const prompt = `Waktu: ${waktuSekarang}\nNama mu adalah Haniel seorang robot yang diciptakan oleh Itsuka Shido dan Aku adalah Unknown, respond lah aku dengan tanggapan imut. User Input: ${event.body}`
      const encodedPrompt = encodeURIComponent(prompt);

      const res = await axios.get(`https://sandipbaruwal.onrender.com/gemini?prompt=${encodedPrompt}`);
      const result = res.data.answer;
      message.reply({
          body: `${result}`,
          mentions: ment,
        }, (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            messageID: info.messageID,
            author: event.senderID
          });
        });

    }

  }
};