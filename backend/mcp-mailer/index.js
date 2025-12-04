import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
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

    const mailOptions = {
      from: process.env.MAIL_FROM,
      to: email,
      subject: 'Uw Proces-Verbaal',
      text: `Hier is uw PV:\n${JSON.stringify(pvData, null, 2)}`,
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
