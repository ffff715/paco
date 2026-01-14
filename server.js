const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const scrypt = promisify(crypto.scrypt);
const app = express();
app.use(bodyParser.json({limit:'1mb'}));
// permitir CORS para solicitudes desde el cliente (GitHub Pages u otros)
app.use(cors());

const STORAGE_DIR = path.join(__dirname, 'data_enf');
if(!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

const PASSWORD = process.env.ENCRYPT_PASSWORD || 'change-me'; // debe cambiar en producción
const SALT = 'cuestionatio-salt-2026';

async function getKey(){
  return await scrypt(PASSWORD, SALT, 32);
}

async function encryptJSON(obj){
  const iv = crypto.randomBytes(12);
  const key = await getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

async function decryptJSON(b64){
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0,12);
  const tag = buf.slice(12,28);
  const encrypted = buf.slice(28);
  const key = await getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

app.get('/health', (req,res)=> res.json({ok:true}));

// endpoint para recibir envío
app.post('/submit', async (req,res)=>{
  try{
    const payload = req.body;
    // mínimo
    if(!payload.name || !payload.option) return res.status(400).json({error:'missing fields'});
    const full = Object.assign({ts:new Date().toISOString()}, payload);
    const enc = await encryptJSON(full);
    const filename = `${Date.now()}_${uuidv4()}.enf`;
    fs.writeFileSync(path.join(STORAGE_DIR, filename), enc, 'utf8');
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// listar todas las entradas (desencriptadas)
app.get('/submissions', async (req,res)=>{
  try{
    const files = fs.readdirSync(STORAGE_DIR).filter(f=>f.endsWith('.enf'));
    const arr = [];
    for(const f of files){
      try{ const content = fs.readFileSync(path.join(STORAGE_DIR,f),'utf8'); const obj = await decryptJSON(content); arr.push(obj); }catch(e){ console.warn('skip',f,e.message); }
    }
    // ordenar por fecha asc
    arr.sort((a,b)=> new Date(a.ts) - new Date(b.ts));
    res.json(arr);
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// endpoint para descargar CSV simple (admin)
app.get('/export/csv', async (req,res)=>{
  try{
    const files = fs.readdirSync(STORAGE_DIR).filter(f=>f.endsWith('.enf'));
    const arr = [];
    for(const f of files){
      try{ const content = fs.readFileSync(path.join(STORAGE_DIR,f),'utf8'); const obj = await decryptJSON(content); arr.push(obj); }catch(e){}
    }
    const header = ['Nombre','Pedido','Medida','Cantidad','Fecha'];
    const rows = arr.map(r=>[r.name,r.option,r.unit||'',r.quantity||'',r.ts||'']);
    const csv = header.join(',') + '\n' + rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=pedidos.csv');
    res.send('\uFEFF'+csv);
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, ()=> console.log(`Server listening on http://${HOST}:${PORT}`));
