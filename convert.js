const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const directoryPath = './scripts/cmds'; // Folder tempat file berada

async function convertWebpToPng() {
    try {
        const files = fs.readdirSync(directoryPath);
        const webpFiles = files.filter(file => path.extname(file).toLowerCase() === '.webp');

        if (webpFiles.length === 0) {
            console.log('Tidak ada file .webp ditemukan di ' + directoryPath);
            return;
        }

        for (const file of webpFiles) {
            const inputPath = path.join(directoryPath, file);
            const outputPath = path.join(directoryPath, path.parse(file).name + '.png');

            await sharp(inputPath)
                .png()
                .toFile(outputPath);

            console.log(`Berhasil mengonversi: ${file} -> ${path.parse(file).name}.png`);
        }
        console.log('Semua konversi selesai!');
    } catch (err) {
        console.error('Error saat konversi:', err);
    }
}

convertWebpToPng();
