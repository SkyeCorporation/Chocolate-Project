const fs = require("fs");
const { loadImage, createCanvas, registerFont } = require("canvas");
const axios = require("axios");
const path = require("path");

const userTitles = {};

module.exports = {
  config: {
    name: "status",
    version: "1.0.0",
    author: "Luxion",
    countDown: 0,
    role: 2,
    shortDescription: "membuka status",
    longDescription: "membuka status pengguna",
    category: "helper",
    guide: "{pn} <id>",
  },
  onStart: async function ({ api, event, args, message, usersData }) {
    try {
      const senderID = event.senderID;
      const user = await usersData.get(senderID);
      const userName = user.data?.nick || user.name;

     const pathImg = path.join(`./status.png`);
     const pathAvatar = path.join(`./status.png`);

      const bgImage = (
        await axios.get(
          "https://i.postimg.cc/PqNXR7J4/FB-IMG-17473247973120817.jpg",
          { responseType: "arraybuffer" }
        )
      ).data;

      fs.writeFileSync(pathImg, Buffer.from(bgImage, "utf-8"));

      const baseImage = await loadImage(pathImg);
      const canvas = createCanvas(baseImage.width, baseImage.height);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

      const fontPath = path.join("./scripts/Play-Bold.ttf");
      registerFont(fontPath, { family: "Play-Bold" });

      ctx.font = `50px Play-Bold`;
      ctx.fillStyle = "#F5F5F5";
      ctx.textAlign = "start";
      ctx.fillText(`${userName}`, 300, 350);

     const imageBuffer = canvas.toBuffer("image/png");
       fs.writeFileSync(pathImg, imageBuffer);

      return api.sendMessage(
        {
          attachment: fs.createReadStream(pathImg),
        },
        event.threadID
      );
    } catch (err) {
      console.error("Error in status command:", err);
      return api.sendMessage(`Terjadi kesalahan saat memproses status.\n${err}`, event.threadID);
    }
  },
};