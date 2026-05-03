process.env.BOT_INSTANCE = "shary";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const log = require("./logger/log.js");

const LOG_DIR = "/tmp/bot-logs";
const LOG_FILE = path.join(LOG_DIR, "shary.log");
const MAX_LOG_BYTES = 5 * 1024 * 1024;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function rotateIfBig() {
	try {
		if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
			const data = fs.readFileSync(LOG_FILE, "utf8");
			fs.writeFileSync(LOG_FILE, data.slice(-Math.floor(MAX_LOG_BYTES / 2)));
		}
	} catch (e) {}
}

function startProject() {
	try { fs.writeFileSync(LOG_FILE, ""); } catch (e) {}
	const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

	const child = spawn("node", ["Goat.js"], {
		cwd: __dirname,
		stdio: ["inherit", "pipe", "pipe"],
		shell: true,
		env: { ...process.env, BOT_INSTANCE: "shary" }
	});

	child.stdout.on("data", (data) => {
		process.stdout.write(data);
		logStream.write(data);
		rotateIfBig();
	});
	child.stderr.on("data", (data) => {
		process.stderr.write(data);
		logStream.write(data);
		rotateIfBig();
	});

	child.on("close", (code) => {
		try { logStream.end(); } catch (e) {}
		if (code == 2) {
			log.info("Restarting Shary Bot...");
			startProject();
		}
	});
}

startProject();
