module.exports = {
  config: {
    name: "profile",
    version: "1.0", 
    countDown: 6,
    role: 0,
  }, 
  onStart: async function ({ api, event, args}) {
    const user = await usersData.get(event.senderID);
    api.sendMessage(`Name: ${user.name}`, event.threadID);
    
  }
}