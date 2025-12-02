const OpenAI = require('openai');
const axios = require('axios');
const fs = require('node:fs');
const pdfParse = require('pdf-parse');

// Config
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const CHAT_MODEL = process.env.CHAT_MODEL || 'llama3.1';

const openai = new OpenAI({ baseURL: `${OLLAMA_URL}/v1`, apiKey: 'ollama' });

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
      if (/^\d+$/.test(l)) return false;
      if (l.length < 4) return false;
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
        const combined = (embSim * 0.7) + (bestLex * 0.3);
        results.push({ ...r, embScore: embSim, lexScore: bestLex, score: combined });
      }
      const top = results.filter(r => r.score > 0.35).sort((a, b) => b.score - a.score).slice(0, 4);
      resolve(top);
    });
  });
}

module.exports = function initRag(app, db) {
  // Chat endpoint voor verkeersregels (RAG)
  app.post('/api/rag/chat', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: 'message required' });
      console.log(`🔎 RAG Zoeken voor: "${message}"`);
      const docs = await hybridRetrieve(db, message);
      if (docs.length === 0) {
        return res.json({ response: 'Ik kan helaas geen specifieke verkeersregels vinden die hierop aansluiten in mijn documentatie. Kunt u de vraag anders formuleren?', rag: { used: false }, mode: 'question' });
      }
      const contextText = docs.map(d => `--- BRON [ID:${d.id}] ---\n${d.content}`).join('\n\n');
      const systemPrompt = `Je bent Inspecteur Janssens, een behulpzame virtuele agent van de Belgische Politie.\nBeantwoord vragen over verkeersregels en wetgeving.\n\nINSTRUCTIES:\n1. Gebruik UITSLUITEND de onderstaande BRONNEN.\n2. Als het antwoord niet in de bronnen staat, zeg dan: "Helaas, daar heb ik geen specifieke wettekst over gevonden in mijn database." Verzin NOOIT regels.\n3. Wees formeel maar vriendelijk.\n4. Verwijs naar de bronnen als [Bron ID] wanneer je een feit noemt.\n5. Antwoord in het Nederlands.\n\nBRONNEN:\n${contextText}`;
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: message } ],
        temperature: 0.1,
      });
      const answer = completion.choices?.[0]?.message?.content || 'Er ging iets mis bij het genereren van een antwoord.';
      res.json({ response: answer, rag: { used: true, sources: docs }, mode: 'question' });
    } catch (e) {
      console.error('RAG Chat Error:', e);
      res.status(500).json({ error: 'Interne server fout' });
    }
  });

  // Ingest endpoint voor verkeersregels PDF
  app.post('/api/rag/ingest-pdf', async (req, res) => {
    try {
      const { path } = req.body;
      if (!path || !fs.existsSync(path)) return res.status(400).json({ error: 'Bestand niet gevonden' });
      console.log(`📄 Start verwerking PDF: ${path}`);
      const data = fs.readFileSync(path);
      const pdf = await pdfParse(data);
      const chunks = smartChunk(pdf.text);
      console.log(`🧩 PDF gesplitst in ${chunks.length} chunks. Start embedding...`);
      let processedCount = 0;
      const promises = chunks.map(async (chunk) => {
        const emb = await embed(chunk);
        if (!emb || emb.length === 0) return;
        return new Promise((resolve, reject) => {
          db.run('INSERT INTO verkeersregels (source_file, content, embedding) VALUES (?, ?, ?)',
            [path, chunk, JSON.stringify(emb)],
            (err) => { if (err) reject(err); else { processedCount++; resolve(); } },
          );
        });
      });
      await Promise.all(promises);
      console.log(`✅ Klaar! ${processedCount} chunks opgeslagen.`);
      res.json({ status: 'ok', inserted: processedCount });
    } catch (e) {
      console.error('RAG Ingest Error:', e);
      res.status(500).json({ error: 'Ingest mislukt.' });
    }
  });
};