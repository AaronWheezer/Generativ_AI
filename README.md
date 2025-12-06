# Project Generative AI - Aaron Vanmarcke & Egon Tondeur Galle

voorlopige data wegcode:
- https://www.wegcode.be/nl/regelgeving/1975120109~hra8v386pu
- https://www.gratisrijbewijsonline.be/theorie
## installs: 
npm install in 
- backend/
- frontend/
- backend/mcp_server/
  

# installs backend:
npm install pdf-parse sqlite3 cors express body-parser openai
npm install --save axios
ollama / install
nomic-embed-text
ollama pull bge-m3
ollama pull mistral-nemo
# requirements:
backend:
    node .\server.js
    node .\load_pdf.js -- is voor eenmalig pdf inladen -> embedding voor de database
    node .\ingeest_police_zones.js  -- is voor eenmalig inladen politie zones


## opstarten : 
npm run dev in frontend/Z
npm run dev in backend/ 

