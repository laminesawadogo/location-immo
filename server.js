const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Dossiers
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
if (!fs.existsSync(LISTINGS_FILE)) fs.writeFileSync(LISTINGS_FILE, '[]');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } }); // 8MB

// Serve static frontend + uploads
app.use('/', express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Helpers
function readListings() {
  try {
    const raw = fs.readFileSync(LISTINGS_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (e) { return []; }
}
function writeListings(list) {
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(list, null, 2));
}
function appendMessage(msg) {
  const arr = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8') || '[]');
  arr.push(msg);
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(arr, null, 2));
}

// API
app.get('/api/listings', (req, res) => {
  const list = readListings();
  res.json(list);
});

app.get('/api/listings/:id', (req, res) => {
  const list = readListings();
  const id = Number(req.params.id);
  const item = list.find(l => l.id === id);
  if (!item) return res.status(404).json({ message: 'Annonce non trouvée' });
  res.json(item);
});

app.post('/api/listings', upload.array('images', 8), (req, res) => {
  const body = req.body;
  const files = req.files || [];

  if (!body.title || !body.price) return res.status(400).json({ message: 'Titre et prix requis' });

  const listings = readListings();
  const id = listings.length ? (listings[listings.length-1].id + 1) : 1;

  const images = files.map(f => ({ url: `/uploads/${f.filename}`, originalname: f.originalname }));

  const listing = {
    id,
    title: body.title,
    description: body.description || '',
    price: Number(body.price) || 0,
    rooms_type: body.rooms_type || '',
    shower_internal: body.shower_internal === 'on' || body.shower_internal === 'true',
    neighborhood: body.neighborhood || '',
    water: body.water === 'on' || body.water === 'true',
    electricity: body.electricity === 'on' || body.electricity === 'true',
    ventilated_ceiling: body.ventilated_ceiling === 'on' || body.ventilated_ceiling === 'true',
    conditions: body.conditions || '',
    phone_public: body.phone_public === 'on' || false,
    phone_display: body.phone_display || '',
    images,
    created_at: new Date().toISOString()
  };

  listings.push(listing);
  writeListings(listings);

  res.json({ success: true, listing });
});

app.post('/api/listings/:id/contact', (req, res) => {
  const id = Number(req.params.id);
  const { name, email, phone, message } = req.body;
  if (!name || !message) return res.status(400).json({ message: 'Nom et message requis' });
  const listings = readListings();
  const listing = listings.find(l => l.id === id);
  if (!listing) return res.status(404).json({ message: 'Annonce non trouvée' });

  const msg = {
    id: Date.now(),
    listing_id: id,
    name, email, phone, message,
    created_at: new Date().toISOString()
  };
  appendMessage(msg);

  // Ici on pourrait envoyer un email au propriétaire (ex: nodemailer)

  res.json({ success: true, message: 'Message envoyé. Le propriétaire sera contacté.' });
});

// Fallback
app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));