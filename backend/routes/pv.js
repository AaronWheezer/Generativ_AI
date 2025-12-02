const axios = require("axios");
const nodemailer = require("nodemailer");

// --- CONFIGURATIE ---
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const CHAT_MODEL = process.env.CHAT_MODEL || "llama3.1";
const EMBED_MODEL = process.env.EMBED_MODEL || "nomic-embed-text";

// --- VASTE VRAGEN LIJST ---
const QUESTIONS = {
    name: "Met wie spreek ik? (Uw volledige naam)",
    description: "Kunt u in het kort vertellen wat er is gebeurd?",
    
    // Deep Dive vragen
    details_violence: "Is er geweld gebruikt of waren er wapens betrokken?",
    details_items: "Is er iets gestolen of beschadigd? Kunt u dit beschrijven?",
    details_suspects: "Heeft u de dader(s) gezien? Kunt u een beschrijving geven?",
    
    location: "Waar heeft dit incident precies plaatsgevonden? (Straat en gemeente)",
    municipality_fix: "Ik kan de politiezone niet automatisch bepalen. Kunt u de hoofdgemeente noemen?",
    
    // Aangepaste vraag voor datum/tijd
    datetime: "Wanneer is dit gebeurd? (Ik heb zowel de datum als het tijdstip nodig, bv. 'Gisteren om 14:30')",
    time_only: "Kunt u ook het specifieke tijdstip noemen? (bv. 'rond 15:00' of 'middernacht')",
    
    email: "Wat is uw e-mailadres voor de bevestiging?",
    phone: "Op welk telefoonnummer kunnen we u bereiken?"
};

// --- HULP FUNCTIES ---

function cleanAndParseJSON(responseText) {
  if (!responseText) return null;
  try { return JSON.parse(responseText); } catch (e) {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch (e2) { return null; } }
    return null;
  }
}

async function embed(text) {
  if (!text?.trim()) return [];
  try {
    const res = await axios.post(`${OLLAMA_URL}/api/embed`, { model: EMBED_MODEL, input: text });
    return res.data.embedding || res.data.embeddings?.[0] || [];
  } catch (e) { return []; }
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i]**2; normB += b[i]**2; }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalize(str) {
  return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9/\-\s]/g, "").trim();
}

async function findPoliceZone(db, input) {
  if (!input) return null;
  const parts = input.split(" ");
  const searchTerms = [...parts, input];

  return new Promise((resolve) => {
    db.all("SELECT id, municipalities, zone_name, arrondissement, embedding FROM police_zones", [], async (err, rows) => {
        if (err || !rows) return resolve(null);
        for (const term of searchTerms) {
            const target = normalize(term);
            for (const r of rows) {
                let munis = [];
                try { munis = JSON.parse(r.municipalities); } catch {}
                if (Array.isArray(munis) && munis.includes(target)) {
                    return resolve({ label: r.zone_name, value: r.arrondissement || null });
                }
            }
        }
        let best = null;
        const qEmb = await embed(input);
        for (const r of rows) {
          let embArr = [];
          try { embArr = JSON.parse(r.embedding); } catch {}
          const score = qEmb.length && embArr.length ? cosineSimilarity(qEmb, embArr) : 0; 
          if (!best || score > best.score) best = { score, row: r };
        }
        if (best && best.score > 0.4) return resolve({ label: best.row.zone_name, value: best.row.arrondissement || null });
        resolve(null);
      }
    );
  });
}

async function sendPVEmail(dossier) {
  console.log(`📧 E-mail wordt verstuurd naar: ${dossier.email}`);
  return { success: true };
}

// --- AI AGENT LOGICA ---

// Stap 1: Extractie (Gesplitst in Date en Time)
async function extractInformation(userMessage) {
  const now = new Date();
  const currentDate = now.toLocaleDateString('nl-BE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const currentTime = now.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

  const prompt = `
    You are a Data Extractor.
    
    CONTEXT:
    - Current Date: ${currentDate}
    - Current Time: ${currentTime}
    - User Message: "${userMessage}"
    
    TASK: Extract data into JSON. Split date and time.
    
    Fields:
    - name (Full Name)
    - description (Details of incident)
    - location (Place/City)
    - municipality (Only if explicitly named)
    - date (The date of the incident in "YYYY-MM-DD" format. Resolve relative terms like "yesterday".)
    - time (The specific time in "HH:MM" format. IF NOT MENTIONED, RETURN NULL/EMPTY. DO NOT GUESS 00:00.)
    - email (Email address)
    - phone (Phone number)
    - suspectKnown (boolean)

    Rules:
    1. Extract ONLY what is in the message.
    2. If the user only says "Yesterday", set date="2025-XX-XX" and time=null.
    3. Output JSON ONLY.
  `;

  try {
    const res = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      format: "json",
      stream: false,
      options: { temperature: 0 },
    });
    
    console.log("📥 Extract Raw:", res.data.message.content);
    return cleanAndParseJSON(res.data.message.content) || {};
  } catch (e) {
    console.error("Extraction error", e.message);
    return {};
  }
}

