const fs = require("fs-extra");
const path = require("path");

function getRegFile(api) {
        const botInst = process.env.BOT_INSTANCE;
        if (botInst === "rem")
                return path.join(process.cwd(), "registeredGroup2.json");
        if (botInst === "shary")
                return path.join(process.cwd(), "registeredGroup3.json");
        if (botInst === "amagi")
                return path.join(process.cwd(), "registeredGroup.json");
        // Legacy fallback: compare bot IDs
        const botID = api && api.getCurrentUserID ? api.getCurrentUserID() : null;
        const primaryID = global.GoatBot.botID;
        if (botID && primaryID && botID !== primaryID)
                return path.join(process.cwd(), "registeredGroup2.json");
        return path.join(process.cwd(), "registeredGroup.json");
}

function readReg(filePath) {
        try {
                if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (e) {}
        return [];
}

function writeReg(filePath, data) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function findUserByIDuser(iduser) {
        const n = parseInt(iduser);
        if (isNaN(n)) return null;
        return global.db.allUserData.find(u => u.data && u.data.IDuser == n) || null;
}

function findThreadByIDgroup(idgroup) {
        const n = parseInt(idgroup);
        if (isNaN(n)) return null;
        return global.db.allThreadData.find(t => t.isGroup && t.data && t.data.IDgroup == n) || null;
}

const send = (api, threadID, text) => api.sendMessage(text, threadID);

module.exports = {
        config: {
                name: "c",
                version: "2.0",
                author: "Custom",
                countDown: 2,
                role: 2,
                description: { en: "Admin management: group register, user ban, info" },
                category: "admin",
                guide: {
                        en: [
                                "  {pn} gr [IDgroup]   - Register group",
                                "  {pn} ugr [IDgroup]  - Unregister group",
                                "  {pn} gi [IDgroup]   - Group info",
                                "  {pn} ban <IDuser>   - Ban user",
                                "  {pn} unban <IDuser> - Unban user",
                                "  {pn} ui [IDuser]    - User info"
                        ].join("\n")
                }
        },

        onStart: async function ({ args, api, event, usersData }) {
                const sub = (args[0] || "").toLowerCase();
                const param = args[1];
                const tid = event.threadID;

                // ─── GROUP REGISTER ────────────────────────────────────────
                if (sub === "gr") {
                        const regFile = getRegFile(api);
                        let targetThreadID;

                        if (param) {
                                const thread = findThreadByIDgroup(param);
                                if (!thread) return send(api, tid, `IDgroup ${param} tidak ditemukan.`);
                                targetThreadID = thread.threadID;
                        } else {
                                targetThreadID = tid;
                        }

                        const list = readReg(regFile);
                        if (list.includes(targetThreadID.toString()))
                                return send(api, tid, "Group sudah diregistrasi sebelumnya.");
                        list.push(targetThreadID.toString());
                        writeReg(regFile, list);
                        return send(api, tid, "Group berhasil diregistrasi.");
                }

                // ─── GROUP UNREGISTER ──────────────────────────────────────
                if (sub === "ugr") {
                        const regFile = getRegFile(api);
                        let targetThreadID;

                        if (param) {
                                const thread = findThreadByIDgroup(param);
                                if (!thread) return send(api, tid, `IDgroup ${param} tidak ditemukan.`);
                                targetThreadID = thread.threadID;
                        } else {
                                targetThreadID = tid;
                        }

                        const list = readReg(regFile);
                        const idx = list.indexOf(targetThreadID.toString());
                        if (idx === -1) return send(api, tid, "Group belum diregistrasi.");
                        list.splice(idx, 1);
                        writeReg(regFile, list);
                        return send(api, tid, "Group unregistered.");
                }

                // ─── GROUP INFO ────────────────────────────────────────────
                if (sub === "gi") {
                        let targetThreadID;

                        if (param) {
                                const thread = findThreadByIDgroup(param);
                                if (!thread) return send(api, tid, `IDgroup ${param} tidak ditemukan.`);
                                targetThreadID = thread.threadID;
                        } else {
                                targetThreadID = tid;
                        }

                        const threadData = global.db.allThreadData.find(t => t.threadID == targetThreadID);
                        const regFile = getRegFile(api);
                        const list = readReg(regFile);
                        const isRegistered = list.includes(targetThreadID.toString());

                        let threadInfo;
                        try {
                                threadInfo = await new Promise((resolve, reject) =>
                                        api.getThreadInfo(targetThreadID, (err, info) => err ? reject(err) : resolve(info))
                                );
                        } catch (e) {
                                threadInfo = null;
                        }

                        const groupName = (threadInfo && threadInfo.threadName) || (threadData && threadData.threadName) || "(No Name)";
                        const totalMembers = threadInfo ? (threadInfo.participantIDs || []).length : "N/A";
                        const totalAdmins = threadInfo ? (threadInfo.adminIDs || []).length : "N/A";
                        const IDgroup = (threadData && threadData.data && threadData.data.IDgroup) || "N/A";
                        const status = isRegistered ? "Registered" : "Unregistered";

                        return send(api, tid,
                                `[ Group Info ]\n` +
                                `Name: ${groupName}\n` +
                                `ID : ${targetThreadID}\n` +
                                `IDgroup: ${IDgroup}\n` +
                                `Members: ${totalMembers}\n` +
                                `Admins: ${totalAdmins}\n` +
                                `Status: ${status}`
                        );
                }

                // ─── BAN USER ─────────────────────────────────────────────
                if (sub === "ban") {
                        if (!param) return send(api, tid, "Usage: .c ban <IDuser>");
                        const userData = findUserByIDuser(param);
                        if (!userData) return send(api, tid, `IDuser ${param} tidak ditemukan.`);

                        const bannedInfo = userData.banned || {};
                        if (bannedInfo.status === true) return send(api, tid, `User #${param} sudah dalam status banned.`);

                        await usersData.set(userData.userID, {
                                status: true,
                                reason: "Banned by admin",
                                date: new Date().toISOString()
                        }, "banned");

                        return send(api, tid, `User #${param} (${userData.name}) berhasil dibanned.`);
                }

                // ─── UNBAN USER ───────────────────────────────────────────
                if (sub === "unban") {
                        if (!param) return send(api, tid, "Usage: .c unban <IDuser>");
                        const userData = findUserByIDuser(param);
                        if (!userData) return send(api, tid, `IDuser ${param} tidak ditemukan.`);

                        const bannedInfo = userData.banned || {};
                        if (!bannedInfo.status) return send(api, tid, `User #${param} tidak dalam status banned.`);

                        await usersData.set(userData.userID, { status: false, reason: "", date: "" }, "banned");
                        return send(api, tid, `User #${param} (${userData.name}) berhasil diunban.`);
                }

                // ─── USER INFO ────────────────────────────────────────────
                if (sub === "ui") {
                        let userData;

                        if (param) {
                                userData = findUserByIDuser(param);
                                if (!userData) return send(api, tid, `IDuser ${param} tidak ditemukan.`);
                        } else {
                                userData = global.db.allUserData.find(u => u.userID == event.senderID);
                                if (!userData) return send(api, tid, "Data user tidak ditemukan.");
                        }

                        const IDuser = (userData.data && userData.data.IDuser) || "N/A";
                        const banned = (userData.banned && userData.banned.status) ? "Banned" : "Active";
                        const money = parseFloat(userData.money || 0).toFixed(2);

                        return send(api, tid,
                                `[ User Info ]\n` +
                                `Name  : ${userData.name}\n` +
                                `IDuser: ${IDuser}\n` +
                                `Status: ${banned}\n` +
                                `Uang  : ${money}`
                        );
                }

                return send(api, tid,
                        "Subcommand tidak dikenal.\n" +
                        "gr / ugr / gi [IDgroup]\n" +
                        "ban / unban / ui [IDuser]"
                );
        }
};
