const axios = require("axios");
const ytdl = require("@distube/ytdl-core");
const fs = require("fs-extra");
const { getStreamFromURL, downloadFile, formatNumber } = global.utils;

async function getStreamAndSize(url, path = "") {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    headers: {
      'Range': 'bytes=0-'
    }
  });
  if (path)
    response.data.path = path;
  const totalLength = response.headers["content-length"];
  return {
    stream: response.data,
    size: totalLength
  };
}

module.exports = {
  config: {
    name: "yta",
    version: "1.0.0",
    author: "Luxion",
    countDown: 5,
    role: 0,
    shortDescription: "YouTube Audio Downloader",
    longDescription: "Download audio on YouTube",
    category: "media",
    guide: "{pn} <search query or youtube url>"
  },

  langs: {
    en: {
      error: "Terjadi Error: %1",
      noResult: "Tidak dapat menemukan: %1",
      choose: "Pilih audio yang ingin didownload:\n\n%1",
      downloading: "⬇️ Downloading audio \"%1\"",
      downloading2: "⬇️ Downloading audio \"%1\"\n🔃 Speed: %2MB/s\n⏸️ Downloaded: %3/%4MB (%5%)\n⏳ Estimated time remaining: %6 seconds",
      noAudio: "⭕ Maaf, tidak ada audio yang ditemukan dengan ukuran kurang dari 26MB",
      info: "💠 Title: %1\n🏪 Channel: %2\n👨‍👩‍👧‍👦 Subscriber: %3\n⏱ Duration: %4\n👀 View count: %5\n👍 Like count: %6\n🆙 Upload date: %7\n🔠 ID: %8\n🔗 Link: %9"
    }
  },

  onStart: async function ({ args, message, event, commandName, getLang, api }) {
    if (!args[0]) {
      return message.reply("Silakan masukkan kata kunci pencarian atau URL YouTube!");
    }

    const checkurl = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})(?:\S+)?$/;
    const urlYtb = checkurl.test(args[0]);

    if (urlYtb) {
      try {
        const infoVideo = await getVideoInfo(args[0]);
        await handle({ infoVideo, message, getLang });
      } catch (error) {
        return message.reply(getLang("error", error.message));
      }
      return;
    }

    let keyWord = args.join(" ");
    keyWord = keyWord.includes("?feature=share") ? keyWord.replace("?feature=share", "") : keyWord;
    const maxResults = 6;

    let result;
    try {
      result = (await search(keyWord)).slice(0, maxResults);
    }
    catch (err) {
      return message.reply(getLang("error", err.message));
    }

    if (result.length == 0)
      return message.reply(getLang("noResult", keyWord));

    let msg = "";
    let i = 1;

    for (const info of result) {
      msg += `${i++}. ${info.title}\n⏱️ ${info.time}\n📺 ${info.channel.name}\n\n`;
    }

    message.reply({
      body: getLang("choose", msg)
    }, (err, info) => {
      global.GoatBot.onReply.set(info.messageID, {
        commandName,
        messageID: info.messageID,
        author: event.senderID,
        result
      });
    });
  },

  onReply: async ({ event, api, Reply, message, getLang }) => {
    const { result } = Reply;
    const choice = event.body;

    if (!isNaN(choice) && choice <= result.length && choice > 0) {
      const infoChoice = result[choice - 1];
      const idvideo = infoChoice.id;

      try {
        const infoVideo = await getVideoInfo(idvideo);
        api.unsendMessage(Reply.messageID);
        await handle({ infoVideo, message, getLang });
      } catch (error) {
        api.unsendMessage(Reply.messageID);
        return message.reply(getLang("error", error.message));
      }
    }
    else {
      api.unsendMessage(Reply.messageID);
    }
  }
};

async function handle({ infoVideo, message, getLang }) {
  const { title, videoId } = infoVideo;
  const MAX_SIZE = 27262976; // 26MB (max size of audio that can be sent on fb)

  try {
    const msgSend = await message.reply(getLang("downloading", title));

    const { formats } = await ytdl.getInfo(videoId);
    const getFormat = formats
      .filter(f => f.hasAudio && !f.hasVideo)
      .sort((a, b) => (b.contentLength || 0) - (a.contentLength || 0))
      .find(f => (f.contentLength || 0) < MAX_SIZE);

    if (!getFormat) {
      message.unsend(msgSend.messageID);
      return message.reply(getLang("noAudio"));
    }

    const getStream = await getStreamAndSize(getFormat.url, `${videoId}.mp3`);

    if (getStream.size > MAX_SIZE) {
      message.unsend(msgSend.messageID);
      return message.reply(getLang("noAudio"));
    }

    const savePath = __dirname + `/tmp/${videoId}_${Date.now()}.mp3`;

    // Pastikan folder tmp ada
    if (!fs.existsSync(__dirname + '/tmp')) {
      fs.mkdirSync(__dirname + '/tmp');
    }

    const writeStream = fs.createWriteStream(savePath);
    const startTime = Date.now();
    getStream.stream.pipe(writeStream);
    const contentLength = getStream.size;
    let downloaded = 0;
    let count = 0;

    getStream.stream.on("data", (chunk) => {
      downloaded += chunk.length;
      count++;
      if (count == 5) {
        const endTime = Date.now();
        const speed = downloaded / (endTime - startTime) * 1000;
        const timeLeft = (contentLength / downloaded * (endTime - startTime)) / 1000;
        const percent = downloaded / contentLength * 100;
        if (timeLeft > 30) {
          message.reply(getLang("downloading2", title, Math.floor(speed / 1000000 * 100) / 100, Math.floor(downloaded / 1000000 * 100) / 100, Math.floor(contentLength / 1000000 * 100) / 100, Math.floor(percent), timeLeft.toFixed(2)));
        }
        count = 0;
      }
    });

    writeStream.on("finish", () => {
      message.reply({
        body: `🎵 ${title}`,
        attachment: fs.createReadStream(savePath)
      }, async (err) => {
        if (err) {
          return message.reply(getLang("error", err.message));
        }
        try {
          fs.unlinkSync(savePath);
          message.unsend(msgSend.messageID);
        } catch (e) {
          console.log("Error cleaning up:", e);
        }
      });
    });

    writeStream.on("error", (err) => {
      message.unsend(msgSend.messageID);
      message.reply(getLang("error", err.message));
    });

  } catch (error) {
    return message.reply(getLang("error", error.message));
  }
}