// Stap 2: Reasoning (Vaste Vragen)
function determineNextAction(fields, sessionState) {
  let nextStep = null;

  // 1. Wie?
  if (!fields.name) nextStep = "name";
  
  // 2. Wat? (Met Deep Dive)
  else if (!fields.description) {
      nextStep = "description";
  }
  else if (sessionState.detailStep < 3) {
      if (sessionState.detailStep === 0) nextStep = "details_violence";
      else if (sessionState.detailStep === 1) nextStep = "details_items";
      else if (sessionState.detailStep === 2) nextStep = "details_suspects";
  }
  
  // 3. Waar?
  else if (!fields.location) nextStep = "location";
  else if (fields.location && !fields.zoneLabel) nextStep = "municipality_fix";

  // 4. Wanneer? (Verbeterde logica)
  else if (!fields.date) {
      nextStep = "datetime"; // Vraag alles als er niets is
  }
  else if (!fields.time) {
      nextStep = "time_only"; // We hebben de datum, maar tijdstip mist
  }
  
  // 5. Contact?
  else if (!fields.email) nextStep = "email";
  else if (!fields.phone) nextStep = "phone";

  // AFRONDING
  if (!nextStep) {
      const fullDateTime = `${fields.date} ${fields.time}`;
      return {
          reply: `Ik heb alles genoteerd:\n\n- Naam: ${fields.name}\n- Feit: ${fields.description}\n- Locatie: ${fields.location} (Zone: ${fields.zoneLabel})\n- Tijdstip: ${fullDateTime}\n- Contact: ${fields.email} | ${fields.phone}\n\nIs dit correct en mag ik het PV indienen?`,
          isComplete: true,
          priority: determinePriority(fields.description)
      };
  }

  if (nextStep.startsWith("details_")) {
      sessionState.detailStep++;
  }

  return { 
      reply: QUESTIONS[nextStep], 
      isComplete: false, 
      priority: "MIDDEN" 
  };
}

function determinePriority(desc) {
    if (!desc) return "MIDDEN";
    const d = desc.toLowerCase();
    if (d.includes("wapen") || d.includes("mes") || d.includes("geweld") || d.includes("bloed")) return "HOOG";
    return "MIDDEN";
}

// In-memory state
const sessionState = {};

module.exports = function initPv(app, db) {
  app.post("/api/pv/chat", async (req, res) => {
    try {
      const { sessionId, message } = req.body;
      if (!sessionId || !message) return res.status(400).json({ error: "Missing data" });

      if (!sessionState[sessionId]) {
        sessionState[sessionId] = {
          mode: "active",
          detailStep: 0, 
          fields: {
            name: null, description: null, location: null, municipality: null,
            date: null, time: null, // Gesplitst!
            suspectKnown: null, zoneLabel: null,
            email: null, phone: null,
            confirmed: false,
          },
        };
      }

      const state = sessionState[sessionId];

      // --- BEVESTIGING FASE ---
 // --- BEVESTIGING FASE ---
      if (state.waitingForConfirmation) {
        const lower = message.toLowerCase();
        
        // Check op bevestiging
        if (["ja", "ok", "yes", "goed", "klopt", "correct"].some((w) => lower.includes(w))) {
          
          // Datum en tijd samenvoegen voor de 'datum' kolom
          const finalDateTime = `${state.fields.date} ${state.fields.time}`; 

          // --- DB FIX: APARTE KOLOMMEN ---
          db.run(
            `INSERT INTO dossiers (
                naam, 
                email, 
                telefoon, 
                locatie, 
                datum, 
                beschrijving, 
                prioriteit, 
                politie_zone
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                state.fields.name,       // naam
                state.fields.email,      // email
                state.fields.phone,      // telefoon
                state.fields.location,   // locatie
                finalDateTime,           // datum (gecombineerd)
                state.fields.description,// beschrijving
                state.priority || "MIDDEN", 
                state.fields.zoneLabel
            ],
            async (err) => {
              if (err) {
                  console.error("DB Error:", err);
                  return res.json({ response: "Er ging iets mis bij het opslaan in de database.", mode: "report" });
              }
              
              // E-mail versturen (hier gebruiken we nog het object, dat werkt nog steeds)
              await sendPVEmail(state.fields);
              
              // Sessie opruimen
              delete sessionState[sessionId];
              
              return res.json({ response: `PV Opgeslagen op naam van ${state.fields.name}. Bevestiging is verstuurd naar ${state.fields.email}.`, mode: "done" });
            }
          );
          return;

        } else if (lower.includes("nee")) {
          state.waitingForConfirmation = false;
          return res.json({ response: "Wat moet er aangepast worden?", mode: "report" });
        }
      }

      console.log(`\n💬 User Message: "${message}"`);
      
      const newInfo = await extractInformation(message);
      
      // Update fields
      Object.keys(newInfo).forEach(key => {
        if (newInfo[key] !== null && newInfo[key] !== undefined && newInfo[key] !== "") {
            
            // Description appenden
            if (key === 'description') {
                const oldDesc = state.fields.description || "";
                if (!oldDesc.includes(newInfo[key])) {
                     state.fields.description = oldDesc ? `${oldDesc} ${newInfo[key]}` : newInfo[key];
                }
            } 
            // Locatie reset zone
            else if (key === 'location') {
                if (state.fields.location !== newInfo[key]) {
                    state.fields.location = newInfo[key];
                    state.fields.zoneLabel = null; 
                }
            }
            // Date/Time specifiek behandelen (niet overschrijven met null)
            else if (key === 'time' || key === 'date') {
                state.fields[key] = newInfo[key]; 
            }
            else {
                state.fields[key] = newInfo[key];
            }
        }
      });
      
      console.log("📝 Updated State:", state.fields);

      if (!state.fields.zoneLabel) {
          const searchTerm = newInfo.municipality || state.fields.location;
          if (searchTerm) {
              const zone = await findPoliceZone(db, searchTerm);
              if (zone) state.fields.zoneLabel = zone.label;
          }
      }

      const decision = determineNextAction(state.fields, state);

      state.priority = decision.priority;
      if (decision.isComplete) state.waitingForConfirmation = true;

      return res.json({ response: decision.reply, mode: "report" });

    } catch (criticalError) {
      console.error("🔥 ERROR:", criticalError);
      return res.json({ response: "Technische fout.", mode: "report" });
    }
  });
};