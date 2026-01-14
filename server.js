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

const MASTER_FILE = path.join(STORAGE_DIR, 'submissions.enf');
const CSV_FILE = path.join(STORAGE_DIR, 'submissions.csv');

async function readMaster(){
  try{
    if(!fs.existsSync(MASTER_FILE)) return [];
    const content = fs.readFileSync(MASTER_FILE, 'utf8');
    const arr = await decryptJSON(content);
    return Array.isArray(arr)? arr : [];
  }catch(e){ console.warn('readMaster error', e.message); return []; }
}

async function writeMaster(arr){
  try{
    const enc = await encryptJSON(arr);
    fs.writeFileSync(MASTER_FILE, enc, 'utf8');
    // actualizar CSV en texto plano para facilitar descarga
    const header = ['Nombre','Pedido','Medida','Cantidad','Fecha'];
    const rows = arr.map(r=>[r.name,r.option,r.unit||'',r.quantity||'',r.ts||'']);
    const csv = header.join(',') + '\n' + rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    fs.writeFileSync(CSV_FILE, '\uFEFF'+csv, 'utf8');
  }catch(e){ console.error('writeMaster error', e); }
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
    // actualizar archivo maestro
    try{
      const master = await readMaster();
      master.push(full);
      await writeMaster(master);
    }catch(e){ console.warn('master update failed', e.message); }
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// listar todas las entradas (desencriptadas)
app.get('/submissions', async (req,res)=>{
  try{
    // preferir el maestro si existe
    const master = await readMaster();
    master.sort((a,b)=> new Date(a.ts) - new Date(b.ts));
    res.json(master);
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// endpoint para descargar CSV simple (admin)
app.get('/export/csv', async (req,res)=>{
  try{
    // devolver CSV maestro si existe
    if(fs.existsSync(CSV_FILE)){
      res.setHeader('Content-Type','text/csv');
      res.setHeader('Content-Disposition','attachment; filename=pedidos.csv');
      return res.send(fs.readFileSync(CSV_FILE,'utf8'));
    }
    // fallback: construir desde maestro
    const master = await readMaster();
    const header = ['Nombre','Pedido','Medida','Cantidad','Fecha'];
    const rows = master.map(r=>[r.name,r.option,r.unit||'',r.quantity||'',r.ts||'']);
    const csv = header.join(',') + '\n' + rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=pedidos.csv');
    res.send('\uFEFF'+csv);
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// descargar el maestro encriptado (.enf)
app.get('/download/enf', async (req,res)=>{
  try{
    if(!fs.existsSync(MASTER_FILE)) return res.status(404).json({error:'no master'});
    res.setHeader('Content-Type','application/octet-stream');
    res.setHeader('Content-Disposition','attachment; filename=submissions.enf');
    res.send(fs.readFileSync(MASTER_FILE,'utf8'));
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// descargar maestro como JSON
app.get('/download/json', async (req,res)=>{
  try{
    const master = await readMaster();
    res.setHeader('Content-Type','application/json');
    res.setHeader('Content-Disposition','attachment; filename=submissions.json');
    res.send(JSON.stringify(master, null, 2));
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// listar archivos en la carpeta de almacenamiento
app.get('/files', (req,res)=>{
  try{
    const files = fs.readdirSync(STORAGE_DIR).map(f=>{
      const stat = fs.statSync(path.join(STORAGE_DIR,f));
      return { name: f, size: stat.size, mtime: stat.mtime }; 
    });
    res.json(files);
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

// descargar archivo específico (proteger nombre)
app.get('/files/:name', (req,res)=>{
  try{
    const name = path.basename(req.params.name);
    const filePath = path.join(STORAGE_DIR, name);
    if(!fs.existsSync(filePath)) return res.status(404).json({error:'not found'});
    res.setHeader('Content-Disposition', `attachment; filename=${name}`);
    res.send(fs.readFileSync(filePath));
  }catch(e){ console.error(e); res.status(500).json({error:'internal'}); }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, ()=> console.log(`Server listening on http://${HOST}:${PORT}`));
