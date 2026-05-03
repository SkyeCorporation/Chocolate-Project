module.exports = {
  config: {
    name: "kerja",
    version: "1.0",
    role: 2,
    category: "Utilities",
    author: "Shido",
    
  },
  onStart: async function({ api, event, args, usersData}) {
    api.sendMessage("Shap Bos! saya mulai kerja", event.threadID);

    const tempatKerja = 2004103190229165
    let intro = "//mengunakan seragam pegawai Fire Motor Bell R18 dimess lalu kaluar untuk memasuki gudang utama"
    
    let turn = {
      1: "//sapu lalu pel gudang utama kemudian menyimpan semua alat alat beres beres lalu menarik mesin citakan",
      2: "//membawa mobil lori besar menuju gudang antares turun dari mobil mengambil dan menaikan Pipa PVC, kabel tembaga, kaleng minuman, karet, lem serbaguna, lalu naik kembali ke mobil menarik semua alat ke gudang uutama",
      3: "//menurunkan semua alat alat di mesin citakan motor R18 Fire lalu mengunakan mobil lori kemnali ke gudang Fure Club beberapa saat, sampai akhirnya sampai lalu turun dari mobil, menaikan cetakan foto ninja R18 motor Fire lalu membuat karton sebagai pemotongan lalu naikan semua ke mobil lori dan menangkutnya ke gudang utama, setelah itu diriku turun menaruh semua barang di alat utama gudang lali gabungkan cetakan dan mesin otomatis gabungkan semua komponen didalam cetakan",
      4: "//nyalakan mesin panas dan seluruh mesin utama lalu aku Potong pipa PVC, panaskan dengan korek gas agar lentur, lalu ratakan dengan papan kayu sesuai pola\nPotong pipa PVC, panaskan dengan korek gas agar lentur, lalu ratakan dengan papan kayu sesuai pola\nSatukan bagian-bagian PVC menggunakan lem, bentuk rangka menggunakan kabel tembaga, dan pasang jari-jari roda menggunakan jarum pentul\nLalu Haluskan bagian ban dengan amplas, beri motif pada ban, lalu cat seluruh bagian motor pakai mesin otomatis fire didalam ruangan besar motor",
      5: (count) => `//menunggu hingga motor siap sempurna lalu memberkan label nomer ${count}, pada ruangan lalu aku kembali //menyimpan semua alat alat beres beres lalu menarik mesin citakan`
    }

    let endOfTurn = {
      1: (count) => `//membuka semua tempat mesin motor, lalu pergi ke tempat motor untuk mengunakan motor tersebut dari ruangan ${count} ke tempat penjualan motor, setelah sampai turun dari motor dan membersihkan motor`,
      2: (count) => `//berlari kembali ke gudang utama menuju ruangan ${count + 1} motor`
    }

    // Delay acak supaya tidak berpola (min ms, max ms)
    const delay = (min, max) => {
      const ms = min + Math.floor(Math.random() * (max - min));
      return new Promise(resolve => setTimeout(resolve, ms));
    };

    // Kirim intro sekali saja
    api.sendMessage(intro, tempatKerja);

    // Loop tak terbatas
    while (true) {
      // Phase Turn (turn 1-5 diulang dengan count 1 sampai 50)
      for (let count = 1; count <= 50; count++) {
        for (let turnNum = 1; turnNum <= 5; turnNum++) {
          let message;
          
          if (typeof turn[turnNum] === 'function') {
            message = turn[turnNum](count);
          } else {
            message = turn[turnNum];
          }
          
          api.sendMessage(message, tempatKerja);
          await delay(45000, 90000); // Jeda acak 45-90 detik
        }
      }

      // Phase End of Turn (end of turn 1 dan 2 diulang dengan count 1 sampai 50)
      for (let count = 1; count <= 50; count++) {
        let eotMessage1 = endOfTurn[1](count);
        api.sendMessage(eotMessage1, tempatKerja);
        await delay(45000, 90000); // Jeda acak 45-90 detik

        let eotMessage2 = endOfTurn[2](count);
        api.sendMessage(eotMessage2, tempatKerja);
        await delay(45000, 90000); // Jeda acak 45-90 detik
      }
    }
  }
}