const fs = require("node:fs");
const path = require("node:path");
const pdfParse = require("pdf-parse");
const sqlite3 = require("sqlite3").verbose();
const sqliteVec = require("sqlite-vec"); // <--- NIEUW
const axios = require("axios");

const db = new sqlite3.Database("./politie_dossiers.db");
const REGELS_DIR = path.resolve(__dirname, "../regels");

// Load extension
db.loadExtension(sqliteVec.getLoadablePath());

// 1. SLIMME CHUNKING MET OVERLAP
// Overlap zorgt dat zinnen op de grens niet verloren gaan.
function smartChunk(text, maxLen = 800, overlap = 150) {
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let buffer = '';
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Detecteer koppen (hoofdletters of Art. X)
        const isHeading = /^\d+\s|^[A-Z][A-Z ]{3,}$|^Art/.test(trimmed);
        
        if ((buffer + '\n' + trimmed).length > maxLen || (isHeading && buffer.length > 200)) {
            if (buffer) {
                chunks.push(buffer.trim());
                // Maak overlap voor de volgende chunk:
                // Pak de laatste 'overlap' karakters van de huidige buffer
                const words = buffer.split(' ');
                let overlapTxt = '';
                // Simpele woord-gebaseerde overlap
                if (words.length > 10) {
                    overlapTxt = words.slice(-20).join(' '); // Laatste ~20 woorden
                }
                buffer = overlapTxt + '\n' + trimmed;
            } else {
                buffer = trimmed;
            }
        } else {
            buffer += (buffer ? '\n' : '') + trimmed;
        }
    }
    if (buffer) chunks.push(buffer.trim());
    return chunks.filter(c => c.length > 50);
}

async function embed(text) {
    if (!text?.trim()) return null;
    try {
        const res = await axios.post(
            "http://127.0.0.1:11434/api/embed",
            { model: "bge-m3", input: text },
            { headers: { "Content-Type": "application/json" } }
        );
        // BGE-M3 geeft array van floats terug
        const vec = Array.isArray(res.data.embedding) ? res.data.embedding : res.data.embeddings?.[0];
        return vec || null;
    } catch (err) {
        console.error("Embed fout:", err.message);
        return null;
    }
}

// Checkt nu enkel op content in de tekst tabel
function chunkExists(content) {
    return new Promise(resolve => {
        db.get("SELECT id FROM verkeersregels WHERE content = ? LIMIT 1", [content], (err, row) => {
            resolve(!!row);
        });
    });
}

async function processPdfFile(filePath, fileLabel) {
    const buffer = fs.readFileSync(filePath);
    const pdf = await pdfParse(buffer);
    const chunks = smartChunk(pdf.text);
    console.log(`→ ${fileLabel}: ${chunks.length} chunks`);

    let inserted = 0, skipped = 0;

    for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        if (await chunkExists(c)) { skipped++; continue; }

        const vector = await embed(c);
        if (!vector) continue;

        await new Promise((resolve, reject) => {
            // Stap A: Insert Tekst
            const stmt = db.prepare("INSERT INTO verkeersregels (source_file, content) VALUES (?, ?)");
            stmt.run(fileLabel, c, function(err) {
                if (err) { stmt.finalize(); return reject(err); }
                
                const lastID = this.lastID; // ID van de tekstrij
                
                // Stap B: Insert Vector (Binair!)
                const vecStmt = db.prepare("INSERT INTO vec_verkeersregels(rowid_ref, embedding) VALUES (?, ?)");
                
                // Convert JS array to Float32Array to Buffer
                const floatArray = new Float32Array(vector);
                const blob = Buffer.from(floatArray.buffer);

                vecStmt.run(lastID, blob, (err2) => {
                    vecStmt.finalize();
                    stmt.finalize();
                    if (err2) reject(err2);
                    else resolve();
                });
            });
        });

        inserted++;
        if (i % 20 === 0) process.stdout.write('.');
    }
    console.log(`\n✔ Klaar: ${fileLabel} – nieuw: ${inserted}, overgeslagen: ${skipped}`);
}

async function main() {
    if (!fs.existsSync(REGELS_DIR)) {
        console.error("Map 'regels' niet gevonden");
        process.exit(1);
    }
    // Eerst tabel leegmaken? Optioneel, haal commentaar weg als je fresh start wil:
    // await new Promise(r => db.run("DELETE FROM verkeersregels; DELETE FROM vec_verkeersregels;", r));

    const files = fs.readdirSync(REGELS_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`📄 Gevonden PDF's: ${files.join(', ')}`);

    for (const f of files) {
        await processPdfFile(path.join(REGELS_DIR, f), f);
    }
    console.log("🎉 Klaar.");
    db.close();
}

main();