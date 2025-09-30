const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'monsecret123';

// Dossiers
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(LISTINGS_FILE)) fs.writeFileSync(LISTINGS_FILE, '[]');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

// Multer config pour upload images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

// Serve static frontend + uploads
app.use('/', express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Helpers
function readJSON(file){
  try { return JSON.parse(fs.readFileSync(file,'utf-8')||'[]'); }
  catch(e){ return []; }
}
function writeJSON(file, data){
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Auth routes
app.post('/api/register', async (req,res)=>{
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({message:'Username et password requis'});
  const users = readJSON(USERS_FILE);
  if(users.find(u => u.username === username)) return res.status(400).json({message:'Utilisateur déjà existant'});
  const hash = await bcrypt.hash(password,10);
  users.push({ username, password: hash });
  writeJSON(USERS_FILE, users);
  res.json({success:true});
});

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u=>u.username===username);
  if(!user) return res.status(400).json({message:'Utilisateur non trouvé'});
  const valid = await bcrypt.compare(password,user.password);
  if(!valid) return res.status(400).json({message:'Mot de passe incorrect'});
  const token = jwt.sign({username}, SECRET_KEY, {expiresIn:'1h'});
  res.json({success:true, token});
});

// Middleware auth
function authMiddleware(req,res,next){
  const token = req.headers['authorization']?.split(' ')[1];
  if(!token) return res.status(401).json({message:'Token manquant'});
  try{
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch(err){
    res.status(401).json({message:'Token invalide'});
  }
}

// Annonces
app.get('/api/listings', (req,res)=>{
  let listings = readJSON(LISTINGS_FILE);
  const { price, neighborhood } = req.query;
  if(price) listings = listings.filter(l => l.price == Number(price));
  if(neighborhood) listings = listings.filter(l => l.neighborhood.toLowerCase() === neighborhood.toLowerCase());
  res.json(listings);
});

app.get('/api/listings/:id', (req,res)=>{
  const listings = readJSON(LISTINGS_FILE);
  const id = Number(req.params.id);
  const item = listings.find(l => l.id===id);
  if(!item) return res.status(404).json({message:'Annonce non trouvée'});
  res.json(item);
});

// Création annonce
app.post('/api/listings', authMiddleware, upload.array('images',8), (req,res)=>{
  const body = req.body;
  const files = req.files || [];
  if(!body.title || !body.price) return res.status(400).json({message:'Titre et prix requis'});

  const listings = readJSON(LISTINGS_FILE);
  const id = listings.length ? (listings[listings.length-1].id+1) : 1;
  const images = files.map(f => ({url:`/uploads/${f.filename}`, originalname:f.originalname}));

  const listing = {
    id,
    author: req.user.username,
    title: body.title,
    description: body.description || '',
    price: Number(body.price),
    rooms_type: body.rooms_type || '',
    shower_internal: body.shower_internal==='on' || body.shower_internal==='true',
    neighborhood: body.neighborhood || '',
    water: body.water==='on' || body.water==='true',
    electricity: body.electricity==='on' || body.electricity==='true',
    ventilated_ceiling: body.ventilated_ceiling==='on' || body.ventilated_ceiling==='true',
    conditions: body.conditions || '',
    phone_public: body.phone_public==='on' || false,
    phone_display: body.phone_display || '',
    images,
    created_at: new Date().toISOString()
  };

  listings.push(listing);
  writeJSON(LISTINGS_FILE,listings);
  res.json({success:true, listing});
});

// Supprimer annonce
app.delete('/api/listings/:id', authMiddleware, (req,res)=>{
  const listings = readJSON(LISTINGS_FILE);
  const id = Number(req.params.id);
  const index = listings.findIndex(l => l.id===id);
  if(index===-1) return res.status(404).json({message:'Annonce non trouvée'});
  if(listings[index].author !== req.user.username) return res.status(403).json({message:'Non autorisé'});
  // Supprimer les images
  listings[index].images.forEach(img => {
    const filepath = path.join(__dirname, img.url);
    if(fs.existsSync(filepath)) fs.unlinkSync(filepath);
  });
  listings.splice(index,1);
  writeJSON(LISTINGS_FILE,listings);
  res.json({success:true});
});

// Messages contact
app.post('/api/listings/:id/contact', (req,res)=>{
  const id = Number(req.params.id);
  const { name, email, phone, message } = req.body;
  if(!name || !message) return res.status(400).json({message:'Nom et message requis'});
  const listings = readJSON(LISTINGS_FILE);
  const listing = listings.find(l => l.id===id);
  if(!listing) return res.status(404).json({message:'Annonce non trouvée'});
  const messages = readJSON(MESSAGES_FILE);
  messages.push({id:Date.now(), listing_id:id, name, email, phone, message, created_at:new Date().toISOString()});
  writeJSON(MESSAGES_FILE,messages);
  res.json({success:true, message:'Message envoyé au propriétaire.'});
});

// Fallback API
app.use('/api/*', (req,res)=> res.status(404).json({message:'API route non trouvée'}));

// Fallback Frontend
app.use((req,res)=> res.status(404).send('Not found'));

app.listen(PORT, ()=>console.log(`Server running on http://localhost:${PORT}`));
