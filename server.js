import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
const PORT = process.env.PORT || 10000;

// ---- ENV VARS ----
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USER = process.env.TWITCH_USER;
const KO_FI_TOKEN = process.env.KO_FI_TOKEN;

// ---- BASIC SETUP ----
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Speicher für letzte Events
let events = [];

// ---- HEALTH CHECK ----
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// ---- KO-FI WEBHOOK (robuste Version) ----
app.post("/kofi", bodyParser.text({ type: "*/*" }), (req, res) => {
  try {
    let data;
    if (typeof req.body === "string") {
      try {
        data = JSON.parse(req.body);
      } catch (e) {
        const params = new URLSearchParams(req.body);
        data = Object.fromEntries(params.entries());
      }
    } else {
      data = req.body;
    }

    console.log("📦 Ko-fi Payload empfangen:", data);

    const receivedToken = data.verification_token || data["verification_token"];
    if (!receivedToken || receivedToken.trim() !== KO_FI_TOKEN.trim()) {
      console.log(`❌ Ungültiger Ko-fi Token! Erhalten: ${receivedToken}`);
      return res.status(403).send("Forbidden");
    }

    const donation = {
      platform: "Ko-fi",
      from: data.from_name || "Unbekannt",
      message: data.message || "Keine Nachricht",
      amount: `${data.amount} ${data.currency || "USD"}`,
      timestamp: new Date().toISOString(),
    };

    events.unshift(donation);
    if (events.length > 30) events.pop();

    console.log(`✅ Neue Ko-fi Donation: ${donation.from} – ${donation.amount}`);
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Fehler im Ko-fi Webhook:", err);
    res.status(500).send("Error");
  }
});

// ---- TWITCH EVENTS ----
app.post("/twitch", (req, res) => {
  try {
    const event = req.body.event;
    if (!event) return res.status(200).send("No event");

    let msg;
    switch (event.type) {
      case "channel.subscribe":
        msg = {
          platform: "Twitch",
          from: event.user_name,
          message: `Neues Abo (${event.tier || "Tier1"})`,
          timestamp: new Date().toISOString(),
        };
        break;
      case "channel.cheer":
        msg = {
          platform: "Twitch",
          from: event.user_name,
          message: `Cheer mit ${event.bits} Bits 🎉`,
          timestamp: new Date().toISOString(),
        };
        break;
      case "channel.follow":
        msg = {
          platform: "Twitch",
          from: event.user_name,
          message: "Neuer Follower 💜",
          timestamp: new Date().toISOString(),
        };
        break;
      default:
        msg = {
          platform: "Twitch",
          from: "System",
          message: `Unbekanntes Event: ${event.type}`,
          timestamp: new Date().toISOString(),
        };
    }

    events.unshift(msg);
    if (events.length > 30) events.pop();
    console.log(`✅ Twitch Event: ${msg.message}`);
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Twitch Fehler:", err);
    res.status(500).send("Error");
  }
});

// ---- FEED (Vorschau-Seite) ----
app.get("/feed", (req, res) => {
  const html = `
  <html>
  <head>
    <title>McHobi Activity Feed</title>
    <meta charset="utf-8" />
    <style>
      body {
        background: #0d1117;
        color: white;
        font-family: 'Segoe UI', sans-serif;
        padding: 20px;
      }
      h1 { color: #00aaff; }
      .event {
        background: #161b22;
        padding: 12px;
        border-radius: 10px;
        margin-bottom: 8px;
        box-shadow: 0 0 6px rgba(0,0,0,0.3);
      }
      .kofi { border-left: 4px solid #ff5f5f; }
      .twitch { border-left: 4px solid #9146ff; }
      .time {
        font-size: 12px;
        color: #999;
      }
    </style>
  </head>
  <body>
    <h1>McHobi Activity Feed 💫</h1>
    ${
      events.length === 0
        ? "<p>Noch keine Events eingegangen...</p>"
        : events
            .map(
              (e) => `
          <div class="event ${e.platform.toLowerCase()}">
            <strong>${e.platform}</strong> — ${e.from}<br/>
            ${e.message} ${e.amount ? `(${e.amount})` : ""}
            <div class="time">${new Date(e.timestamp).toLocaleString()}</div>
          </div>`
            )
            .join("")
    }
  </body>
  </html>`;
  res.send(html);
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
