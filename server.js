// === McHobi Activity Feed Server ===
// Twitch + Ko-fi + Feed + Autoping + SSE Stream

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import axios from "axios";
import multer from "multer";

const app = express();
const upload = multer();
const PORT = process.env.PORT || 10000;

// === ENV VARIABLEN ===
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USER = process.env.TWITCH_USER;
const KO_FI_TOKEN = process.env.KO_FI_TOKEN;
console.log("🧩 KO_FI_TOKEN geladen:", KO_FI_TOKEN ? "✅ vorhanden" : "❌ fehlt!");

// === BASIS SETUP ===
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// === EVENT-SPEICHER ===
let events = [];

// === HEALTHCHECK ===
app.get("/healthz", (req, res) => res.status(200).send("OK"));

// === KO-FI WEBHOOK ===
app.post("/kofi", upload.none(), async (req, res) => {
  try {
    let data = {};

    if (req.body.data) {
      try {
        data = JSON.parse(req.body.data);
      } catch {
        data = req.body;
      }
    } else if (req.body.verification_token) {
      data = req.body;
    } else if (typeof req.body === "string") {
      try {
        data = JSON.parse(req.body);
      } catch {
        const params = new URLSearchParams(req.body);
        data = Object.fromEntries(params.entries());
      }
    }

    console.log("📦 Ko-fi Payload empfangen:", data);

    const receivedToken =
      data.verification_token || data["verification_token"];
    const expectedToken = (KO_FI_TOKEN || "").trim();

    if (!receivedToken || receivedToken.trim() !== expectedToken) {
      console.log(`❌ Ungültiger Ko-fi Token! Erhalten: ${receivedToken}`);
      return res.status(403).send("Forbidden");
    }

    const donation = {
      type: "kofi",
      message: `☕ ${data.from_name || "Unbekannt"} spendete ${data.amount} ${
        data.currency || "USD"
      } – "${data.message || "Keine Nachricht"}"`,
      time: Date.now(),
    };

    events.unshift(donation);
    if (events.length > 200) events.pop();

    console.log(`✅ Neue Ko-fi Donation: ${donation.message}`);
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Fehler im Ko-fi Webhook:", err);
    res.status(500).send("Error");
  }
});

// === TWITCH WEBHOOK ===
app.post("/twitch", (req, res) => {
  try {
    const body = req.body;
    const event = body.event || body;
    const type = body.subscription?.type || event.type || "unknown";

    let msg;
    switch (type) {
      case "channel.subscribe":
        msg = {
          type: "twitch_sub",
          message: `💜 Sub: ${event.user_name || "Unbekannt"} (${
            event.tier || "Tier 1"
          })${event.message ? ` – "${event.message}"` : ""}`,
          time: Date.now(),
        };
        break;
      case "channel.cheer":
        msg = {
          type: "twitch_bits",
          message: `💎 ${event.user_name || "Unbekannt"} hat ${
            event.bits || 0
          } Bits gesendet!${event.message ? ` – "${event.message}"` : ""}`,
          time: Date.now(),
        };
        break;
      case "channel.follow":
        msg = {
          type: "twitch_follow",
          message: `🟣 Neuer Follower: ${event.user_name || "Unbekannt"}`,
          time: Date.now(),
        };
        break;
      case "channel.raid":
        msg = {
          type: "twitch_raid",
          message: `⚡ Raid von ${
            event.from_broadcaster_user_name || "Unbekannt"
          } mit ${event.viewers || 0} Zuschauern!`,
          time: Date.now(),
        };
        break;
      case "channel.channel_points_custom_reward_redemption.add":
        msg = {
          type: "twitch_points",
          message: `🎯 ${event.user_name || "Unbekannt"} löste "${
            event.reward?.title || "Belohnung"
          }" ein!${
            event.user_input ? ` ✏️ "${event.user_input}"` : ""
          }`,
          time: Date.now(),
        };
        break;
      default:
        msg = {
          type: "twitch_other",
          message: `📢 Unbekanntes Event: ${type}`,
          time: Date.now(),
        };
    }

    events.unshift(msg);
    if (events.length > 200) events.pop();
    console.log(`✅ Twitch Event: ${msg.message}`);
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Twitch Fehler:", err);
    res.status(500).send("Error");
  }
});

