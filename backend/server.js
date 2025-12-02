require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path'); // Add this at top

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE SETUP (gedeeld) ---
const dbPath = path.join(__dirname, 'politie_dossiers.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database', err);
  } else {
    console.log('✅ Verbonden met SQLite database.');
    db.run('PRAGMA journal_mode = WAL;');
    // Basis tabellen
    db.run(`
      CREATE TABLE IF NOT EXISTS dossiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        datum TEXT,
        beschrijving TEXT,
        samenvatting TEXT,
        prioriteit TEXT,
        locatie_postcode TEXT,
        politie_zone TEXT,
        status TEXT DEFAULT 'open'
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS verkeersregels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT,
        content TEXT,
        embedding TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS police_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        municipalities TEXT,
        zone_name TEXT,
        arrondissement TEXT,
        province TEXT,
        embedding TEXT
      )
    `);
  }
});

app.use(cors());
app.use(bodyParser.json());

// --- Routes laden ---
const initRag = require('./routes/rag');
const initPv = require('./routes/pv');

initRag(app, db);
initPv(app, db);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`🚀 Politie AI Server draait op http://localhost:${PORT}`));