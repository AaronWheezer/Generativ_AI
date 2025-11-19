require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const sqlite3 = require('sqlite3').verbose();
const axios = require("axios");

const app = express();
const PORT = 3000;

// --- OLlama AI Client ---
const openai = new OpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
});

// --- DATABASE ---
const db = new sqlite3.Database('./politie_dossiers.db', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database.');

        // Dossiers
        db.run(`
            CREATE TABLE IF NOT EXISTS dossiers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                datum TEXT,
                beschrijving TEXT,
                samenvatting TEXT,
                prioriteit TEXT,
                status TEXT DEFAULT 'open'
            )
        `);

        // Verkeersregels (RAG)
        db.run(`
            CREATE TABLE IF NOT EXISTS verkeersregels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT,
                embedding TEXT
            )
        `);
    }
});

app.use(cors());
app.use(bodyParser.json());

let conversationContext = {};
// Session state voor aangifte flow (uitgebreid)
// sessionId -> {
//   mode: 'idle'|'report'|'question',
//   report: {
//     step: string,
//     fields: {
//       name, description, situation, location, datetime, suspectKnown, suspectDetails, evidence, additional: []
//     },
//     createdDossierIds: [],
//     pendingEditField: null
//   }
// }
const sessionState = {};

// ----------------------- EMBEDDING VIA OLLAMA -----------------------
async function embed(text) {
    if (!text?.trim()) return [];
    try {
        const res = await axios.post("http://localhost:11434/api/embed", {
            model: "nomic-embed-text",
            input: text
        }, { headers: { "Content-Type": "application/json" } });
        if (Array.isArray(res.data.embedding)) return res.data.embedding;
        if (Array.isArray(res.data.embeddings)) return res.data.embeddings[0] || [];
        return [];
    } catch (e) {
        console.error("Embed error", e.message);
        return [];
    }
}

// ----------------------- COSINE SIM -----------------------
function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
    const len = Math.min(a.length, b.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
        const av = a[i];
        const bv = b[i];
        if (typeof av !== 'number' || typeof bv !== 'number') continue;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ----------------------- VERKEERSVRAAG DETECTIE -----------------------
function isTrafficQuestion(msg) {
    const words = ["snel", "boete", "verkeer", "voorrang", "wegcode", "rijden", "rijstrook", "snelheid"];
    return words.some(w => msg.toLowerCase().includes(w));
}

// ----------------------- HYBRID RAG SEARCH (embedding + lexical + expansions) -----------------------
const SYNONYMS = [
  ['snelheid','maximumsnelheid','snelheidslimiet'],
  ['autosnelweg','autostrade','snelweg'],
  ['trottoir','voetpad','stoep'],
  ['parkeren','parkeer','stationeren'],
  ['fiets','rijwiel'],
  ['bebouwde kom','bebouwde_kom']
];

function expandQuery(original) {
    const lower = original.toLowerCase();
    const expansions = new Set([lower]);
    for (const group of SYNONYMS) {
        if (group.some(term => lower.includes(term))) {
            for (const term of group) expansions.add(lower.replace(/\b(?:" + group.join('|') + ")\b/, term));
            group.forEach(t => expansions.add(t));
        }
    }
    return Array.from(expansions).slice(0, 12); // cap expansions
}

function tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g,' ').split(/\s+/).filter(Boolean);
}

function lexicalScore(queryTokens, chunk) {
    const chunkTokens = new Set(tokenize(chunk));
    let match = 0;
    const uniqueQuery = Array.from(new Set(queryTokens));
    for (const t of uniqueQuery) if (chunkTokens.has(t)) match++;
    return uniqueQuery.length ? match / uniqueQuery.length : 0;
}

async function hybridRetrieve(query) {
    const expansions = expandQuery(query);
    const baseEmb = await embed(query);
    return new Promise((resolve, reject) => {
        db.all("SELECT id, content, embedding FROM verkeersregels", [], async (err, rows) => {
            if (err) return reject(err);
            const results = [];
            for (const r of rows) {
                let embArr = [];
                if (r.embedding) {
                    try { embArr = JSON.parse(r.embedding); } catch { /* ignore */ }
                }
                if (!Array.isArray(embArr) || embArr.length === 0) {
                    embArr = await embed(r.content);
                    if (embArr.length) db.run("UPDATE verkeersregels SET embedding=? WHERE id=?", [JSON.stringify(embArr), r.id]);
                }
                const embSim = baseEmb.length ? cosineSimilarity(baseEmb, embArr) : 0;
                // Best lexical score across expansions
                let bestLex = 0;
                for (const exp of expansions) {
                    const qTokens = tokenize(exp);
                    const ls = lexicalScore(qTokens, r.content);
                    if (ls > bestLex) bestLex = ls;
                }
                const combined = (embSim * 0.6) + (bestLex * 0.4);
                results.push({ id: r.id, content: r.content, embScore: embSim, lexScore: bestLex, score: combined });
            }
            const MIN_SCORE = 0.15; // slightly lower due to hybrid
            const top = results.filter(r => r.score >= MIN_SCORE)
                               .sort((a,b)=> b.score - a.score)
                               .slice(0,5);
            resolve(top);
        });
    });
}

