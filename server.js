import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const KOFI_TOKEN = "8724041a-c3b4-4683-b309-8e08591552e2";

// 🧠 Feed-Speicher (max. 100 Einträge)
let activityFeed = [];

// === Basis-Check ===
app.get("/", (req, res) => {
  res.send("✅ McHobi74 Activity Webhook läuft!");
});

// === Ko-fi Webhook ===
app.post("/kofi", (req, res) => {
  try {
    let data = req.body;
    if (typeof data.data === "string") data = JSON.parse(data.data);

    const token = data.verification_token || req.body.verification_token;
    if (token !== KOFI_TOKEN) console.warn("⚠️ Ungültiger Verification Token:", token);

    if (data.type === "Donation") {
      const donor = data.from_name || "Unbekannt";
      const amount = data.amount || "0";
      const currency = data.currency || "";
      const message = data.message || "";

      console.log(`☕ Ko-fi Donation: ${donor} ${amount} ${currency} (${message})`);

      activityFeed.unshift({
        type: "Ko-fi Donation",
        donor,
        amount,
        currency,
        message,
        color: "#58a6ff",
        icon: "☕",
        time: new Date().toLocaleString("de-DE"),
      });

      if (activityFeed.length > 100) activityFeed.pop();
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Fehler beim Verarbeiten:", err);
    res.sendStatus(500);
  }
});

// === Twitch-Webhook-Simulator ===
// (Streamer.bot oder dein Twitch-Bot kann POSTs hierher schicken)
app.post("/twitch", (req, res) => {
  try {
    const { type, user, amount, message } = req.body;
    let color = "#7c3aed";
    let icon = "🎉";

    if (type === "Follow") color = "#00ffcc", icon = "💚";
    if (type === "Sub") color = "#eab308", icon = "⭐";
    if (type === "Points") color = "#ff66cc", icon = "🎁";

    activityFeed.unshift({
      type,
      donor: user || "Unbekannt",
      amount: amount || "",
      message: message || "",
      color,
      icon,
      time: new Date().toLocaleString("de-DE"),
    });

    if (activityFeed.length > 100) activityFeed.pop();
    console.log(`💜 Twitch ${type}: ${user} ${amount || ""} ${message || ""}`);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Twitch Feed Fehler:", err);
    res.sendStatus(500);
  }
});

// === Feed-Webseite ===
app.get("/feed", (req, res) => {
  const html = `
  <html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="10">
    <title> McHobi74 Activity Feed</title>
    <style>
      body { background:#0d1117; color:#e6edf3; font-family:'Segoe UI', sans-serif; margin:20px; }
      h1 { color:#58a6ff; margin-bottom:15px; }
      .entry {
        margin-bottom:15px; padding:15px; border-radius:8px;
        background:#161b22; box-shadow:0 2px 8px rgba(0,0,0,0.4);
        transition:transform 0.1s ease, box-shadow 0.1s ease;
      }
      .entry:hover { transform:scale(1.01); box-shadow:0 0 15px rgba(88,166,255,0.2); }
      .icon { font-size:1.3em; margin-right:8px; }
      .type { font-weight:bold; }
      .time { color:#8b949e; font-size:0.85em; margin-bottom:5px; }
      .message { margin-top:5px; color:#c9d1d9; }
    </style>
  </head>
  <body>
    <h1>🩵 McHobi74 Activity Feed</h1>
    ${
      activityFeed.length
        ? activityFeed
            .map(
              (e) => `
        <div class="entry" style="border-left:5px solid ${e.color};">
          <div class="time">${e.time}</div>
          <div><span class="icon">${e.icon}</span><span class="type">${e.type}</span> — <b>${e.donor}</b> ${e.amount ? "→ " + e.amount + " " + (e.currency || "") : ""}</div>
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
