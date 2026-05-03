const axios = require("axios");
require("dotenv").config();

module.exports = {
  config: {
    name: "grook",
    version: "1.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: "Testing grook AI",
    category: "AI"
  },

  onStart: async function({ api, args, usersData, message }) {
    const prompt = args.join(" ");
    const API_KEY = process.env.XAI_API_KEY;

    try {
      const response = await axios.post(
        "https://api.x.ai/v1/chat/completions",
        {
          model: "grok-4",
          messages: [{ role: "user", content: prompt }]
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      const grokReply = response.data.choices[0].message.content;
      return message.reply(grokReply);

    } catch (error) {
      console.error("Error:", error.response?.data || error.message);
      return message.reply("❌ Terjadi kesalahan saat menghubungi Grok AI.");
    }
  }
};