// (Tools verwijderd – PV creatie gebeurt server-side)

function determinePriority(description, suspectKnown) {
    if (!description) return 'MIDDEN';
    const d = description.toLowerCase();
    if (/overvallen|geweld|mes|wapen|inbraak|bedreigd|brand|aanranding|vernieling/.test(d)) return 'HOOG';
    if (/diefstal|gestolen|fiets|gsm|telefoon|portemonnee|fraude|scam/.test(d)) return suspectKnown ? 'MIDDEN' : 'LAAG';
    return 'MIDDEN';
}

function truncate(t, max=180) { return t && t.length > max ? t.slice(0,max)+"..." : t; }

function buildSummary(f) {
    return [
        `Naam: ${f.name || '-'}`,
        `Beschrijving: ${truncate(f.description) || '-'}`,
        `Situatie: ${truncate(f.situation) || '-'}`,
        `Locatie: ${f.location || '-'}`,
        `Datum/Tijd: ${f.datetime || '-'}`,
        `Dader bekend: ${f.suspectKnown === true ? 'Ja' : f.suspectKnown === false ? 'Nee' : '-'}`,
        `Details dader: ${truncate(f.suspectDetails,120) || '-'}`,
        `Bewijs/Getuigen: ${truncate(f.evidence,120) || '-'}`,
        f.additional?.length ? `Extra: ${truncate(f.additional.join(' | '),160)}` : ''
    ].filter(Boolean).join(' \n');
}

async function createDossier(sessionId) {
    const st = sessionState[sessionId];
    const f = st.report.fields;
    const priority = determinePriority(f.description, f.suspectKnown);
    const summary = buildSummary(f);
    return new Promise(resolve => {
        const stmt = db.prepare("INSERT INTO dossiers (datum, beschrijving, samenvatting, prioriteit) VALUES (?, ?, ?, ?)");
        stmt.run(f.datetime || new Date().toISOString(), f.description || '(geen beschrijving)', summary, priority, function(err) {
            if (err) {
                console.error(err);
                resolve("Opslaan van het proces-verbaal mislukte.");
            } else {
                const id = this.lastID;
                st.report.createdDossierIds.push(id);
                st.mode = 'idle';
                const oldReport = st.report;
                st.report = {
                    step: 'done',
                    fields: { name:null, description:null, situation:null, location:null, datetime:null, suspectKnown:null, suspectDetails:null, evidence:null, additional:[] },
                    createdDossierIds: oldReport.createdDossierIds,
                    pendingEditField: null
                };
                resolve(`Proces-verbaal opgeslagen (#${id}). Prioriteit: ${priority}. Wilt u nog iets anders doen?`);
            }
        });
        stmt.finalize();
    });
}

