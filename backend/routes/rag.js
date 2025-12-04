const OpenAI = require('openai');
const axios = require('axios');
const fs = require('node:fs');
const pdfParse = require('pdf-parse');

// Config
// We gebruiken hier bge-m3 zoals besproken, dit werkt beter voor NL
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'bge-m3'; 
const CHAT_MODEL = process.env.CHAT_MODEL || 'mistral-nemo';

const openai = new OpenAI({ baseURL: `${OLLAMA_URL}/v1`, apiKey: 'ollama' });

// --- HELPER FUNCTIES ---

async function embed(text) {
  if (!text?.trim()) return [];
  try {
    const res = await axios.post(`${OLLAMA_URL}/api/embed`, {
      model: EMBED_MODEL,
      input: text,
    }, { headers: { 'Content-Type': 'application/json' } });
    if (Array.isArray(res.data.embedding)) return res.data.embedding;
    if (Array.isArray(res.data.embeddings)) return res.data.embeddings[0] || [];
    return [];
  } catch (e) {
    console.error('⚠️ Embed error:', e.message);
    return [];
  }
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return (normA === 0 || normB === 0) ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function cleanLegalText(text) {
  return text.split('\n')
    .filter(line => {
      const l = line.trim();
      if (/^\d+$/.test(l)) return false; // Alleen nummers weg
      if (l.length < 4) return false;    // Te korte regels weg
      if (l.includes('BELGISCH STAATSBLAD')) return false;
      return true;
    })
    .join('\n');
}

function smartChunk(text) {
  const cleaned = cleanLegalText(text);
  const lines = cleaned.split(/\r?\n/);
  const chunks = [];
  let buffer = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Detecteer nieuw artikel (Art. 1, Artikel 2, etc.)
    const isNewArticle = /^Art(\.|ikel)\s?\d+/i.test(trimmed);
    const bufferTooBig = buffer.length > 900;
    
    if ((bufferTooBig && (trimmed.length < 100 || isNewArticle)) || (isNewArticle && buffer.length > 200)) {
      if (buffer) chunks.push(buffer.trim());
      buffer = trimmed;
    } else {
      buffer += (buffer ? '\n' : '') + trimmed;
    }
  }
  if (buffer) chunks.push(buffer.trim());
  return chunks.filter(c => c.length > 50);
}

const SYNONYMS = [
  ['snelheid', 'maximumsnelheid', 'snelheidslimiet', 'km/u'],
  ['autosnelweg', 'autostrade', 'snelweg'],
  ['trottoir', 'voetpad', 'stoep'],
  ['parkeren', 'parkeer', 'stationeren', 'stilstaan'],
  ['fiets', 'rijwiel', 'elektrische fiets'],
  ['bebouwde kom', 'bebouwde_kom', 'dorpskern'],
];

function expandQuery(original) {
  const lower = original.toLowerCase();
  const expansions = new Set([lower]);
  for (const group of SYNONYMS) {
    if (group.some(term => lower.includes(term))) {
      for (const term of group) expansions.add(lower.replace(new RegExp(`\\b(${group.join('|')})\\b`, 'g'), term));
      group.forEach(t => expansions.add(t));
    }
  }
  return Array.from(expansions).slice(0, 10);
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').split(/\s+/).filter(Boolean);
}

function lexicalScore(queryTokens, chunk) {
  const chunkTokens = new Set(tokenize(chunk));
  let match = 0;
  const uniqueQuery = new Set(queryTokens);
  for (const t of uniqueQuery) if (chunkTokens.has(t)) match++;
  return uniqueQuery.size ? match / uniqueQuery.size : 0;
}

// Hybride zoekfunctie met drempelwaarde
async function hybridRetrieve(db, query) {
  const expansions = expandQuery(query);
  const baseEmb = await embed(query);
  return new Promise((resolve, reject) => {
    db.all('SELECT id, content, embedding FROM verkeersregels', [], async (err, rows) => {
      if (err) return reject(err);
      const results = [];
      for (const r of rows) {
        let embArr = [];
        try { embArr = JSON.parse(r.embedding); } catch { continue; }
        
        const embSim = (baseEmb.length && embArr.length) ? cosineSimilarity(baseEmb, embArr) : 0;
        
        let bestLex = 0;
        for (const exp of expansions) {
          const ls = lexicalScore(tokenize(exp), r.content);
          if (ls > bestLex) bestLex = ls;
        }
        
        // Weging: 70% vector, 30% trefwoorden
        const combined = (embSim * 0.7) + (bestLex * 0.3);
        results.push({ ...r, embScore: embSim, lexScore: bestLex, score: combined });
      }
      
      // FILTER: Alleen resultaten met score > 0.35
      // Als alles hieronder valt, wordt docs.length 0 en treedt Fallback in werking.
      const top = results.filter(r => r.score > 0.35).sort((a, b) => b.score - a.score).slice(0, 4);
      resolve(top);
    });
  });
}

