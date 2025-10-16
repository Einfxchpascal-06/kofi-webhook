import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const KOFI_TOKEN = "8724041a-c3b4-4683-b309-8e08591552e2";

// Speicher für alle Events (max. 100 Einträge)
let activityFeed = [];

app.get("/", (req, res) => {
  res.send("✅ Soundwave Ko-fi Webhook läuft!");
});

app.post("/kofi", (req, res) => {
  try {
    let data = req.body;
    if (typeof data.data === "string") data = JSON.parse(data.data);

    // Token prüfen
    const token = data.verification_token || req.body.verification_token;
    if (token !== KOFI_TOKEN) console.warn("⚠️ Ungültiger Verification Token:", token);

    // Wenn Spende erkannt
    if (data.type === "Donation") {
      const donor = data.from_name || "Unbekannt";
      const amount = data.amount || "0";
      const currency = data.currency || "";
      const message = data.message || "";

      console.log(`☕ Ko-fi Donation: ${donor} ${amount} ${currency} (${message})`);

      // In den Feed einfügen
      activityFeed.unshift({
        type: "Ko-fi Donation",
        donor,
        amount,
        currency,
        message,
        time: new Date().toLocaleString("de-DE"),
      });

      // Nur die letzten 100 behalten
      if (activityFeed.length > 100) activityFeed.pop();
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Fehler:", err);
    res.sendStatus(500);
  }
});

// Feed-Webseite
app.get("/feed", (req, res) => {
  const html = `
  <html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="10">
    <title>Soundwave Activity Feed</title>
    <style>
      body { background:#0d1117; color:#e6edf3; font-family:'Segoe UI', sans-serif; margin:20px; }
      h1 { color:#58a6ff; }
      .entry { margin-bottom:15px; padding:10px; border-left:4px solid #58a6ff; background:#161b22; border-radius:6px; }
      .donor { font-weight:bold; color:#58a6ff; }
      .time { color:#8b949e; font-size:0.85em; margin-bottom:5px; }
      .message { margin-top:5px; color:#c9d1d9; }
    </style>
  </head>
  <body>
    <h1>🩵 Soundwave Activity Feed</h1>
    ${
      activityFeed.length
        ? activityFeed
            .map(
              (e) => `
        <div class="entry">
          <div class="time">${e.time}</div>
          <div><span class="donor">${e.donor}</span> spendete <b>${e.amount} ${e.currency}</b></div>
          <div class="message">${e.message || ""}</div>
        </div>`
            )
            .join("")
        : "<p>Keine Einträge bisher.</p>"
    }
  </body>
  </html>`;
  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server läuft auf Port ${PORT}`));
