# Project Generative AI - Aaron Vanmarcke & Egon Tondeur Galle

voorlopige data wegcode:
- https://www.wegcode.be/nl/regelgeving/1975120109~hra8v386pu
- https://www.gratisrijbewijsonline.be/theorie
## installs: 
npm install
npm install pdf-parse sqlite3 cors express body-parser openai
npm install --save axios
ollama / install
nomic-embed-text
ollama pull bge-m3
ollama pull mistral-nemo
backend:
    node .\server.js
    node .\load_pdf.js -- is voor eenmalig pdf inladen -> embedding voor de database
    politie_dossiers.db : sqlite database met embedded pdf data en PV data
frontend:
    start localhost:3000 in browser

# TODO:
- veel betere chat / flow voor aangiftes.
- Veel betere RAG voor juridische context zoals BV verkeersregels.
- MCP server om PV te mailen,
- frontend ig voor  politie agenten voor editen en handelen van PV's. 
- echt classificatie model voor PV type (theorie, snelheid, alcohol, ...) diepgaander dan dit simple keyword based model.