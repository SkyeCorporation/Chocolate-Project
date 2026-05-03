module.exports = {
	config: {
		name: "setleave",
		aliases: ["setl"],
		version: "1.7",
		author: "NTKhang",
		countDown: 5,
		role: 0,
		description: {
			vi: "Chỉnh sửa nội dung/bật/tắt tin nhắn tạm biệt thành viên rời khỏi nhóm chat của bạn",
			en: "Edit content/turn on/off leave message when member leave your group chat"
		},
		category: "custom",
		guide: {
			vi: {
				body: "   {pn} on: Bật tin nhắn tạm biệt"
					+ "\n   {pn} off: Tắt tin nhắn tạm biệt"
					+ "\n   {pn} text [<nội dung> | reset]: chỉnh sửa nội dung văn bản hoặc reset về mặc định, những shortcut có sẵn:"
					+ "\n  + {userName}: tên của thành viên rời khỏi nhóm"
					+ "\n  + {userNameTag}: tên của thành viên rời khỏi nhóm (tag)"
					+ "\n  + {boxName}:  tên của nhóm chat"
					+ "\n  + {type}: tự rời/bị qtv xóa khỏi nhóm"
					+ "\n  + {session}:  buổi trong ngày"
					+ "\n\n   Ví dụ:"
					+ "\n    {pn} text {userName} đã {type} khỏi nhóm, see you again 🤧"
			},
			en: {
				body: "   {pn} on: Turn on leave message"
					+ "\n   {pn} off: Turn off leave message"
					+ "\n   {pn} text [<content> | reset]: edit text content or reset to default, available shortcuts:"
					+ "\n  + {userName}: name of member who leave group"
					+ "\n  + {userNameTag}: name of member who leave group (tag)"
					+ "\n  + {boxName}: name of group chat"
					+ "\n  + {type}: leave/kicked by admin"
					+ "\n  + {session}: session in day"
					+ "\n\n   Example:"
					+ "\n    {pn} text {userName} has {type} group, see you again 🤧"
			}
		}
	},

	langs: {
		vi: {
			turnedOn: "Bật tin nhắn tạm biệt thành công",
			turnedOff: "Tắt tin nhắn tạm biệt thành công",
			missingContent: "Vui lùng nhập nội dung tin nhắn",
			edited: "Đã chỉnh sửa nội dung tin nhắn tạm biệt của nhóm bạn thành:\n%1",
			reseted: "Đã reset nội dung tin nhắn tạm biệt",
			noFile: "Không có tệp đính kèm tin nhắn tạm biệt nào để xóa",
			resetedFile: "Đã reset tệp đính kèm thành công",
			missingFile: "Hãy phản hồi tin nhắn này kèm file ảnh/video/audio",
			addedFile: "Đã thêm %1 tệp đính kèm vào tin nhắn tạm biệt của nhóm bạn"
		},
		en: {
			turnedOn: "Turned on leave message successfully",
			turnedOff: "Turned off leave message successfully",
			missingContent: "Please enter content",
			edited: "Edited leave message content of your group to:\n%1",
			reseted: "Reseted leave message content",
			noFile: "No leave message attachment file to reset",
			resetedFile: "Reseted leave message attachment file successfully",
			missingFile: "Please reply this message with image/video/audio file",
			addedFile: "Added %1 attachment file to your leave message"
		}
	},

	onStart: async function ({ args, threadsData, message, event, commandName, getLang }) {
		const { threadID, senderID, body } = event;
		const { data, settings } = await threadsData.get(threadID);

		switch (args[0]) {
			case "text": {
				if (!args[1])
					return message.reply(getLang("missingContent"));
				else if (args[1] == "reset")
					delete data.leaveMessage;
				else
					data.leaveMessage = body.slice(body.indexOf(args[0]) + args[0].length).trim();
				await threadsData.set(threadID, {
					data
				});
				message.reply(data.leaveMessage ? getLang("edited", data.leaveMessage) : getLang("reseted"));
				break;
			}
			case "on":
			case "off": {
				settings.sendLeaveMessage = args[0] == "on";
				await threadsData.set(threadID, { settings });
				message.reply(getLang(args[0] == "on" ? "turnedOn" : "turnedOff"));
				break;
			}
			default:
				message.SyntaxError();
				break;
		}
	}
};
