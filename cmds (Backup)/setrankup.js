module.exports = {
	config: {
		name: "setrankup",
		version: "1.2",
		author: "NTKhang",
		countDown: 0,
		role: 0,
		description: {
			vi: "Cấu hình rankup",
			en: "Configure rankup"
		},
		category: "owner",
		guide: {
			vi: "   {pn} text <message>: Cấu hình tin nhắn khi thành viên thăng hạng trong box chat của bạn"
				+ "\n   Với các tham số sau:"
				+ "\n    + {userName}: Tên thành viên"
				+ "\n    + {userNameTag}: Tag tên thành viên"
				+ "\n    + {oldRank}: Rank cũ của thành viên"
				+ "\n    + {currentRank}: Rank hiện tại của thành viên"
				+ "\n   {pn} reset: Đặt lại cấu hình mặc định",
			en: "   {pn} text <message>: Configure the message when a member rankup in your chatbox"
				+ "\n   With the following parameters:"
				+ "\n    + {userName}: Member's name"
				+ "\n    + {userNameTag}: Tag member's name"
				+ "\n    + {oldRank}: Member's old rank"
				+ "\n    + {currentRank}: Member's current rank"
				+ "\n   {pn} reset: Reset to default configuration"
		}
	},

	langs: {
		vi: {
			changedMessage: "Đã thay đổi tin nhắn rankup thành: %1",
			missingAttachment: "Bạn phải đính kèm ảnh để cấu hình ảnh rankup",
			changedAttachment: "Đã thêm %1 tệp đính kèm vào rankup thành công"
		},
		en: {
			changedMessage: "Changed rankup message to: %1",
			missingAttachment: "You must attach an image to configure the rankup image",
			changedAttachment: "Successfully added %1 attachment to rankup"
		}
	},

	onStart: async function ({ args, message, event, threadsData, getLang }) {
		const { body, threadID, senderID } = event;
		switch (args[0]) {
			case "text": {
				const newContent = body.slice(body.indexOf("text") + 5);
				await threadsData.set(threadID, newContent, "data.rankup.message");
				return message.reply(getLang("changedMessage", newContent));
			}
		}
	}
};