async function search(keyWord) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyWord)}`;
    const res = await axios.get(url);
    const getJson = JSON.parse(res.data.split("ytInitialData = ")[1].split(";</script>")[0]);
    const videos = getJson.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
    const results = [];

    for (const video of videos) {
      if (video.videoRenderer?.lengthText?.simpleText) {
        results.push({
          id: video.videoRenderer.videoId,
          title: video.videoRenderer.title.runs[0].text,
          thumbnail: video.videoRenderer.thumbnail.thumbnails.pop().url,
          time: video.videoRenderer.lengthText.simpleText,
          channel: {
            id: video.videoRenderer.ownerText.runs[0].navigationEndpoint.browseEndpoint.browseId,
            name: video.videoRenderer.ownerText.runs[0].text,
            thumbnail: video.videoRenderer.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails.pop().url.replace(/s[0-9]+\-c/g, '-c')
          }
        });
      }
    }
    return results;
  }
  catch (e) {
    const error = new Error("Cannot search video");
    error.code = "SEARCH_VIDEO_ERROR";
    throw error;
  }
}

async function getVideoInfo(id) {
  // get id from url if url
  id = id.replace(/(>|<)/gi, '').split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)/);
  id = id[2] !== undefined ? id[2].split(/[^0-9a-z_\-]/i)[0] : id[0];

  try {
    const { data: html } = await axios.get(`https://youtu.be/${id}?hl=en`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36'
      }
    });

    const playerResponseMatch = html.match(/var ytInitialPlayerResponse = (.*?});/);
    const initialDataMatch = html.match(/var ytInitialData = (.*?});/);
    
    if (!playerResponseMatch || !initialDataMatch) {
      throw new Error("Cannot parse video data from YouTube page");
    }

    const json = JSON.parse(playerResponseMatch[1]);
    const json2 = JSON.parse(initialDataMatch[1]);
    
    if (!json.videoDetails) {
      throw new Error("Video details not found. Video might be private, deleted, or restricted");
    }

    const { title, lengthSeconds, viewCount, videoId, thumbnail, author } = json.videoDetails;

  let getChapters;
  try {
    getChapters = json2.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap.find(x => x.key == "DESCRIPTION_CHAPTERS" && x.value.chapters).value.chapters;
  }
  catch (e) {
    getChapters = [];
  }

  const owner = json2.contents.twoColumnWatchNextResults.results.results.contents.find(x => x.videoSecondaryInfoRenderer).videoSecondaryInfoRenderer.owner;

  const result = {
    videoId,
    title,
    video_url: `https://youtu.be/${videoId}`,
    lengthSeconds: lengthSeconds.match(/\d+/)[0],
    viewCount: viewCount.match(/\d+/)[0],
    uploadDate: json.microformat.playerMicroformatRenderer.uploadDate,
    likes: json2.contents.twoColumnWatchNextResults.results.results.contents.find(x => x.videoPrimaryInfoRenderer).videoPrimaryInfoRenderer.videoActions.menuRenderer.topLevelButtons.find(x => x.segmentedLikeDislikeButtonViewModel).segmentedLikeDislikeButtonViewModel.likeButtonViewModel.likeButtonViewModel.toggleButtonViewModel.toggleButtonViewModel.defaultButtonViewModel.buttonViewModel.accessibilityText.replace(/\.|,/g, '').match(/\d+/)?.[0] || 0,
    chapters: getChapters.map((x, i) => {
      const start_time = x.chapterRenderer.timeRangeStartMillis;
      const end_time = getChapters[i + 1]?.chapterRenderer?.timeRangeStartMillis || lengthSeconds.match(/\d+/)[0] * 1000;

      return {
        title: x.chapterRenderer.title.simpleText,
        start_time_ms: start_time,
        start_time: start_time / 1000,
        end_time_ms: end_time - start_time + start_time,
        end_time: (end_time - start_time + start_time) / 1000
      };
    }),
    thumbnails: thumbnail.thumbnails,
    author: author,
    channel: {
      id: owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint.browseId,
      username: owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint.canonicalBaseUrl,
      name: owner.videoOwnerRenderer.title.runs[0].text,
      thumbnails: owner.videoOwnerRenderer.thumbnail.thumbnails,
      subscriberCount: parseAbbreviatedNumber(owner.videoOwnerRenderer.subscriberCountText.simpleText)
    }
  };

  return result;
  } catch (error) {
    console.error("Error getting video info:", error);
    throw new Error(`Failed to get video information: ${error.message}`);
  }
}

function parseAbbreviatedNumber(string) {
  const match = string
    .replace(',', '.')
    .replace(' ', '')
    .match(/([\d,.]+)([MK]?)/);
  if (match) {
    let [, num, multi] = match;
    num = parseFloat(num);
    return Math.round(multi === 'M' ? num * 1000000 :
      multi === 'K' ? num * 1000 : num);
  }
  return null;
}