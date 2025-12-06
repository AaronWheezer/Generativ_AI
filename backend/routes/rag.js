const OpenAI = require("openai");
const axios = require("axios");
const fs = require("node:fs");
const pdfParse = require("pdf-parse");

// ---------------------------------------------------
// CONFIG
// ---------------------------------------------------

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.EMBED_MODEL || "bge-m3";
const CHAT_MODEL = process.env.CHAT_MODEL || "mistral-nemo"; // of llama3.2

const openai = new OpenAI({
  baseURL: `${OLLAMA_URL}/v1`,
  apiKey: "ollama",
});

// ---------------------------------------------------
// HELPER: EMBEDDING
// ---------------------------------------------------

async function embed(text) {
  if (!text?.trim()) return null;

  try {
    const res = await axios.post(
      `${OLLAMA_URL}/api/embed`,
      { model: EMBED_MODEL, input: text },
      { headers: { "Content-Type": "application/json" } }
    );

    if (Array.isArray(res.data.embedding)) return res.data.embedding;
    if (Array.isArray(res.data.embeddings)) return res.data.embeddings[0];

    return null;
  } catch (e) {
    console.error("⚠️ Embed error:", e.message);
    return null;
  }
}

// ---------------------------------------------------
// HELPER: LEGAL TEXT CLEANING
// ---------------------------------------------------

function cleanLegalText(text) {
  return text
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (/^\d+$/.test(l)) return false;
      if (l.includes("BELGISCH STAATSBLAD")) return false;
      if (l.length < 4) return false;
      return true;
    })
    .join("\n");
}

// ---------------------------------------------------
// HELPER: SMART CHUNKING WITH OVERLAP
// ---------------------------------------------------

function smartChunk(text, maxLen = 800) {
  const cleaned = cleanLegalText(text);
  const lines = cleaned.split(/\r?\n/);
  const chunks = [];
  let buffer = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isHeading = /^Art(\.|ikel)\s?\d+|HOOFDSTUK/i.test(trimmed);
    const tooLarge = buffer.length > maxLen;

    if (
      (tooLarge && trimmed.length < 100) ||
      (isHeading && buffer.length > 200)
    ) {
      if (buffer) {
        chunks.push(buffer.trim());

        // overlap
        const words = buffer.split(" ");
        let overlap = "";
        if (words.length > 20) {
          overlap = words.slice(-20).join(" ") + " ... ";
        }
        buffer = overlap + trimmed;
      } else {
        buffer = trimmed;
      }
    } else {
      buffer += (buffer ? "\n" : "") + trimmed;
    }
  }

  if (buffer) chunks.push(buffer.trim());
  return chunks.filter((c) => c.length > 50);
}

// ---------------------------------------------------
// VECTOR SEARCH (sqlite-vec)
// ---------------------------------------------------

