# Project Generative AI - Aaron Vanmarcke & Egon Tondeur Galle

## Databronnen Wegcode
- https://www.wegcode.be/nl/regelgeving/1975120109~hra8v386pu
- https://www.gratisrijbewijsonline.be/theorie

## Installatie

### NPM Dependencies
Voer `npm install` uit in de volgende mappen:
- `backend/`
- `frontend/`
- `backend/mcp_server/`

### Backend Dependencies
```bash
npm install pdf-parse sqlite3 cors express body-parser openai axios
```

### Ollama Modellen
```bash
ollama pull bge-m3
ollama pull mistral-nemo
ollama pull llama3.1
```

## Eenmalige Setup

### Database Initialisatie
```bash
# PDF embeddings inladen
node .\load_pdf.js

# Politiezones inladen
node .\ingest_police_zones.js
```

## Opstarten

### Development Mode
```bash
# Backend (in backend/)
npm run dev

# Frontend (in frontend/)
npm run dev
``` 

