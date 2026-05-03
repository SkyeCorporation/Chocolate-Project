module.exports = {
  name: "hallo",
  description: "Menyapa pengguna",
  execute: async (api, message) => {
    try {
      await api.sendMessage("nasi", message.threadID);
    } catch (error) {
      console.error("Gagal mengirim pesan:", error);
    }
  },
};
