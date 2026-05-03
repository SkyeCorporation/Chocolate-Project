const express = require('express');
const bodyParser = require('body-parser');
const { createFacebookAccount } = require('./handler');
const app = express();

app.use(bodyParser.json());
app.use(express.static('SharyService'));

app.post('/api/create', async (req, res) => {
    const { count, password } = req.body;
    console.log(`Menerima perintah: buat ${count} akun dengan password: ${password}`);
    
    // Simple loop
    for(let i = 0; i < count; i++) {
        await createFacebookAccount(password);
    }
    
    res.send({ message: `Selesai membuat ${count} akun untuk Tuan!` });
});

app.listen(3000, () => console.log('Shary Service Online di port 3000, Master!'));
