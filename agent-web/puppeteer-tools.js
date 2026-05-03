const puppeteer = require("puppeteer-core");
const axios = require("axios");

const CHROMIUM_PATH = process.env.CHROMIUM_PATH
  || "/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--single-process",
  "--disable-extensions",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--hide-scrollbars",
  "--mute-audio"
];

let browserPromise = null;
let browserClosing = false;

async function getBrowser() {
  if (browserPromise && !browserClosing) {
    try {
      const b = await browserPromise;
      if (b && b.connected !== false) return b;
    } catch (_) {}
  }
  browserClosing = false;
  browserPromise = puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: "new",
    args: LAUNCH_ARGS,
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 }
  });
  const browser = await browserPromise;
  browser.on("disconnected", () => {
    browserClosing = true;
    browserPromise = null;
  });
  return browser;
}

async function closeBrowser() {
  if (browserPromise) {
    try { const b = await browserPromise; await b.close(); } catch (_) {}
    browserPromise = null;
  }
}

function looksLikeUrl(s) {
  return /^https?:\/\//i.test(s);
}

function ensureUrl(u) {
  if (!u) throw new Error("URL kosong");
  if (!looksLikeUrl(u)) {
    if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) return "https://" + u;
    throw new Error("URL tidak valid (harus diawali http:// atau https://)");
  }
  return u;
}

function newPage(browser) {
  return browser.newPage();
}

async function setupPage(page) {
  await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36");
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(30000);
}

async function screenshotUrl(rawUrl, opts = {}) {
  const url = ensureUrl(rawUrl);
  const fullPage = opts.fullPage !== false;
  const width = Math.min(Math.max(parseInt(opts.width) || 1280, 320), 1920);
  const height = Math.min(Math.max(parseInt(opts.height) || 800, 320), 4000);
  const browser = await getBrowser();
  const page = await newPage(browser);
  try {
    await setupPage(page);
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch(async (e) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    });
    if (opts.waitMs) await new Promise(r => setTimeout(r, Math.min(parseInt(opts.waitMs) || 0, 8000)));
    const buffer = await page.screenshot({ type: "png", fullPage, captureBeyondViewport: fullPage });
    const title = await page.title().catch(() => "");
    return { ok: true, url, title, base64: buffer.toString("base64"), size: buffer.length, mimeType: "image/png" };
  } finally {
    await page.close().catch(() => {});
  }
}

async function fetchPageText(rawUrl, opts = {}) {
  const url = ensureUrl(rawUrl);
  const maxChars = Math.min(Math.max(parseInt(opts.maxChars) || 8000, 500), 40000);
  const browser = await getBrowser();
  const page = await newPage(browser);
  try {
    await setupPage(page);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch(async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    });
    const data = await page.evaluate(() => {
      const drop = ["script", "style", "noscript", "svg", "iframe"];
      drop.forEach(sel => document.querySelectorAll(sel).forEach(n => n.remove()));
      const text = (document.body && document.body.innerText) || "";
      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 50)
        .map(a => ({ text: (a.innerText || "").trim().slice(0, 100), href: a.href }))
        .filter(l => l.text);
      return {
        title: document.title || "",
        url: location.href,
        description: (document.querySelector('meta[name="description"]') || {}).content || "",
        text: text.replace(/\n{3,}/g, "\n\n").trim(),
        linkCount: document.querySelectorAll("a[href]").length,
        sampleLinks: links
      };
    });
    if (data.text.length > maxChars) {
      data.text = data.text.slice(0, maxChars) + `\n\n[...truncated, total ${data.text.length} chars]`;
      data.truncated = true;
    }
    return { ok: true, ...data };
  } finally {
    await page.close().catch(() => {});
  }
}

async function extractImages(rawUrl, opts = {}) {
  const url = ensureUrl(rawUrl);
  const limit = Math.min(Math.max(parseInt(opts.limit) || 30, 1), 100);
  const browser = await getBrowser();
  const page = await newPage(browser);
  try {
    await setupPage(page);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch(async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    });
    const images = await page.evaluate((lim) => {
      const out = [];
      const imgs = Array.from(document.querySelectorAll("img"));
      for (const img of imgs) {
        const src = img.currentSrc || img.src;
        if (!src || src.startsWith("data:")) continue;
        out.push({
          src,
          alt: img.alt || "",
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0
        });
        if (out.length >= lim) break;
      }
      return out;
    }, limit);
    return { ok: true, url, count: images.length, images };
  } finally {
    await page.close().catch(() => {});
  }
}

async function downloadImageAsPng(rawUrl) {
  const url = ensureUrl(rawUrl);
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 25 * 1024 * 1024,
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "Accept": "image/*,*/*;q=0.8"
    },
    validateStatus: s => s >= 200 && s < 400
  });
  const ct = (res.headers["content-type"] || "").toLowerCase();
  const buf = Buffer.from(res.data);
  let outBuf = buf;
  let mime = ct.split(";")[0].trim() || "image/png";
  if (!ct.startsWith("image/")) {
    throw new Error(`URL bukan gambar (content-type: ${ct || "tidak diketahui"})`);
  }
  if (!ct.includes("png")) {
    try {
      const sharp = require("sharp");
      outBuf = await sharp(buf).png().toBuffer();
      mime = "image/png";
    } catch (e) {
      // keep original if sharp conversion fails
    }
  }
  return { ok: true, url, mimeType: mime, base64: outBuf.toString("base64"), size: outBuf.length, originalContentType: ct };
}

module.exports = {
  getBrowser,
  closeBrowser,
  screenshotUrl,
  fetchPageText,
  extractImages,
  downloadImageAsPng,
  ensureUrl
};
