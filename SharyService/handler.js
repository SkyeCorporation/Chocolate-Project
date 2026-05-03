const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function getTempEmail(page) {
    await page.goto('https://tmailor.com/');
    // Mengambil email yang digenerate otomatis oleh tmailor
    const email = await page.evaluate(() => {
        return document.querySelector('#email').value;
    });
    return email;
}

async function getVerificationCode(page) {
    // Logic untuk memantau inbox tmailor.com
    // Shary akan menunggu sampai ada email dari Facebook
    await page.waitForSelector('.mail-item', { timeout: 60000 });
    await page.click('.mail-item');
    
    const code = await page.evaluate(() => {
        const body = document.body.innerText;
        const match = body.match(/(\d{5})/); // Mencari kode 5 digit dari FB
        return match ? match[0] : null;
    });
    return code;
}

async function createFacebookAccount(password) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    const mailPage = await browser.newPage();

    try {
        const email = await getTempEmail(mailPage);
        
        await page.goto('https://www.facebook.com/r.php');
        await page.type('input[name="firstname"]', 'Shary');
        await page.type('input[name="lastname"]', 'Bot');
        await page.type('input[name="reg_email__"]', email);
        await page.type('input[name="reg_passwd__"]', password);
        
        // ... (lanjutkan pengisian form lainnya)
        
        console.log("Menunggu kode verifikasi...");
        const code = await getVerificationCode(mailPage);
        
        // Input kode ke FB
        await page.type('input[name="code"]', code);
        
        // Simpan ke JSON
        const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'accounts.json'), 'utf8'));
        accounts.push({ email, password, status: 'verified' });
        fs.writeFileSync(path.join(__dirname, 'accounts.json'), JSON.stringify(accounts, null, 2));

        console.log("Akun berhasil dibuat, Master!");
    } catch (e) {
        console.error("Gagal membuat akun:", e);
    } finally {
        await browser.close();
    }
}

module.exports = { createFacebookAccount };
