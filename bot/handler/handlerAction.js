const createFuncMessage = global.utils.message;
const handlerCheckDB = require("./handlerCheckData.js");
const fs = require("fs-extra");
const path = require("path");

const REG_FILE_PRIMARY = path.join(process.cwd(), "registeredGroup.json");
const REG_FILE_SECONDARY = path.join(process.cwd(), "registeredGroup2.json");
const REG_FILE_TERTIARY = path.join(process.cwd(), "registeredGroup3.json");

function getRegisteredGroups(filePath) {
        try {
                if (fs.existsSync(filePath))
                        return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (e) {}
        return [];
}

function isSecondaryBot(api) {
        try {
                const botID = api && api.getCurrentUserID ? api.getCurrentUserID() : null;
                const primaryID = global.GoatBot.botID;
                return !!(botID && primaryID && botID !== primaryID);
        } catch (e) {
                return false;
        }
}

const assigningUsers = new Set();
const assigningGroups = new Set();

async function assignIDuser(senderID, usersData) {
        if (!senderID || isNaN(senderID)) return;
        const userData = global.db.allUserData.find(u => u.userID == senderID);
        if (!userData) return;
        if (userData.data && userData.data.IDuser) return;
        if (assigningUsers.has(senderID)) return;
        assigningUsers.add(senderID);
        try {
                if (!userData.data) userData.data = {};
                if (userData.data.IDuser) return;
                const maxID = global.db.allUserData.reduce(
                        (max, u) => Math.max(max, (u.data && u.data.IDuser) || 0), 0
                );
                userData.data.IDuser = maxID + 1;
                await usersData.set(senderID, maxID + 1, "data.IDuser");
        } catch (e) {
                console.error("[assignIDuser]", e.message);
        } finally {
                assigningUsers.delete(senderID);
        }
}

async function assignIDgroup(threadID, threadsData) {
        if (!threadID || isNaN(threadID)) return;
        const threadData = global.db.allThreadData.find(t => t.threadID == threadID);
        if (!threadData) return;
        if (threadData.data && threadData.data.IDgroup) return;
        if (assigningGroups.has(threadID)) return;
        assigningGroups.add(threadID);
        try {
                if (!threadData.data) threadData.data = {};
                if (threadData.data.IDgroup) return;
                const maxID = global.db.allThreadData
                        .filter(t => t.isGroup)
                        .reduce((max, t) => Math.max(max, (t.data && t.data.IDgroup) || 0), 0);
                threadData.data.IDgroup = maxID + 1;
                await threadsData.set(threadID, maxID + 1, "data.IDgroup");
        } catch (e) {
                console.error("[assignIDgroup]", e.message);
        } finally {
                assigningGroups.delete(threadID);
        }
}

module.exports = (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) => {
        const handlerEvents = require(process.env.NODE_ENV == "development" ? "./handlerEvents.dev.js" : "./handlerEvents.js")(
                api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData
        );

        const botInst = process.env.BOT_INSTANCE;
        const regFile = botInst === "rem" ? REG_FILE_SECONDARY
                : botInst === "shary" ? REG_FILE_TERTIARY
                : botInst === "amagi" ? REG_FILE_PRIMARY
                : (isSecondaryBot(api) ? REG_FILE_SECONDARY : REG_FILE_PRIMARY);

        return async function (event) {
                if (
                        global.GoatBot.config.antiInbox == true &&
                        (event.senderID == event.threadID || event.userID == event.senderID || event.isGroup == false) &&
                        (event.senderID || event.userID || event.isGroup == false)
                ) return;

                const message = createFuncMessage(api, event);
                await handlerCheckDB(usersData, threadsData, event);

                const senderID = (event.senderID || event.userID || event.author || "").toString();
                const threadID = (event.threadID || "").toString();

                // Assign sequential IDs for all users/groups regardless of registration
                await assignIDuser(senderID, usersData);
                if (event.isGroup && threadID && !isNaN(threadID)) {
                        await assignIDgroup(threadID, threadsData);
                }

                const handlerChat = await handlerEvents(event, message);
                if (!handlerChat) return;

                const {
                        onAnyEvent, onFirstChat, onStart, onChat,
                        onReply, onEvent, handlerEvent, onReaction,
                        typ, presence, read_receipt
                } = handlerChat;

                const adminBot = (global.GoatBot.config.adminBot || []).map(id => id.toString());
                const isAdminUser = adminBot.includes(senderID);
                const registeredGroups = getRegisteredGroups(regFile).map(id => id.toString());
                const isRegisteredGroup = registeredGroups.includes(threadID);

                if (!isRegisteredGroup) {
                        if (!isAdminUser) return;
                        // Admin in unregistered group: only allow commands
                        onStart();
                        return;
                }

                onAnyEvent();
                switch (event.type) {
                        case "message":
                        case "message_reply":
                        case "message_unsend":
                                onFirstChat();
                                onChat();
                                onStart();
                                onReply();
                                break;
                        case "event":
                                handlerEvent();
                                onEvent();
                                break;
                        case "message_reaction":
                                onReaction();
                                break;
                        case "typ":
                                typ();
                                break;
                        case "presence":
                                presence();
                                break;
                        case "read_receipt":
                                read_receipt();
                                break;
                        default:
                                break;
                }
        };
};
