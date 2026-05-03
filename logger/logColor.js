const { colors } = require('../fb-chat-api/func/colors.js');
module.exports = (color, message) => console.log(colors.hex(color, message));