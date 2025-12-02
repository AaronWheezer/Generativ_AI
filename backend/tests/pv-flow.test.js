const axios = require("axios");
const { randomUUID } = require("node:crypto");

// Simple integration harness to simulate a complete PV conversation.
// Requirements:
// 1. Backend server running locally (npm run dev) so http://localhost:3000 is reachable.
// 2. Ollama models configured as in your .env (the chat endpoint is exercised by the flow).
// Usage:
//   npm run test:pv
// or
//   node tests/pv-flow.test.js

const API_URL = process.env.PV_TEST_URL || "http://localhost:3000/api/pv/chat";
const SESSION_ID = randomUUID();

const ANSWERS = {
  intro:
    "Gisteravond rond 22:15 werd ik in mijn nachtwinkel overvallen door een gemaskerde man. Hij bedreigde mij met een mes, eiste het kassageld, griste 3.000 euro mee en rende richting de parking. Mijn collega zag hem naar een donkere hatchback lopen.",
  name: "Ik ben Test Burger.",
  shortDescription:
    "Het gaat nog steeds om diezelfde gewapende overval in mijn winkel. Hij gebruikte een mes en vluchtte richting de parking.",
  deepDive:
    "De dader droeg een zwarte hoodie met een opvallende leeuwen-embleem, donkere jeans en sportschoenen. Hij sprak met een West-Vlaams accent en had een getatoeëerde schedel op zijn linkerhand. Ik heb nog de camerabeelden.",
  location: "Stationsplein 5, 8500 Kortrijk",
  municipality: "Kortrijk",
  datetime: "Gisteren om 22:15",
  time: "22:15",
  email: "test.burger@example.com",
  phone: "0477000000",
  confirmation: "ja, dat klopt"
};

const STATIC_PROMPTS = {
  name: "Met wie spreek ik?",
  description: "Beschrijf zo volledig mogelijk wat er is gebeurd",
  location: "Waar heeft dit incident precies plaatsgevonden",
  municipality: "Ik kan de politiezone niet automatisch bepalen",
  datetime: "Wanneer is dit gebeurd",
  time: "Kunt u ook het specifieke tijdstip",
  email: "Wat is uw e-mailadres",
  phone: "Op welk telefoonnummer",
  summary: "Is dit correct"
};

function chooseReply(botMessage = "") {
  const text = botMessage.toLowerCase();
  if (text.includes(STATIC_PROMPTS.name.toLowerCase())) return ANSWERS.name;
  if (text.includes(STATIC_PROMPTS.description.toLowerCase())) return ANSWERS.shortDescription;
  if (text.includes(STATIC_PROMPTS.location.toLowerCase())) return ANSWERS.location;
  if (text.includes(STATIC_PROMPTS.municipality.toLowerCase())) return ANSWERS.municipality;
  if (text.includes(STATIC_PROMPTS.datetime.toLowerCase())) return ANSWERS.datetime;
  if (text.includes(STATIC_PROMPTS.time.toLowerCase())) return ANSWERS.time;
  if (text.includes(STATIC_PROMPTS.email.toLowerCase())) return ANSWERS.email;
  if (text.includes(STATIC_PROMPTS.phone.toLowerCase())) return ANSWERS.phone;
  if (text.includes(STATIC_PROMPTS.summary.toLowerCase())) return ANSWERS.confirmation;
  // Any other prompt is considered a smart follow-up question
  return ANSWERS.deepDive;
}

async function sendMessage(message) {
  const payload = { sessionId: SESSION_ID, message };
  const { data } = await axios.post(API_URL, payload, { timeout: 120000 });
  return data;
}

async function runScenario() {
  console.log("➡️  User:", ANSWERS.intro);
  let response = await sendMessage(ANSWERS.intro);
  console.log("🤖 Bot:", response.response);

  let safety = 0;
  while (response.mode !== "done" && safety < 25) {
    const next = chooseReply(response.response);
    console.log("➡️  User:", next);
    response = await sendMessage(next);
    console.log("🤖 Bot:", response.response);
    if (response.mode === "done") break;
    safety++;
  }

  if (response.mode === "done") {
    console.log("✅ PV flow rond automatisch getest.");
  } else {
    console.warn("⚠️ Test gestopt zonder afronding (controleer het log). Safety iterations:", safety);
  }
}

runScenario().catch((err) => {
  console.error("❌ Fout tijdens PV test:", err.message);
  process.exit(1);
});