// ----------------------- AI FLOW (intent + RAG, geen tool calls) -----------------------
async function getAIResponse(sessionId, message) {
    if (!sessionState[sessionId]) {
        sessionState[sessionId] = {
            mode: 'idle',
            report: {
                step: 'start',
                fields: { name:null, description:null, situation:null, location:null, datetime:null, suspectKnown:null, suspectDetails:null, evidence:null, additional:[] },
                createdDossierIds: [],
                pendingEditField: null
            }
        };
    }
    const st = sessionState[sessionId];
    const lower = message.toLowerCase();

    // Intent classification
    const incidentRegex = /(aangifte|bestolen|gestolen|diefstal|inbraak|overvallen|bedreigd|mishandeld|geweld|aanranding|vernield|vernieling|fraude|scam|fiets|gsm|telefoon|portemonnee)/;
    const isIncidentTrigger = incidentRegex.test(lower);
    const isQuestion = /\?|wat|hoe|mag|welke|wanneer/.test(lower) && !isIncidentTrigger;

    // If idle ask branching question unless user already indicates
    if (st.mode === 'idle' && st.report.step === 'start') {
        if (isIncidentTrigger && !isQuestion) {
            st.mode = 'report';
            st.report.step = 'ask_name';
            st.report.fields.description = message; // initial description captured
            return { reply: 'Gaat dit over een aangifte. Wat is uw naam?', rag: { used: false } };
        }
        if (/aangifte|incident|melding/.test(lower)) {
            st.mode = 'report';
            st.report.step = 'ask_name';
            return { reply: 'We starten een aangifte. Wat is uw naam?', rag: { used: false } };
        }
        if (/vraag|verkeer|wegcode/.test(lower) || isQuestion) {
            st.mode = 'question';
        } else {
            return { reply: 'Gaat dit over een aangifte die u wilt maken of een algemene vraag?', rag: { used: false } };
        }
    }

    // REPORT MODE FLOW
    if (st.mode === 'report') {
        const f = st.report.fields;
        switch (st.report.step) {
            case 'ask_name':
                f.name = message.trim();
                st.report.step = 'ask_description';
                return { reply: 'Dank u. Beschrijf kort wat er is gebeurd.', rag: { used: false } };
            case 'ask_description':
                f.description = message.trim();
                st.report.step = 'ask_suspect_known';
                return { reply: 'Is er een dader bekend? (ja/nee)', rag: { used: false } };
            case 'ask_suspect_known': {
                if (/ja|wel|bekend/.test(lower)) { f.suspectKnown = true; st.report.step = 'ask_suspect_details'; return { reply: 'Kunt u de dader beschrijven (naam, kenmerken)?', rag: { used: false } }; }
                if (/nee|onbekend|geen/.test(lower)) { f.suspectKnown = false; st.report.step = 'ask_location'; return { reply: 'Waar is dit gebeurd?', rag: { used: false } }; }
                return { reply: 'Gelieve "ja" of "nee" te antwoorden. Is de dader bekend?', rag: { used: false } };
            }
            case 'ask_suspect_details':
                f.suspectDetails = message.trim();
                st.report.step = 'ask_location';
                return { reply: 'Waar is dit gebeurd?', rag: { used: false } };
            case 'ask_location':
                f.location = message.trim();
                st.report.step = 'ask_datetime';
                return { reply: 'Wanneer is dit gebeurd? (datum/tijd)', rag: { used: false } };
            case 'ask_datetime':
                f.datetime = message.trim();
                st.report.step = 'ask_situation';
                return { reply: 'Beschrijf de situatie/context (optioneel, anders zeg "skip").', rag: { used: false } };
            case 'ask_situation':
                if (!/skip|geen|nvt/i.test(message)) f.situation = message.trim();
                st.report.step = 'ask_evidence';
                return { reply: 'Zijn er bewijzen of getuigen? (beschrijf, of zeg "nee")', rag: { used: false } };
            case 'ask_evidence':
                if (!/nee|geen/i.test(lower)) f.evidence = message.trim();
                st.report.step = 'ask_extra_loop';
                return { reply: 'Heeft u nog extra relevante informatie? (typ of zeg "nee")', rag: { used: false } };
            case 'ask_extra_loop':
                if (/nee|geen/i.test(lower)) {
                    st.report.step = 'confirm_summary';
                    const summary = buildSummary(f);
                    return { reply: `Samenvatting:\n${summary}\nIs dit correct en wilt u indienen als proces-verbaal? (ja/nee)`, rag: { used: false } };
                } else {
                    f.additional.push(message.trim());
                    return { reply: 'Nog meer extra info? (typ of zeg "nee")', rag: { used: false } };
                }
            case 'confirm_summary':
                if (/ja|correct|ok|oke|okay/.test(lower)) {
                    st.report.step = 'finalize';
                    const result = await createDossier(sessionId);
                    return { reply: result, rag: { used: false } };
                }
                if (/nee|niet|fout|aanpassen/.test(lower)) {
                    st.report.step = 'edit_select';
                    return { reply: 'Welke veld wilt u wijzigen? (naam, beschrijving, situatie, locatie, datum, dader, bewijs, extra)', rag: { used: false } };
                }
                return { reply: 'Antwoord alstublieft met ja of nee.', rag: { used: false } };
            case 'edit_select': {
                const map = {
                    'naam':'name','beschrijving':'description','situatie':'situation','locatie':'location','datum':'datetime','tijd':'datetime','dader':'suspectDetails','bewijs':'evidence','extra':'additional'
                };
                let chosen = null;
                for (const k of Object.keys(map)) if (lower.includes(k)) chosen = map[k];
                if (!chosen) return { reply: 'Ik herkende het veld niet. Kies uit: naam, beschrijving, situatie, locatie, datum, dader, bewijs, extra', rag: { used: false } };
                st.report.pendingEditField = chosen;
                st.report.step = 'edit_value';
                return { reply: `Geef nieuwe waarde voor ${chosen}.`, rag: { used: false } };
            }
            case 'edit_value':
                const field = st.report.pendingEditField;
                if (field === 'additional') {
                    f.additional.push(message.trim());
                } else {
                    f[field] = message.trim();
                }
                st.report.pendingEditField = null;
                st.report.step = 'confirm_summary';
                const summary2 = buildSummary(f);
                return { reply: `Aangepaste samenvatting:\n${summary2}\nIs dit nu correct? (ja/nee)`, rag: { used: false } };
            default:
                return { reply: 'Workflow status onbekend, we beginnen opnieuw. Typ iets om te starten.', rag: { used: false } };
        }
    }

    // QUESTION MODE (RAG) of algemene vraag
    if (st.mode === 'question' || isTrafficQuestion(message) || isQuestion) {
        const docs = await hybridRetrieve(message);
        if (docs.length) {
            const labeled = docs.map(d => `[Doc ${d.id}]\n${d.content}`).join("\n\n");
            const citationIds = docs.map(d=>d.id).join(', ');
            const prompt = `Je bent een Belgische politie assistent. Gebruik uitsluitend de meegegeven fragmenten. Citeer gebruikte bronnen als [id] in je antwoord. Antwoord in het Nederlands, kort en precies. Als onvoldoende info: 'Onvoldoende broninformatie.'\n\nFRAGMENTEN:\n${labeled}\n\nVRAAG: ${message}\n\nInstructies: - Geen informatie verzinnen - Gebruik bronverwijzingen zoals [${docs[0].id}] - Combineer meerdere bronnen indien nodig.`;
            const completion = await openai.chat.completions.create({ model: 'llama3.1', messages: [ { role: 'user', content: prompt } ] });
            const answer = (completion.choices[0].message.content || '').trim();
            // Log RAG gebruik en bronnen naar terminal
            const hits = docs.map(d => `#${d.id}(emb=${d.embScore.toFixed(3)},lex=${d.lexScore.toFixed(3)},sum=${d.score.toFixed(3)})`).join(', ');
            console.log(`[RAG] Query: "${message}" -> hits: ${hits}`);
            for (const d of docs) {
                const preview = d.content.slice(0,120).replaceAll('\n',' ');
                console.log(`  [Doc ${d.id}] emb=${d.embScore.toFixed(3)} lex=${d.lexScore.toFixed(3)} sum=${d.score.toFixed(3)} preview='${preview}'`);
            }
            return { reply: answer, rag: { used: true, sources: docs.map(d => ({ id: d.id, emb: d.embScore, lex: d.lexScore, score: d.score })) } };
        }
        const fallbackPrompt = `Je bent een Belgische politie assistent. Beantwoord kort de vraag. Als je niet zeker bent zeg: 'Ik ben niet zeker.' Vraag: ${message}`;
        const completion = await openai.chat.completions.create({ model: 'llama3.1', messages: [ { role: 'user', content: fallbackPrompt } ] });
        const ans = (completion.choices[0].message.content || '').trim();
        console.log(`[RAG] Query: "${message}" -> geen relevante documenten (fallback antwoord).`);
        return { reply: ans, rag: { used: false } };
    }
    if (lower.includes('hallo') || lower.includes('goedendag')) return { reply: 'Goedendag. Gaat het om een aangifte of een algemene vraag?', rag: { used: false } };
    return { reply: 'Gaat dit over een aangifte die u wilt maken of een algemene vraag?', rag: { used: false } };
}

