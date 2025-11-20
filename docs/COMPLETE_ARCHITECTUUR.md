# Complete Architectuur & Runboek — Politie Assistent

Dit document geeft een volledig en praktisch overzicht van het project: services, hoe alles werkt, hoe je het lokaal veilig draait en hoe je veelvoorkomende problemen oplost.

**Belangrijk:** alle paden in dit document verwijzen naar het project root. Bestanden zoals `server.js`, `load_pdf.js` en de frontend bevinden zich in respectievelijk `backend/` en `frontend/`.

**Inhoudsopgave**

- **Project overzicht**
- **Backend (architectuur & flows)**
- **Database (schema & locaties)**
- **RAG (retrieval + embedding)**
- **PDF ingest / `load_pdf.js`**
- **Frontend (gedrag & integratie)**
- **Run instructies (cmd.exe)**
- **Veelvoorkomende issues & troubleshooting**
- **Beveiliging & privacy**
- **Aanbevelingen / next steps**

**Project overzicht**

- **Backend:** `backend/server.js` (Express API, SQLite, Ollama via OpenAI SDK/axios)
- **PDF loader:** `backend/load_pdf.js` (bulk ingest van PDF's in `regels/` naar DB)
- **Database:** `politie_dossiers.db` (in project root / backend folder)
- **Frontend:** statische files in `frontend/` (`index.html`, `script.js`, `style.css`)
- **AI runtime:** lokaal Ollama accessible op `http://localhost:11434` (embedding model `nomic-embed-text`, LLM `llama3.1` in code)

**Backend (architectuur & flows)**

- **Server:** Express app die luistert op poort `3000` en de volgende endpoints biedt:
  - `POST /api/chat` — hoofd endpoint voor conversatie. Body: `{ message, sessionId }`. Retourneert `response`, `dossierState`, `rag`.
  - `POST /api/ingest-pdf` — ingest single PDF via pad: `{ path }`.
- **Session state:** server houdt tijdelijke sessiestatus in `sessionState` object (in-memory). Elke `sessionId` heeft:
  - `mode`: `idle | report | question`
  - `report`: conversational flow met `step`, `fields` en `createdDossierIds`
- **Conversational flow (aangifte):** stap-voor-stap guided questions (naam → beschrijving → dader bekend → locatie → datum/tijd → situatie → bewijs → extra → bevestigen → opslaan). Opslaan gebeurt via `createDossier(sessionId)` in de SQLite `dossiers` tabel.
- **Intent detection:** keyword/regex-based triggers om te kiezen tussen `report` of `question` modes. Verkeersvragen worden gedetecteerd met keywords zoals `snelheid, boete, wegcode`.

**Database (schema & locaties)**

- Database file: `politie_dossiers.db` (relatief pad in `backend/` - `./politie_dossiers.db` in code). Zorg dat de process user schrijfrechten heeft.
- Tabellen:
  - `dossiers` — `id, datum, beschrijving, samenvatting, prioriteit, status`
  - `verkeersregels` — `id, content, embedding`
- Let op: embeddings worden opgeslagen als JSON-string in het `embedding` veld.

**RAG (retrieval + embedding)**

- **Embedding provider:** Ollama `nomic-embed-text` via `POST http://localhost:11434/api/embed`.
- **Retrieval methode:** Hybrid: 60% embedding cosine similarity + 40% lexical (token match) met eenvoudige synonym expansion.
- **Flow:**
  1. Vraag → embeddings (van query) → vergelijk met opgeslagen embeddings per row
  2. Lexical score via token matching (en query-expansies)
  3. Combined score = `0.6 * embSim + 0.4 * lexScore`
  4. Filter `score >= 0.15` en return top 5
- **Gebruik:** bij vraagmodi stuurt server de top fragments naar het LLM prompt en vraagt expliciet om bronverwijzing met document IDs.

**PDF ingest / `load_pdf.js`**

- Doel: bulk verwerken van PDF's in `regels/` directory en vullen van `verkeersregels` tabel.
- Belangrijke stappen:
  - Tekst extractie met `pdf-parse`.
  - `smartChunk()` — heading-aware chunking (max ~900 chars, skip chunks < 40 chars).
  - Deduplicatie op chunk content (SQL lookup).
  - Embedding per chunk en insert naar DB.
- Uit te voeren indien je wetgevende documenten wilt opladen:

  ```cmd
  cd backend
  node load_pdf.js
  ```

**Frontend (gedrag & integratie)**

- Files: `frontend/index.html`, `frontend/script.js`, `frontend/style.css`.
- Het UI doet:
  - Gebruiker typt bericht → UI toont bericht → POST naar `http://localhost:3000/api/chat` met `sessionId`.
  - `sessionId` is hardcoded in `script.js` als `session-123` (aan te passen naar per-browser/UUID in productie).
  - UI heeft een typing indicator en voegt bot-antwoorden toe zodra de backend antwoordt.
- Belangrijk: de huidige Express server in `server.js` serveert geen statische frontend-bestanden op `/` — daarom zie je mogelijk `Cannot GET /` wanneer je `http://localhost:3000` opent.
  - Twee opties om frontend te openen:
    - Open `frontend/index.html` direct in je browser (double-click / `file://`), of
    - Laat Express de frontend serveren (optioneel): zie onder "Serve frontend via Express".

**Serve frontend via Express (optioneel)**

- Als je wilt dat `http://localhost:3000` de frontend geeft, voeg dit toe in `backend/server.js` boven `app.listen(...)`:

```javascript
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});
```

- Start de server opnieuw (`node server.js`) en bezoek `http://localhost:3000`.

**Run instructies (cmd.exe) — lokaal (development)**

- Open `cmd.exe` in project root (of PowerShell):

```cmd
REM 1) Dependencies installeren (al gedaan als in README)
cd backend
npm install

REM 2) Zorg dat Ollama lokaal draait en dat benodigde modellen aanwezig zijn:
REM (op je machine via Ollama CLI/setup; voorbeelden)
ollama pull llama3.1
ollama pull nomic-embed-text

REM 3) Backend starten
cd ..\backend
node server.js

REM 4a) Optie: frontend via file
REM Open frontend\index.html in je browser

REM 4b) Optie: serve frontend via Express (zie code snippet hierboven), daarna bezoek:
REM http://localhost:3000

REM 5) (optioneel) Ingest PDF's
cd ..\backend
node load_pdf.js
```

**Veelvoorkomende issues & troubleshooting**

- `Cannot GET /` when visiting `http://localhost:3000`
  - Oorzaak: server serveert geen statische bestanden. Oplossing: open `frontend/index.html` direct of voeg static middleware (zie sectie boven).
- `Error opening database` of `permission denied`
  - Controleer dat `politie_dossiers.db` schrijfbaar is door de gebruiker die de server runt. Runtime create indien niet aanwezig.
- Ollama embed endpoint errors (connect refusal)
  - Controleer Ollama is gestart en luistert op `localhost:11434`.
  - Controleer netwerk/firewall en dat modellen zijn gedownload (`ollama pull ...`).
- DeprecationWarning: `punycode`
  - Informatief, geen breker. Kan genegeerd worden voor development.
- Backend crash na `node server.js`
  - Bekijk terminal logs voor stacktrace. Veel errors rond Ollama/contact met DB of ontbrekende `sessionId` in request.

**Beveiliging & privacy (wat je niet moet doen)**

- **NOOIT** API-keys of gevoelige credentials commiten.
- `server.js` gebruikt `cors()` openlijk (alle origins). Dit is handig voor dev, maar onveilig voor productie — beperk CORS tot de front-end origin.
- Database `politie_dossiers.db` bevat mogelijk gevoelige persoonsgegevens — bescherm het bestand, gebruik encryptie/backups en verwijder testdata vóór publicatie.
- Als je externe LLM's gebruikt (niet Ollama lokaal), wees je bewust dat data naar externe API's kan gaan.

**Aanbevelingen & next steps**

- Gebruik per-browser/proper sessionId (UUID) en persist session state indien nodig.
- Verplaats embeddings naar aparte table/zoek-index (faiss/pgvector) bij grotere datasets.
- Verfijn RAG-scores en thresholds na evaluatie; bewaar logs van hits voor tuning.
- Voeg rate-limiting en autenticatie toe voor productie (API keys of login voor agent UI).
- Voeg unit tests voor `hybridRetrieve` en `smartChunk`.
- UI: toon broncitaten bij RAG-antwoorden en een knop "Maak proces-verbaal" voor agents.

---

Als je wilt, kan ik nu één van de volgende acties uitvoeren:

- **A)** `server.js` patchen zodat de frontend automatisch via Express geserveerd wordt (dan verdwijnt `Cannot GET /`).
- **B)** `script.js` aanpassen om een unieke `sessionId` per gebruiker te genereren (UUID/localStorage).
- **C)** Extra secties toevoegen aan dit document (bv. data-retentiebeleid, schema ERD, of export/import workflows).

Zeg wat je wil dat ik als volgende stap toevoeg of wijzig. Het document is opgeslagen als `docs/COMPLETE_ARCHITECTUUR.md` in het project.
