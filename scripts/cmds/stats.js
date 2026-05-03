module.exports = {
  config: {
    name: "stats",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    description: "membuka stats",
    category: "Economy"
  },
  onStart: async function ({ api, event, usersData, args}) {
    const userID = event.senderID;
    const user = await usersData.get(userID)
    api.sendMessage(`# User Stats\n\n- Name ${user.name}\n- Money: ${user.money}€\n- Level: Unknown`, event.threadID);
  }
}