async function vectorSearch(db, queryText) {
  const vector = await embed(queryText);
  if (!vector) return [];

  const floatArray = new Float32Array(vector);
  const blob = Buffer.from(floatArray.buffer);

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT vr.content, vr.source_file, vec.distance
      FROM vec_verkeersregels vec
      JOIN verkeersregels vr ON vec.rowid_ref = vr.id
      WHERE vec.embedding MATCH ?
      AND k = 5
      ORDER BY vec.distance ASC
    `;

    db.all(sql, [blob], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ---------------------------------------------------
// MAIN MODULE
// ---------------------------------------------------

module.exports = function initRag(app, db) {

  // =======================================================
  // CHAT: INSPECTEUR JANSSENS (STRICT – ANTI-HALLUCINATIE)
  // =======================================================

  app.post("/api/rag/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message?.trim())
        return res.status(400).json({ error: "Bericht vereist" });

      console.log(`🔎 Vraag: "${message}"`);

      const docs = await vectorSearch(db, message);
      const THRESHOLD = 1.35;
      const relevantDocs = docs.filter((d) => d.distance < THRESHOLD);

      let systemPrompt = "";
      let usedRAG = false;

      // ---------------------------------------------------
      // SCENARIO A: RAG BRONNEN GEVONDEN
      // ---------------------------------------------------

      if (relevantDocs.length > 0) {
        usedRAG = true;

        const context = relevantDocs
          .map((d) => d.content)
          .join("\n\n");

        systemPrompt = `
Je bent Inspecteur Janssens, een officiële en feitelijke AI-assistent van de Belgische Politie.

Je taak:
- Geef enkel antwoorden die *letterlijk* in de context staan.
- Geen bronnen vermelden.
- Geen artikelnummers verzinnen.
- Geen interpretaties, enkel tekstgetrouwe info.
- Indien de tekst geen exact antwoord bevat, zeg precies:
  "Ik kan dit specifieke antwoord niet terugvinden in de wetteksten die ik tot mijn beschikking heb."
- Blijf strikt, feitelijk en kort.

CONTEXT (wettekst):
${context}

Vraag: "${message}"
`;
      }

      // ---------------------------------------------------
      // SCENARIO B: GEEN RAG → FALLBACK MET GUARDRAILS
      // ---------------------------------------------------

      else {
        console.log("⚠️ Geen relevante wetteksten → fallback");
        usedRAG = false;

        systemPrompt = `
Je bent Inspecteur Janssens, een AI-assistent van de Belgische Politie.

Er zijn geen relevante wetteksten gevonden.

BELANGRIJK - GUARDRAILS:
1. Controleer EERST of de vraag gaat over:
   - Verkeer (verkeersregels, boetes, snelheidsbeperkingen, parkeren, etc.)
   - Belgisch politiewerk (PV, aangifte, procedures)
   - Belgische wetgeving of veiligheid

2. Als de vraag NIET gaat over bovenstaande onderwerpen (bijv. recepten, weer, sport, algemene kennis):
   Antwoord ENKEL:
   "Mijn excuses, maar ik ben gespecialiseerd in Belgische verkeersregels en politiezaken. Voor andere vragen kan ik u helaas niet helpen. Heeft u een vraag over verkeer of veiligheid?"

3. Als de vraag WEL relevant is:
   Begin met:
   "Mijn excuses, ik vind hierover geen specifiek wetsartikel in mijn huidige databank, maar algemeen geldt..."
   Geef daarna een kort, algemeen advies volgens Belgische verkeersregels.

4. Nooit juridisch advies.
5. Geen bronnen of artikelnummers verzinnen.
6. Blijf neutraal en feitelijk.

Vraag: "${message}"
`;
      }

      // ---------------------------------------------------
      // MODEL CALL
      // ---------------------------------------------------

      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: usedRAG ? 0.1 : 0.5,
      });

      let answer = completion.choices?.[0]?.message?.content || "";

      // ---------------------------------------------------
      // FAILSAFE: RAG ZONDER ANTWOORD → FORCED FALLBACK MET GUARDRAILS
      // ---------------------------------------------------

      if (
        usedRAG &&
        answer.toLowerCase().includes("ik kan dit specifieke antwoord niet terugvinden")
      ) {
        console.log("⚠️ RAG-fail → forced fallback");

        const fbPrompt = `
Je bent Inspecteur Janssens, een AI-assistent van de Belgische Politie.

Er kon geen bruikbare wettekst gevonden worden.

GUARDRAILS:
1. Controleer of de vraag gaat over verkeer, Belgisch politiewerk, of Belgische wetgeving/veiligheid.

2. Als NIET relevant (bijv. recepten, weer, sport):
   Antwoord: "Mijn excuses, maar ik ben gespecialiseerd in Belgische verkeersregels en politiezaken. Voor andere vragen kan ik u helaas niet helpen. Heeft u een vraag over verkeer of veiligheid?"

3. Als WEL relevant:
   Begin verplicht met:
   "Mijn excuses, ik vind hierover geen specifiek wetsartikel in mijn huidige databank, maar algemeen geldt..."
   Geef daarna een neutraal, kort verkeersadvies.
`;

        const fb = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: fbPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.5,
        });

        answer = fb.choices?.[0]?.message?.content || answer;
        usedRAG = false;
      }

      // ---------------------------------------------------
      // RESPONSE
      // ---------------------------------------------------

      res.json({
        response: answer,
        rag: {
          used: usedRAG,
          sources: usedRAG
            ? relevantDocs.map((d) => ({
                dist: d.distance,
                file: d.source_file,
              }))
            : [],
        },
      });

    } catch (e) {
      console.error("RAG Chat Error:", e);
      res.status(500).json({ error: "Interne fout." });
    }
  });

  // =======================================================
  // INGEST PDF
  // =======================================================

  app.post("/api/rag/ingest-pdf", async (req, res) => {
    try {
      const { path: filePath } = req.body;
      if (!filePath || !fs.existsSync(filePath))
        return res.status(400).json({ error: "Bestand niet gevonden." });

      console.log(`📄 Ingest PDF: ${filePath}`);

      const data = fs.readFileSync(filePath);
      const pdf = await pdfParse(data);

      const chunks = smartChunk(pdf.text);
      console.log(`🧩 ${chunks.length} chunks`);

      const fileName = filePath.split(/[/\\]/).pop();
      let count = 0;

      for (const chunk of chunks) {
        const emb = await embed(chunk);
        if (!emb) continue;

        await new Promise((resolve, reject) => {
          const stmt = db.prepare(
            "INSERT INTO verkeersregels (source_file, content) VALUES (?, ?)"
          );

          stmt.run(fileName, chunk, function (err) {
            if (err) {
              stmt.finalize();
              return reject(err);
            }

            const id = this.lastID;

            const vecStmt = db.prepare(
              "INSERT INTO vec_verkeersregels (rowid_ref, embedding) VALUES (?, ?)"
            );

            const float32 = new Float32Array(emb);
            const buf = Buffer.from(float32.buffer);

            vecStmt.run(id, buf, (err2) => {
              vecStmt.finalize();
              stmt.finalize();
              if (err2) reject(err2);
              else resolve();
            });
          });
        });

        count++;
      }

      res.json({ status: "ok", inserted: count });
    } catch (e) {
      console.error("INGEST Error:", e);
      res.status(500).json({ error: "Ingest mislukt." });
    }
  });
};
