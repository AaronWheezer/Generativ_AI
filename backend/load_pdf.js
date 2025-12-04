// Bulk ingest van ALLE PDF's in de map `regels/` met deduplicatie en slimme chunking.
// Uitvoerbaar met: `node .\load_pdf.js`

const fs = require("node:fs");
const path = require("node:path");
const pdfParse = require("pdf-parse");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const db = new sqlite3.Database("./politie_dossiers.db");
const REGELS_DIR = path.resolve(__dirname, "../regels");

// Heading-aware chunking (vergelijkbaar met server smartChunk) + max lengte.
function smartChunk(text, maxLen = 900) {
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let buffer = '';
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const isHeading = /^\d+\s|^[A-Z][A-Z ]{3,}$/.test(trimmed);
        if ((buffer + '\n' + trimmed).length > maxLen || isHeading) {
            if (buffer) chunks.push(buffer.trim());
            buffer = trimmed;
        } else {
            buffer += (buffer ? '\n' : '') + trimmed;
        }
    }
    if (buffer) chunks.push(buffer.trim());
    return chunks.filter(c => c.length > 40);
}

async function embed(text) {
    if (!text?.trim()) return [];
    try {
        const res = await axios.post(
            "http://localhost:11434/api/embed",
            { model: "bge-m3", input: text },
            { headers: { "Content-Type": "application/json" } }
        );
        if (Array.isArray(res.data.embedding)) return res.data.embedding;
        if (Array.isArray(res.data.embeddings)) return res.data.embeddings[0] || [];
        return [];
    } catch (err) {
        console.error("Fout bij embed:", err.message);
        return [];
    }
}

function chunkExists(content) {
    return new Promise(resolve => {
        db.get("SELECT id FROM verkeersregels WHERE content = ? LIMIT 1", [content], (err, row) => {
            if (err) return resolve(false);
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
        const exists = await chunkExists(c);
        if (exists) { skipped++; continue; }
        const emb = await embed(c);
        const stmt = db.prepare("INSERT INTO verkeersregels (content, embedding) VALUES (?, ?)");
        await new Promise(res => stmt.run(c, JSON.stringify(emb), () => { stmt.finalize(); res(); }));
        inserted++;
        if (i % 25 === 0) console.log(`  · verwerk chunk ${i+1}/${chunks.length}`);
    }
    console.log(`✔ Klaar: ${fileLabel} – nieuw: ${inserted}, overgeslagen (duplicaat): ${skipped}`);
}

async function main() {
    if (!fs.existsSync(REGELS_DIR)) {
        console.error("Map 'regels' niet gevonden:", REGELS_DIR);
        process.exit(1);
    }
    const files = fs.readdirSync(REGELS_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
    if (!files.length) {
        console.log("Geen PDF bestanden gevonden in 'regels'.");
        process.exit(0);
    }
    console.log(`📄 Gevonden PDF's: ${files.join(', ')}`);
    db.serialize(async () => {
        db.run("BEGIN");
        for (const f of files) {
            const full = path.join(REGELS_DIR, f);
            try {
                await processPdfFile(full, f);
            } catch (e) {
                console.error(`Fout bij verwerken van ${f}:`, e.message);
            }
        }
        db.run("COMMIT", () => {
            console.log("🎉 Alle PDF's verwerkt.");
            db.close();
        });
    });
}

main();
