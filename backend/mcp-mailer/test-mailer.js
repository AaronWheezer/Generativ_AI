import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

// Helper om __dirname te krijgen in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log("🧪 --- START TEST MAIL SERVER ---");

  // 1. Pad naar je server bestand (index.js)
  const serverPath = path.join(__dirname, "index.js");

  // 2. Transport opzetten (Dit start 'node index.js' als een apart proces)
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  // 3. Client definiëren
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    // 4. Verbinden (De SDK doet nu automatisch de 'handshake' initialisatie)
    process.stdout.write("🔌 Verbinden met server... ");
    await client.connect(transport);
    console.log("✅ OK");

    // 5. De test data
    const testArguments = {
      email: "carl7yt@gmail.com",
      pvData: {
        name: "Carl Testpersoon",
        location: "Stationsstraat 12, Kortrijk",
        date: "2025-12-07",
        time: "14:30",
        description: "De melder verklaarde dat er een diefstal plaatsvond op het station. De dader droeg een rode jas en vluchtte richting centrum.",
        zoneLabel: "Politiezone VLAS",
      },
    };

    console.log("📤 Tool aanroepen: send_pv_email...");

    // 6. De daadwerkelijke aanroep (SDK regelt JSON-RPC formatting)
    const result = await client.callTool({
      name: "send_pv_email",
      arguments: testArguments,
    });

    // 7. Resultaat tonen
    console.log("\n🎉 --- RESULTAAT ---");
    
    if (result.isError) {
      console.error("❌ FOUT GEMELD DOOR SERVER:");
      console.error(result.content[0].text);
    } else {
      console.log("✅ SUCCES:");
      console.log(JSON.stringify(result, null, 2));
      console.log("\nControleer je inbox (of spam folder)!");
    }

  } catch (error) {
    console.error("\n💥 CRASH TIJDENS TEST:");
    console.error(error);
  } finally {
    // 8. Netjes afsluiten
    await transport.close();
    console.log("\n👋 Verbinding gesloten.");
  }
}

runTest();