// ----------------------- API ENDPOINT -----------------------
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId ontbreekt' });
        if (!conversationContext[sessionId]) conversationContext[sessionId] = [];
        conversationContext[sessionId].push({ role: 'user', content: message });
        const result = await getAIResponse(sessionId, message);
        conversationContext[sessionId].push({ role: 'assistant', content: result.reply });
        res.json({ response: result.reply, dossierState: sessionState[sessionId], rag: result.rag });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ----------------------- PDF INGEST ENDPOINT -----------------------
const fs = require('node:fs');
const pdfParse = require('pdf-parse');

function smartChunk(text) {
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let buffer = '';
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const isHeading = /^\d+\s|^[A-Z][A-Z ]{3,}$/.test(trimmed);
        if ((buffer + '\n' + trimmed).length > 900 || isHeading) {
            if (buffer) chunks.push(buffer.trim());
            buffer = trimmed;
        } else {
            buffer += (buffer ? '\n' : '') + trimmed;
        }
    }
    if (buffer) chunks.push(buffer.trim());
    return chunks.filter(c => c.length > 40);
}

app.post('/api/ingest-pdf', async (req, res) => {
    try {
        const { path } = req.body;
        if (!path) return res.status(400).json({ error: 'Pad ontbreekt' });
        if (!fs.existsSync(path)) return res.status(404).json({ error: 'Bestand niet gevonden' });
        const data = fs.readFileSync(path);
        const pdf = await pdfParse(data);
        const chunks = smartChunk(pdf.text);
        let inserted = 0;
        for (const chunk of chunks) {
            const emb = await embed(chunk);
            db.run("INSERT INTO verkeersregels (content, embedding) VALUES (?, ?)", [chunk, JSON.stringify(emb)], err => {
                if (err) console.error('Insert error', err.message);
            });
            inserted++;
        }
        res.json({ status: 'ok', inserted });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ingest mislukt.' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server draait op http://localhost:${PORT}`));
