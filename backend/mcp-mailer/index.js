import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

const app = express();
app.use(express.json());

app.post('/mail-pv', async (req, res) => {
  const { email, pvData } = req.body;
  if (!email || !pvData) {
    return res.status(400).json({ error: 'email and pvData required' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Genereer nette e-mailtekst via Ollama
    let emailText = '';
    try {
      const ollamaUrl =
        process.env.OLLAMA_URL || 'http://127.0.0.1:11434/v1/chat/completions';
      const prompt = `Je bent een Belgische politieassistent. Schrijf een formele bevestigingsmail in het NEDERLANDS (niet Duits, niet Engels).

ONTVANGER: ${pvData.name} (${pvData.email})
GEGEVENS PV:
- Naam: ${pvData.name}
- Locatie: ${pvData.location || 'Onbekend'}
- Datum/tijd: ${pvData.date || 'Onbekend'} ${pvData.time || ''}
- Beschrijving: ${pvData.description || 'Zie PV'}
- Politiezone: ${pvData.zoneLabel || 'Onbekend'}

SCHRIJF DE EMAIL IN HET NEDERLANDS. Structuur:
1. Geachte heer/mevrouw [naam],
2. Bevestig ontvangst van de aangifte
3. Vat kort samen wat er gemeld is (locatie, datum, wat gebeurd is)
4. Vermeld dat de aangifte in behandeling is
5. Sluit af met: "Met vriendelijke groeten, Politie-assistent, Politiezone ${
        pvData.zoneLabel || 'Onbekend'
      }"

VERBODEN: Duitse woorden zoals "Sehr geehrter", "vielen Dank", "Mit freundlichen Grüßen". ALLEEN NEDERLANDS.`;
      const ollamaRes = await axios.post(
        ollamaUrl,
        {
          model: 'mistral-nemo',
          messages: [
            {
              role: 'system',
              content:
                'Je bent een Belgische politieassistent. Je schrijft ALTIJD in het Nederlands, NOOIT in het Duits of Engels.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      emailText =
        ollamaRes.data.choices?.[0]?.message?.content ||
        `Geachte ${pvData.name},\n\nUw aangifte is ontvangen.\n\nMet vriendelijke groeten,\nPolitie`;
    } catch (aiErr) {
      console.warn(
        '⚠️ AI mailtekst genereren mislukt, val terug op standaard:',
        aiErr.message
      );
      emailText = `Geachte ${
        pvData.name
      },\n\nUw aangifte is ontvangen voor een incident op ${
        pvData.location || 'onbekende locatie'
      } op ${
        pvData.date || 'onbekende datum'
      }.\n\nMet vriendelijke groeten,\nPolitie-assistent`;
    }

    const mailOptions = {
      from: process.env.MAIL_FROM,
      to: email,
      subject: 'Uw Proces-Verbaal',
      text: emailText,
    };

    console.log('--- MCP Mailer: Probeer e-mail te versturen ---');
    console.log('SMTP host:', process.env.SMTP_HOST);
    console.log('Van:', mailOptions.from);
    console.log('Naar:', mailOptions.to);
    console.log('Onderwerp:', mailOptions.subject);
    console.log('Inhoud:', mailOptions.text);

    const info = await transporter.sendMail(mailOptions);
    console.log('Nodemailer response:', info);
    if (info.accepted && info.accepted.length > 0) {
      console.log(
        '✅ E-mail succesvol verstuurd naar:',
        info.accepted.join(', ')
      );
    } else {
      console.warn('⚠️ Geen ontvangers geaccepteerd:', info.rejected);
    }
    res.json({ success: true, info });
  } catch (err) {
    console.error('❌ Fout bij versturen e-mail:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`MCP Mailer server draait op http://localhost:${PORT}`);
});
