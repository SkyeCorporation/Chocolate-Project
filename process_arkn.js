const fs = require('fs');
const path = require('path');

const sourceDir = './arknights-database';
const dataFile = './arknightData.json';

// Baca file .webp yang baru dipindahkan
const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.webp'));

// Baca data yang sudah ada
let arknightData = [];
if (fs.existsSync(dataFile)) {
    arknightData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

// Mapping ID (Ini contoh, kamu bisa sesuaikan jika punya list ID yang benar)
const idMapping = {
    "Vigil": "3",
    "Pozyomka": "4",
    "Logos": "5"
};

files.forEach(file => {
    const nameFull = path.parse(file).name; // contoh: Vigil-U
    const nameBase = nameFull.split('-')[0];
    
    let id = idMapping[nameBase] || "999"; // Default 999 jika tidak ada di mapping
    
    // Logika ID
    if (nameFull.includes('-U')) {
        id = id + "U";
    } else if (nameFull.includes('-S')) {
        id = id + nameFull.split('-')[1];
    }
    
    // Cek apakah sudah ada di data
    const exists = arknightData.find(item => item.id === id);
    if (!exists) {
        arknightData.push({
            id: id,
            nameItem: nameFull,
            typeItem: "arkn",
            stars: 6, // Default
            price: 18000, // Default
            rate: 0.01, // Default
            img: path.join(sourceDir, file),
            imgInventory: path.join(sourceDir, file)
        });
    }
});

fs.writeFileSync(dataFile, JSON.stringify(arknightData, null, 2));
console.log("Data berhasil diperbarui!");
