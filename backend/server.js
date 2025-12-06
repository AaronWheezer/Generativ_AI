require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const sqliteVec = require('sqlite-vec'); // <--- NIEUW

// MCP mailer start code (ongewijzigd laten...)
const { spawn } = require('child_process');
const mcpMailerPath = path.join(__dirname, 'mcp-mailer', 'index.js');
const mcpMailerProcess = spawn('node', [mcpMailerPath], {
  cwd: path.join(__dirname, 'mcp-mailer'),
  stdio: 'inherit',
});

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE SETUP ---
const dbPath = path.join(__dirname, 'politie_dossiers.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('❌ Error opening database', err);

  console.log('✅ Verbonden met SQLite database.');
  
  // 1. LAAD DE VECTOR EXTENSIE
  try {
      db.loadExtension(sqliteVec.getLoadablePath());
      console.log("✅ sqlite-vec extensie geladen!");
  } catch (e) {
      console.error("❌ Kon sqlite-vec niet laden:", e);
  }

  db.run('PRAGMA journal_mode = WAL;');

  db.serialize(() => {
    // Basis tabellen
    db.run(`CREATE TABLE IF NOT EXISTS dossiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        naam TEXT, email TEXT, telefoon TEXT, locatie TEXT, stad TEXT, 
        datum TEXT, beschrijving TEXT, prioriteit TEXT, politie_zone TEXT,
        status TEXT DEFAULT 'open', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS police_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        municipalities TEXT, zone_name TEXT, arrondissement TEXT, province TEXT, embedding TEXT
    )`);

    // 2. NIEUWE OPZET VERKEERSREGELS
    // Gewone tabel voor tekst (GEEN embedding kolom meer hier!)
    db.run(`CREATE TABLE IF NOT EXISTS verkeersregels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT,
        content TEXT
    )`);

    // 3. VIRTUELE VECTOR TABEL
    // BGE-M3 = 1024 dimensies. We linken via rowid_ref naar verkeersregels.id
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_verkeersregels USING vec0(
        rowid_ref INTEGER PRIMARY KEY,
        embedding float[1024]
    )`);
  });
});

app.use(cors());
app.use(bodyParser.json());

// Routes
const initRag = require('./routes/rag');
const initPv = require('./routes/pv');
const initAdmin = require('./routes/admin');

initRag(app, db);
initPv(app, db);
initAdmin(app, db);

app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`🚀 Politie AI Server draait op http://localhost:${PORT}`));