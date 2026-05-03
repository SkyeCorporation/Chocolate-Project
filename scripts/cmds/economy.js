const assigningUsers = new Set();
const assigningGroups = new Set();

async function assignIDuser(senderID, usersData) {
	if (!senderID || isNaN(senderID)) return;
	if (assigningUsers.has(senderID)) return;
	const userData = global.db.allUserData.find(u => u.userID == senderID);
	if (!userData) return;
	if (userData.data && userData.data.IDuser) return;
	assigningUsers.add(senderID);
	try {
		if (!userData.data) userData.data = {};
		if (userData.data.IDuser) return;
		const maxID = global.db.allUserData.reduce((max, u) => Math.max(max, (u.data && u.data.IDuser) || 0), 0);
		userData.data.IDuser = maxID + 1;
		await usersData.set(senderID, maxID + 1, "data.IDuser");
	} catch (e) {
		console.error("assignIDuser error:", e.message);
	} finally {
		assigningUsers.delete(senderID);
	}
}

async function assignIDgroup(threadID, threadsData) {
	if (!threadID || isNaN(threadID)) return;
	if (assigningGroups.has(threadID)) return;
	const threadData = global.db.allThreadData.find(t => t.threadID == threadID);
	if (!threadData) return;
	if (threadData.data && threadData.data.IDgroup) return;
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
		console.error("assignIDgroup error:", e.message);
	} finally {
		assigningGroups.delete(threadID);
	}
}

module.exports = {
	config: {
		name: "economy",
		version: "1.0",
		author: "Custom",
		countDown: 0,
		role: 0,
		description: { en: "Economy and ID auto-assignment system" },
		category: "system"
	},

	onStart: async function () {},

	onChat: async function ({ event, usersData, threadsData }) {
		const { senderID, threadID, isGroup } = event;
		if (!senderID || isNaN(senderID)) return;

		const userData = global.db.allUserData.find(u => u.userID == senderID);
		if (!userData) return;

		await assignIDuser(senderID, usersData);

		if (isGroup && threadID && !isNaN(threadID)) {
			await assignIDgroup(threadID, threadsData);
		}

		const moneyGain = parseFloat((0.04 + Math.random() * 0.86).toFixed(4));
		const expGain = Math.floor(1 + Math.random() * 5);

		const currentMoney = parseFloat(userData.money || 0);
		const currentExp = parseInt(userData.exp || 0);

		await usersData.set(senderID, currentMoney + moneyGain, "money");
		await usersData.set(senderID, currentExp + expGain, "exp");
	}
};
