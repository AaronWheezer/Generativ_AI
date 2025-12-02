require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const fs = require('node:fs');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

// DE STRICTE LIJST DIE JIJ HEBT OPGEGEVEN
// We gebruiken deze om te checken of een regel hierop eindigt.
const KNOWN_ARRONDISSEMENTS = [
  "Marche-en-Famenne", // Langste eerst zetten is veiliger voor regex
  "Neufchâteau",
  "Dendermonde",
  "Oudenaarde",
  "Antwerpen",
  "Bruxelles",
  "Charleroi",
  "Mechelen",
  "Turnhout",
  "Tongeren",
  "Kortrijk",
  "Verviers",
  "Nivelles",
  "Brussel",
  "Hasselt",
  "Tournai",
  "Veurne",
  "Brugge",
  "Leuven",
  "Dinant",
  "Namur",
  "Arlon",
  "Eupen",
  "Liège",
  "Ieper",
  "Mons",
  "Gent",
  "Huy"
];

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/\-\s]/g, '')
    .trim();
}

// Check of tekst volledig HOOFDLETTERS is
function isAllUpperCase(str) {
    const clean = str.replace(/[^A-ZÀ-ÖØ-Þa-z]/g, ''); 
    if (clean.length < 2) return false;
    return clean === clean.toUpperCase();
}

async function embed(text) {
  if (!text || !text.trim()) return [];
  try {
    const res = await axios.post(`${OLLAMA_URL}/api/embed`, { model: EMBED_MODEL, input: text }, { headers: { 'Content-Type': 'application/json' } });
    if (Array.isArray(res.data.embedding)) return res.data.embedding;
    if (Array.isArray(res.data.embeddings)) return res.data.embeddings[0] || [];
    return [];
  } catch (e) {
    console.error('Embed error:', e.message);
    return [];
  }
}

function parsePoliceData(rawText) {
  const records = [];

  let cleanText = rawText
    .replace(/PAGE \d+/g, '')
    .replace(/Province de [^\n]+/gi, '')
    .replace(/Province du [^\n]+/gi, '')
    .replace(/Provincie [^\n]+/gi, '')
    .replace(/Arrondissement/gi, '')
    .replace(/Nom complémentaire/gi, '');

  // Splitsen op ID (5xxx)
  const blocks = cleanText.split(/(?=\b5[2-4]\d{2}\b)/g);

  for (const block of blocks) {
    if (!block.trim() || !/\d{4}/.test(block.substring(0, 10))) continue;

    const idMatch = block.match(/^(\d{4})/);
    if (!idMatch) continue;
    
    // Verwijder ID en maak plat
    let content = block.replace(/^(\d{4})/, '').replace(/\r?\n/g, ' ').trim();

    // STAP 1: CamelCase Fix (WavreNivelles -> Wavre Nivelles)
    content = content.replace(/([a-zà-ÿ])([A-ZÀ-Ö])/g, '$1 $2');

    let zoneName = null;
    let arrondissement = null;
    let municipalities = [];

    // STAP 2: Zone Naam (ALL CAPS) verwijderen
    const possibleZones = content.match(/\b(?:ZP|PZ|POLICE|ZONE|POLIZEIZONE)?\s*[A-ZÀ-ÖØ-Þ\-\s&]{3,}\b/g);
    if (possibleZones) {
        const bestMatch = possibleZones
            .filter(m => isAllUpperCase(m)) 
            .filter(m => !m.includes('/')) 
            .sort((a, b) => b.length - a.length)[0]; 

        if (bestMatch) {
            zoneName = bestMatch.trim();
            content = content.replace(bestMatch, '').replace(/\s+/g, ' ').trim();
        }
    }

    // STAP 3: ARRONDISSEMENT VERWIJDEREN (Via jouw lijst)
    // We loopen door jouw lijst en kijken of de tekst eindigt met een van die steden.
    for (const arr of KNOWN_ARRONDISSEMENTS) {
        // Regex: Zoek naar de stad aan het EINDE van de string ($), case insensitive
        // \s* betekent: mag spaties ervoor hebben, maar hoeft niet (voor WavreNivelles cases die Stap 1 misten)
        const regex = new RegExp(`[\\s\\/]*${arr}$`, 'i');
        
        if (regex.test(content)) {
            arrondissement = arr; 
            // Snij het arrondissement van de string af
            content = content.replace(regex, '').trim();
            break; // Gevonden, stop de loop
        }
    }

    // STAP 4: Gemeentes (Restant)
    content = content.replace(/\/$/, '').replace(/^\//, '').trim();

    if (content.includes('/')) {
        municipalities = content.split('/').map(m => m.trim()).filter(Boolean);
    } else if (content.length > 1) {
        municipalities = [content.trim()];
    }

    // STAP 5: Fallbacks
    if (!zoneName || zoneName.length < 2) {
        zoneName = municipalities.join('/'); 
    }

    // Filter foute data
    municipalities = municipalities.filter(m => m.length > 1 && !m.match(/^\d+$/));

    if (municipalities.length > 0) {
      records.push({
        id: idMatch[1],
        municipalities: municipalities,
        zoneName: zoneName,
        arrondissement: arrondissement
      });
    }
  }

  return records;
}

async function run() {
  const dbPath = path.join(__dirname, 'politie_dossiers.db');
  const db = new sqlite3.Database(dbPath);
  
  await new Promise(resolve => db.run('PRAGMA journal_mode = WAL;', resolve));
  
  // Tabel resetten
  await new Promise(resolve => db.run('DROP TABLE IF EXISTS police_zones', resolve));
  await new Promise(resolve =>
    db.run(`
      CREATE TABLE police_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        municipalities TEXT,
        zone_name TEXT,
        arrondissement TEXT,
        embedding TEXT
      )
    `, resolve)
  );

  const folder = path.join(__dirname, '../politie_zones');
  
  if (!fs.existsSync(folder)) {
      console.log("⚠️ Folder niet gevonden.");
  } else {
      const files = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.pdf'));
      let insertedCount = 0;

      for (const file of files) {
        const fullPath = path.join(folder, file);
        console.log(`Verwerken: ${file}`);
        const dataBuffer = fs.readFileSync(fullPath);
        const pdfData = await pdfParse(dataBuffer);
        const records = parsePoliceData(pdfData.text);

        for (const rec of records) {
          const muniNorm = rec.municipalities.map(m => normalize(m));
          const zoneNorm = normalize(rec.zoneName);
          const textToEmbed = `${muniNorm.join(' ')} ${zoneNorm}`;
          const vector = await embed(textToEmbed);

          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO police_zones (code, municipalities, zone_name, arrondissement, embedding) 
               VALUES (?, ?, ?, ?, ?)`,
              [
                rec.id, 
                JSON.stringify(rec.municipalities), 
                rec.zoneName, 
                rec.arrondissement, 
                JSON.stringify(vector)
              ],
              err => { if (err) reject(err); else resolve(); }
            );
          });
          insertedCount++;

          // DEBUG: Check de probleemgevallen
          if (['5267', '5271', '5277', '5279'].includes(rec.id)) {
            console.log(`✅ ID ${rec.id}:`);
            console.log(`   Gemeentes:      ${JSON.stringify(rec.municipalities)}`);
            console.log(`   Zone:           "${rec.zoneName}"`);
            console.log(`   Arrondissement: "${rec.arrondissement}"`);
            console.log('------------------------------------------------');
          }
        }
      }
      console.log(`Klaar! ${insertedCount} zones opgeslagen.`);
  }
  db.close();
}

run().catch(e => console.error(e));