// --- MAIN MODULE ---

module.exports = function initRag(app, db) {
  
  // Chat endpoint met MODEL CHAINING / FALLBACK
  app.post('/api/rag/chat', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: 'message required' });
      
      console.log(`🔎 RAG Zoeken voor: "${message}"`);
      const docs = await hybridRetrieve(db, message);
      
      let systemPrompt = '';
      let usedRAG = false;
      let modelTemp = 0.7; // Standaard creativiteit voor fallback

      // --- BRANCH 1: RAG SUCCESVOL (Bronnen gevonden) ---
      if (docs.length > 0) {
        usedRAG = true;
        modelTemp = 0.2; // Lager voor feitelijkheid
        const contextText = docs.map(d => `--- BRON [ID:${d.id}] ---\n${d.content}`).join('\n\n');
        
        systemPrompt = `Je bent Inspecteur Janssens, een expert in Belgische verkeerswetgeving.

CONTEXT:
${contextText}

INSTRUCTIES:
1. Gebruik de bovenstaande BRONNEN om de vraag te beantwoorden.
2. Vertaal de juridische wettekst naar HELDER, BEGRIJPELIJK Nederlands voor de burger. Leg termen uit indien nodig.
3. Wees formeel maar vriendelijk.
4. Citeer je bronnen door [Bron ID] toe te voegen aan het einde van de zin waar je de info vandaan haalde.
5. Als de bronnen het antwoord NIET bevatten, verzin dan niets.`;

      } 
      // --- BRANCH 2: FALLBACK (Geen relevante bronnen) ---
      else {
        usedRAG = false;
        modelTemp = 0.7; // Iets hoger zodat hij vlotter praat uit algemene kennis
        console.log('⚠️ Geen RAG-docs gevonden, schakel over naar Fallback.');

        systemPrompt = `Je bent Inspecteur Janssens, een behulpzame virtuele politieagent.

De gebruiker stelt een vraag waarover GEEN specifieke wettekst is gevonden in jouw huidige database.

INSTRUCTIES:
1. Beantwoord de vraag op basis van je ALGEMENE KENNIS over verkeersveiligheid en gezond verstand.
2. Je MOET je antwoord beginnen met de volgende disclaimer: "Ik heb hiervoor geen specifiek wetsartikel gevonden in mijn databank, maar in het algemeen geldt..."
3. Wees voorzichtig met het noemen van specifieke boetebedragen als je het niet zeker weet.
4. Focus op veiligheid en hoffelijkheid in het verkeer.`;
      }

      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [ 
          { role: 'system', content: systemPrompt }, 
          { role: 'user', content: message } 
        ],
        temperature: modelTemp,
      });

      const answer = completion.choices?.[0]?.message?.content || 'Er ging iets mis bij het genereren van een antwoord.';
      
      // Stuur terug inclusief status zodat frontend kan zien wat er gebeurde
      res.json({ 
        response: answer, 
        rag: { 
          used: usedRAG, 
          sources: docs 
        }, 
        mode: usedRAG ? 'rag_verified' : 'fallback_general' 
      });

    } catch (e) {
      console.error('RAG Chat Error:', e);
      res.status(500).json({ error: 'Interne server fout' });
    }
  });

  // Ingest endpoint (blijft hetzelfde, maar gebruikt nu BGE-M3 config)
  app.post('/api/rag/ingest-pdf', async (req, res) => {
    try {
      const { path } = req.body;
      if (!path || !fs.existsSync(path)) return res.status(400).json({ error: 'Bestand niet gevonden' });
      
      console.log(`📄 Start verwerking PDF: ${path}`);
      const data = fs.readFileSync(path);
      const pdf = await pdfParse(data);
      const chunks = smartChunk(pdf.text);
      
      console.log(`🧩 PDF gesplitst in ${chunks.length} chunks. Start embedding met ${EMBED_MODEL}...`);
      let processedCount = 0;
      
      // Batch processing om server niet te overbelasten
      const batchSize = 5;
      for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          await Promise.all(batch.map(async (chunk) => {
             const emb = await embed(chunk);
             if (!emb || emb.length === 0) return;
             return new Promise((resolve, reject) => {
                db.run('INSERT INTO verkeersregels (source_file, content, embedding) VALUES (?, ?, ?)',
                  [path, chunk, JSON.stringify(emb)],
                  (err) => { if (err) reject(err); else { processedCount++; resolve(); } }
                );
             });
          }));
      }

      console.log(`✅ Klaar! ${processedCount} chunks opgeslagen.`);
      res.json({ status: 'ok', inserted: processedCount });
    } catch (e) {
      console.error('RAG Ingest Error:', e);
      res.status(500).json({ error: 'Ingest mislukt.' });
    }
  });
};