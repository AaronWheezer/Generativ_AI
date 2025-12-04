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
      const prompt = `Je bent een virtuele politieassistent. Stel een nette, formele e-mail op namens de politie, gericht aan de melder (${
        pvData.name
      }, e-mail: ${
        pvData.email
      }). Gebruik de volgende gegevens:\n${JSON.stringify(
        pvData,
        null,
        2
      )}\nDe e-mail moet persoonlijk, volledig en uitsluitend in het Nederlands zijn. Schrijf vanuit de politie, niet vanuit de melder. Bedank de melder voor zijn/haar melding en bevestig ontvangst van het proces-verbaal en zorg dat de doorgegeven details vermeld zijn. Onderteken de e-mail met "Vriendelijke groet, Politie Assistent, Politiezone ${
        pvData.politiezone || 'Kortrijk'
      }".`;
      const ollamaRes = await axios.post(
        ollamaUrl,
        {
          model: 'mistral-nemo',
          messages: [
            {
              role: 'system',
              content: 'Je bent een virtuele politieassistent.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      emailText =
        ollamaRes.data.choices?.[0]?.message?.content ||
        `Hier is uw PV:\n${JSON.stringify(pvData, null, 2)}`;
    } catch (aiErr) {
      console.warn(
        '⚠️ AI mailtekst genereren mislukt, val terug op standaard:',
        aiErr.message
      );
      emailText = `Hier is uw PV:\n${JSON.stringify(pvData, null, 2)}`;
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