// === FRONTEND (Feed) ===
app.get("/feed", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>McHobi's Activity Feed</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --bg: #0e0e10;
    --card: #15151a;
    --text: #fff;
    --muted: #a5a5b0;
    --twitch: #9146ff;
    --bits: #00c8ff;
    --points: #00ff95;
    --kofi: #ff7f32;
  }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: "Segoe UI", Roboto, sans-serif;
  }
  header {
    padding: 12px 18px;
    background: rgba(20,20,25,0.85);
    border-bottom: 1px solid #222;
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: space-between;
  }
  header h1 { font-size: 18px; margin: 0; }
  #status { font-size: 13px; color: var(--muted); }
  #feed { padding: 16px; display: flex; flex-direction: column-reverse; }
  .entry {
    background: var(--card);
    margin-bottom: 10px; padding: 10px 14px;
    border-left: 4px solid #18e0d0;
    border-radius: 10px;
    box-shadow: 0 3px 10px rgba(0,0,0,0.25);
    opacity: 0; transform: translateY(-5px) scale(0.98);
    animation: fadeIn 0.35s ease forwards;
  }
  @keyframes fadeIn { to { opacity: 1; transform: translateY(0) scale(1); } }
  .msg { font-weight: 600; }
  .time { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .kofi { border-left-color: var(--kofi); }
  .twitch_follow, .twitch_sub, .twitch_gift, .twitch_bits, .twitch_points, .twitch_raid { border-left-color: var(--twitch); }

  @keyframes glow-twitch {
    0% { box-shadow: 0 0 0px var(--twitch); }
    50% { box-shadow: 0 0 12px var(--twitch); }
    100% { box-shadow: 0 0 0px var(--twitch); }
  }
  @keyframes glow-kofi {
    0% { box-shadow: 0 0 0px var(--kofi); }
    50% { box-shadow: 0 0 12px var(--kofi); }
    100% { box-shadow: 0 0 0px var(--kofi); }
  }
</style>
</head>
<body>
  <header>
    <h1>🎧 McHobi's Activity Feed</h1>
    <div id="status">Verbinde…</div>
  </header>
  <div id="feed"></div>
<script>
const feed = document.getElementById("feed");
const statusEl = document.getElementById("status");

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" });
}

function addEntry(e) {
  const div = document.createElement("div");
  div.className = "entry " + e.type;
  div.innerHTML = \`
    <div class="msg">\${e.message}</div>
    <div class="time">\${fmtTime(e.time)}</div>\`;

  feed.prepend(div);

  div.animate(
    [
      { transform: "scale(1.05)", filter: "brightness(1.5)" },
      { transform: "scale(1)", filter: "brightness(1)" }
    ],
    { duration: 300, easing: "ease-out" }
  );

  if (e.type.startsWith("twitch")) {
    div.style.animation = "glow-twitch 1s ease-out";
  } else if (e.type.startsWith("kofi")) {
    div.style.animation = "glow-kofi 1s ease-out";
  }
}

function connect() {
  const es = new EventSource("/events");
  es.onopen = () => statusEl.textContent = "🟢 Live verbunden";
  es.onerror = () => statusEl.textContent = "🔴 Verbindung getrennt…";
  es.onmessage = ev => {
    try { addEntry(JSON.parse(ev.data)); } catch {}
  };
}
connect();
</script>
</body>
</html>
  `);
});

// === LIVE EVENT STREAM (SSE) ===
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initiale Events senden
  events.slice(0, 15).forEach((e) => sendEvent(e));

  // Hook, um neue Events live zu pushen
  const originalUnshift = events.unshift.bind(events);
  events.unshift = (item) => {
    originalUnshift(item);
    sendEvent(item);
    if (events.length > 200) events.pop();
    return events.length;
  };

  req.on("close", () => console.log("❌ Feed-Client getrennt"));
});

// === AUTOPING ===
const SELF_URL = "https://kofi-webhook-e87r.onrender.com/healthz";
setInterval(async () => {
  try {
    await axios.get(SELF_URL);
    console.log("💤 Auto-Ping erfolgreich");
  } catch {
    console.log("⚠️ Auto-Ping fehlgeschlagen");
  }
}, 240000);

// === START ===
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
