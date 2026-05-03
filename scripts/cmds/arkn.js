const fs = require("fs");
const { loadImage, createCanvas } = require("canvas");
const path = require("path");
const { execSync } = require("child_process");

module.exports = {
  config: {
    name: "arkn",
    version: "1.6.3",
    author: "Amagi",
    countDown: 0,
    role: 0,
    shortDescription: "Arknights Gacha Simulator",
    longDescription: "Simulasi gacha Arknights menggunakan database dari arknight-database",
    category: "game",
    guide: "{pn} pull",
  },
  onStart: async function ({ api, event, args }) {
    try {
      const dbFolder = path.join(process.cwd(), "arknights-database");
      const dbPath = path.join(dbFolder, "arknights.json");
      const dbData = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

      if (args[0] === "pull") {
        const operator = dbData[Math.floor(Math.random() * dbData.length)];
        
        // Path Asset
        const bgPath = path.join(dbFolder, "BACKGROUND-GACHA.png");
        const layerPath = path.join(dbFolder, "GACHA-LAYER.png");
        let operatorPath = path.join(dbFolder, operator.image);
        const outputPath = path.join(process.cwd(), "scripts", "cmds", "status_result.png");

        // Jika file adalah webp, konversi ke png menggunakan ffmpeg
        if (operatorPath.endsWith('.webp')) {
            const pngPath = operatorPath.replace('.webp', '.png');
            if (!fs.existsSync(pngPath)) {
                execSync(`ffmpeg -i "${operatorPath}" "${pngPath}"`);
            }
            operatorPath = pngPath;
        }

        const bgImage = await loadImage(bgPath);
        const layerImage = await loadImage(layerPath);
        const operatorImage = await loadImage(operatorPath);
        
        const canvas = createCanvas(bgImage.width, bgImage.height);
        const ctx = canvas.getContext("2d");
        
        // Draw Background
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
        
        // Draw Operator - Center the image
        // Besarkan 5 kali lipat dari ukuran asli (dibatasi oleh canvas agar tidak overflow)
        const scaleFactor = 5;
        const targetWidth = operatorImage.width * scaleFactor; 
        const targetHeight = operatorImage.height * scaleFactor;
        
        // Hitung posisi agar tepat di tengah
        const x = (canvas.width - targetWidth) / 2;
        const y = (canvas.height - targetHeight) / 2;
        
        ctx.drawImage(operatorImage, x, y, targetWidth, targetHeight);
        
        // Draw Layer
        ctx.drawImage(layerImage, 0, 0, canvas.width, canvas.height);
        
        // Draw Operator Name
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        
        // Ukuran font dinamis
        let fontSize = 120;
        ctx.font = `bold ${fontSize}px Arial`;
        
        const textX = 50; 
        const textY = 1070;
        
        // Shadow untuk teks agar terbaca
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 10;
        ctx.fillText(operator.name.toUpperCase(), textX, textY);
        ctx.fillText(`OPERATOR: ${operator.id.toUpperCase()}`, 800, 2400);
        ctx.shadowBlur = 0; // Reset shadow
        
        const imageBuffer = canvas.toBuffer("image/png");
        fs.writeFileSync(outputPath, imageBuffer);
        
        return api.sendMessage(
          {
            attachment: fs.createReadStream(outputPath),
          },
          event.threadID
        );
      }
      if (args[0] === "inv") {
        const operator = dbData[Math.floor(Math.random() * dbData.length)];

        // Path Asset
        const bgPath = path.join(dbFolder, "Inventory.png");
        let operatorPath = path.join(dbFolder, operator.image);
        const outputPath = path.join(process.cwd(), "scripts", "cmds", "status_result.png");

        // Jika file adalah webp, konversi ke png menggunakan ffmpeg
        if (operatorPath.endsWith('.webp')) {
            const pngPath = operatorPath.replace('.webp', '.png');
            if (!fs.existsSync(pngPath)) {
                execSync(`ffmpeg -i "${operatorPath}" "${pngPath}"`);
            }
            operatorPath = pngPath;
        }

        const bgImage = await loadImage(bgPath);
        const operatorImage = await loadImage(operatorPath);

        const canvas = createCanvas(bgImage.width, bgImage.height);
        const ctx = canvas.getContext("2d");

        // Draw Background
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

        // Draw Operator - Center the image
        // Besarkan 5 kali lipat dari ukuran asli (dibatasi oleh canvas agar tidak overflow)
        const scaleFactor = 5;
        const targetWidth = operatorImage.width * scaleFactor; 
        const targetHeight = operatorImage.height * scaleFactor;

        // Hitung posisi agar tepat di tengah
        const x = (canvas.width - targetWidth) / 2;
        const y = (canvas.height - targetHeight) / 2;
        
        // Draw Operator Name
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";

        // Ukuran font dinamis
        let fontSize = 120;
        ctx.font = `bold ${fontSize}px Arial`;

        const textX = 50; 
        const textY = 1070;

        // Shadow untuk teks agar terbaca
    
        ctx.shadowBlur = 0; // Reset shadow

        const imageBuffer = canvas.toBuffer("image/png");
        fs.writeFileSync(outputPath, imageBuffer);

        return api.sendMessage(
          {
            attachment: fs.createReadStream(outputPath),
          },
          event.threadID
        );
      }
    } catch (err) {
      console.error("Error in arkn command:", err);
      return api.sendMessage(`Terjadi kesalahan: ${err.message}`, event.threadID);
    }
    api.sendMessage(`Perintah tidak valid! gunakan .help arkn untuk melihat perintah yang tersedia`, event.threadID)
  }
};
