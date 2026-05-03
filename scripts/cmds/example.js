module.exports =  {
  config: {
    name: "",
    version: 1.0,
    author: "Admin",
    description: "Example command",
    usage: "example",
    cooldown: 5,
    role: 0
  },
  onStart: async function({ api, event, args, message }) {
    api.sendMessage("Nyaw~", event.threadID);
    
  }
}