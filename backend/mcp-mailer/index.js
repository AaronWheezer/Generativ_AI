import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import nodemailer from "nodemailer";
import axios from "axios";
import dotenv from "dotenv";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

// --- BELANGRIJK: PAD NAAR .ENV CORRECT INSTELLEN ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Omdat je .env bestand NU IN DEZELFDE MAP staat als index.js:
// Gebruik path.join(__dirname, '.env')
dotenv.config({ path: path.join(__dirname, '.env') });

// --- DEBUG LOGGING (Gaat naar stderr, verstoort MCP niet) ---
console.error("🔧 MCP Mailer wordt gestart...");
console.error(`📂 Werkmap: ${process.cwd()}`);
console.error(`📄 .env locatie: ${path.join(__dirname, '.env')}`);
console.error(`📧 SMTP Config check: Host=${process.env.SMTP_HOST || '❌'}, User=${process.env.SMTP_USER || '❌'}`);

// 1. Definieer de Server
const server = new Server(
  {
    name: "politie-mailer-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 2. Definieer de Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "send_pv_email",
        description: "Verstuur een formele PV bevestiging via e-mail naar de burger.",
        inputSchema: {
          type: "object",
          properties: {
            email: { type: "string", description: "Emailadres van de burger" },
            pvData: {
              type: "object",
              description: "Object met alle PV details",
              properties: {
                name: { type: "string" },
                location: { type: "string" },
                date: { type: "string" },
                time: { type: "string" },
                description: { type: "string" },
                zoneLabel: { type: "string" },
              },
              required: ["name"],
            },
          },
          required: ["email", "pvData"],
        },
      },
    ],
  };
});

// 3. Voer de logica uit
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "send_pv_email") {
    throw new Error("Tool niet gevonden");
  }

  const args = request.params.arguments;
  if (!args.email || !args.pvData) {
    throw new Error("Email en pvData zijn verplicht.");
  }

  const { email, pvData } = args;

  // Extra veiligheidscheck
  if (!process.env.SMTP_HOST) {
      const msg = "CRITISH: SMTP_HOST ontbreekt. .env niet geladen?";
      console.error(msg);
      throw new Error(msg);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587, // Zorg dat dit een nummer is
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let emailText = "";
    try {
      const ollamaUrl =
        process.env.OLLAMA_URL || "http://127.0.0.1:11434/v1/chat/completions";
      
      const prompt = `Je bent een Belgische politieassistent. Schrijf een formele bevestigingsmail in het NEDERLANDS.

ONTVANGER: ${pvData.name} (${email})
GEGEVENS PV:
- Naam: ${pvData.name}
- Locatie: ${pvData.location || "Onbekend"}
- Datum/tijd: ${pvData.date || "Onbekend"} ${pvData.time || ""}
- Beschrijving: ${pvData.description || "Zie PV"}
- Politiezone: ${pvData.zoneLabel || "Onbekend"}

SCHRIJF DE EMAIL IN HET NEDERLANDS. Structuur:
1. Geachte heer/mevrouw [naam],
2. Bevestig ontvangst
3. Korte samenvatting
4. Vermeld "in behandeling"
5. Afsluiten met Politiezone ${pvData.zoneLabel || "Onbekend"}
VERBODEN: Duits of Engels.`;

      const ollamaRes = await axios.post(
        ollamaUrl,
        {
          model: "mistral-nemo",
          messages: [
            { role: "system", content: "Je schrijft ALTIJD in het Nederlands." },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
        },
        { headers: { "Content-Type": "application/json" } }
      );
      emailText =
        ollamaRes.data.choices?.[0]?.message?.content ||
        `Geachte ${pvData.name},\n\nUw aangifte is ontvangen.\n\nMvg, Politie`;
    } catch (aiErr) {
      console.error("AI Text Gen Error:", aiErr.message);
      emailText = `Geachte ${pvData.name},\n\nUw aangifte is ontvangen.\n\nMvg, Politie`;
    }

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Uw Proces-Verbaal",
      text: emailText,
    });

    return {
      content: [
        {
          type: "text",
          text: `E-mail succesvol verzonden. ID: ${info.messageId}`,
        },
      ],
    };
  } catch (err) {
    console.error("MAIL ERROR:", err);
    return {
      content: [{ type: "text", text: `Fout bij verzenden: ${err.message}` }],
      isError: true,
    };
  }
});

// 4. Start de server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MCP Mailer Server draait op Stdio...");