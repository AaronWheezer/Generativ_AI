import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import * as sqliteVec from 'sqlite-vec'; 

// Importeer je routes
import initRag from './routes/rag.js';
import initPv from './routes/pv.js';
import initAdmin from './routes/admin.js';

dotenv.config();

// Fix voor __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE SETUP (GEFIXT) ---
const dbPath = path.join(__dirname, 'politie_dossiers.db');

// STAP 1: Initialiseer verbose modus apart
const sqlite = sqlite3.verbose();

// STAP 2: Maak de database aan met de 'new' keyword op het object uit stap 1
const db = new sqlite.Database(dbPath, (err) => {
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

    db.run(`CREATE TABLE IF NOT EXISTS verkeersregels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT,
        content TEXT
    )`);

    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_verkeersregels USING vec0(
        rowid_ref INTEGER PRIMARY KEY,
        embedding float[1024]
    )`);
  });
});

app.use(cors());
app.use(bodyParser.json());

// Routes Initialiseren
initRag(app, db);
initPv(app, db);
initAdmin(app, db);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`🚀 Politie AI Server draait op http://localhost:${PORT}`));