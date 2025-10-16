import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// 🟢 Twitch Konfiguration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USER = process.env.TWITCH_USER || "McHobi74";
const KO_FI_TOKEN = process.env.KO_FI_TOKEN || "8724041a-c3b4-4683-b309-8e08591552e2";

let feedEntries = [];

// 💚 Testseite
app.get("/", (req, res) => {
  res.send("<h2>✅ Soundwave Ko-fi & Twitch Webhook läuft!</h2>");
});

// ☕ Ko-fi Webhook
app.post("/kofi", (req, res) => {
  const data = req.body;

  if (!data.verification_token || data.verification_token !== KO_FI_TOKEN) {
    console.log("❌ Ungültiger Ko-fi Verification Token:", data.verification_token);
    return res.sendStatus(403);
  }

  console.log("☕ Neue Ko-fi Donation:", data);

  const message = `☕ ${data.from_name} spendete ${data.amount} ${data.currency} – "${data.message}"`;
  feedEntries.unshift({ type: "kofi", message, time: new Date() });

  res.sendStatus(200);
});

// 💜 Twitch Webhook für EventSub
app.post("/twitch", express.json({ type: "*/*" }), async (req, res) => {
  const messageType = req.header("Twitch-Eventsub-Message-Type");
  const event = req.body.event;

  // Twitch-Verifizierung
  if (messageType === "webhook_callback_verification") {
    console.log("✅ Twitch Webhook bestätigt.");
    return res.send(req.body.challenge);
  }

  // Twitch-Benachrichtigungen
  if (messageType === "notification") {
    const type = req.body.subscription.type;

    switch (type) {
      case "channel.follow": {
        const message = `🟣 Follow: ${event.user_name}`;
        console.log(message);
        feedEntries.unshift({ type: "twitch_follow", message, time: new Date() });
        break;
      }

      case "channel.subscribe": {
        const tier =
          event.tier === "1000"
            ? "Tier 1"
            : event.tier === "2000"
            ? "Tier 2"
            : event.tier === "3000"
            ? "Tier 3"
            : "Unbekannt";
        const duration = event.duration_months || 1;
        const totalMonths = event.cumulative_months || 1;
        const message = `💜 Sub: ${event.user_name} (${tier} – ${duration} Monat(e) im Voraus, insgesamt ${totalMonths} Monat(e))`;
        console.log(message);
        feedEntries.unshift({ type: "twitch_sub", message, time: new Date() });
        break;
      }

      case "channel.subscription.gift": {
        const gifter = event.user_name || "Anonym";
        const recipient = event.recipient_user_name || "Unbekannt";
        const tier =
          event.tier === "1000"
            ? "Tier 1"
            : event.tier === "2000"
            ? "Tier 2"
            : event.tier === "3000"
            ? "Tier 3"
            : "Unbekannt";
        const message = `🎁 Gift Sub: ${gifter} → ${recipient} (${tier})`;
        console.log(message);
        feedEntries.unshift({ type: "twitch_gift", message, time: new Date() });
        break;
      }

      case "channel.cheer": {
        const message = `💎 Bits: ${event.user_name} hat ${event.bits} Bits gesendet!`;
        console.log(message);
        feedEntries.unshift({ type: "twitch_bits", message, time: new Date() });
        break;
      }

      case "channel.channel_points_custom_reward_redemption.add": {
        const message = `🎯 Channel Points: ${event.user_name} löste "${event.reward.title}" ein!`;
        console.log(message);
        feedEntries.unshift({ type: "twitch_points", message, time: new Date() });
        break;
      }

      default:
        console.log("📨 Unbekannter Twitch-Event-Typ:", type);
        break;
    }
  }

  res.sendStatus(200);
});

// 🖥️ Feed-Anzeige
app.get("/feed", (req, res) => {
  const html = `
    <html>
      <head>
        <title>Soundwave Activity Feed</title>
        <meta http-equiv="refresh" content="3">
        <style>
          body {
            background-color: #0e0e10;
            color: white;
            font-family: Arial, sans-serif;
            padding: 20px;
          }
          .entry {
            margin-bottom: 10px;
            padding: 8px 12px;
            border-radius: 8px;
          }
          .kofi { background-color: #ff7f32; }
          .twitch_follow { background-color: #9146ff; }
          .twitch_sub { background-color: #6e46ff; }
          .twitch_gift { background-color: #b57aff; }
          .twitch_bits { background-color: #00c8ff; }
          .twitch_points { background-color: #00ff95; }
          small { color: #aaa; }
        </style>
      </head>
      <body>
        <h2>🎧 Soundwave1111 Activity Feed</h2>
        ${feedEntries
          .map(
            (e) =>
              `<div class="entry ${e.type}">
                <b>${e.message}</b><br><small>${new Date(e.time).toLocaleTimeString()}</small>
              </div>`
          )
          .join("")}
      </body>
    </html>
  `;
  res.send(html);
});

// 🌍 Start
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Server läuft auf Port ${PORT}`));
