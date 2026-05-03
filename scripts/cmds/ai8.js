const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({
  apiKey: "REDACTED_GROQ_KEY",
  baseURL: "https://api.groq.com/openai/v1",
});

const brainPath = path.join(__dirname, "stellaBrain.json");

if (!fs.existsSync(brainPath)) {
  fs.writeFileSync(brainPath, JSON.stringify({}, null, 2));
}

function loadBrain() {
  return JSON.parse(fs.readFileSync(brainPath, "utf8"));
}

function saveMemory(senderID, userMsg, stellaMsg) {
  const brain = loadBrain();

  if (!brain[senderID]) brain[senderID] = [];

  brain[senderID].push(
    { role: "user", content: userMsg },
    { role: "assistant", content: stellaMsg }
  );

  brain[senderID] = brain[senderID].slice(-20);

  fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2));
}

module.exports = {
  config: {
    name: "stella",
    version: "1.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: " Ngobrol sama Stella"
  },

  onStart: async function ({ api, event, args }) {
    const userMsg = args.join(" ") || "Halo";
    const brain = loadBrain();
    const history = brain[event.senderID] || [];

    try {
      const response = await client.responses.create({
        model: "openai/gpt-oss-20b",
        input: [
          {
            role: "system",
            content:
              "Kamu adalah Stella, seorang gadis AI yang diciptakan oleh Luxion. Kamu setia, hangat, dan selalu mengingat percakapan dengan user."
          },
          ...history,
          {
            role: "user",
            content: userMsg
          }
        ]
      });

      const reply = response.output_text;

      api.sendMessage(reply, event.threadID);

      saveMemory(event.senderID, userMsg, reply);

    } catch (err) {
      console.error(err);
      api.sendMessage("Stella lagi error sebentar 😿", event.threadID);
    }
  }
};