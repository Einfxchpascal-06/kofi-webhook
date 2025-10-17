// === McHobi Activity Feed Server ===
// Kombiniert: Stabiler Ko-fi Webhook + Twitch + schöner SSE-Feed mit Style
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import multer from "multer";

const app = express();
const upload = multer();
const PORT = process.env.PORT || 10000;

// === ENV VARIABLEN ===
const KO_FI_TOKEN = process.env.KO_FI_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USER = process.env.TWITCH_USER;

console.log("🧩 KO_FI_TOKEN geladen:", KO_FI_TOKEN ? "✅ vorhanden" : "❌ fehlt!");

// === BASIS SETUP ===
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// === EVENT FEED (SSE) ===
let feedEntries = [];
let clients = [];

// Verbindung für Browser
app.get("/events", (req, res) => {
  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Alte Einträge beim Verbinden senden
  for (const e of [...feedEntries].slice(0, 25).reverse()) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }

  clients.push(res);
  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

// KeepAlive-Ping
setInterval(() => {
  clients.forEach((res) =>
    res.write(`event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`)
  );
}, 55000);

// Neuen Feed-Eintrag senden
function pushFeed(entry) {
  feedEntries.unshift(entry);
  if (feedEntries.length > 200) feedEntries.pop();
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

// === KO-FI WEBHOOK ===
app.post("/kofi", upload.none(), async (req, res) => {
  try {
    let data = req.body;
    if (typeof data.data === "string") {
      try { data = JSON.parse(data.data); } catch {}
    }

    const receivedToken =
      data.verification_token || data["verification_token"];
    const expectedToken = (KO_FI_TOKEN || "").trim();

    if (!receivedToken || receivedToken.trim() !== expectedToken) {
      console.log(`❌ Ungültiger Ko-fi Token! Erhalten: ${receivedToken}`);
      return res.status(403).send("Forbidden");
    }

    const name = data.from_name || "Unbekannt";
    const amount = data.amount || "?";
    const currency = data.currency || "";
    const message = data.message || "";

    console.log(`☕ Neue Ko-fi Donation: ${name} ${amount} ${currency} – "${message}"`);
    pushFeed({
      type: "kofi",
      message: `☕ ${name} spendete ${amount} ${currency} – "${message}"`,
      time: Date.now()
    });
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Fehler im Ko-fi Webhook:", err);
    res.sendStatus(500);
  }
});

// === TWITCH WEBHOOK ===
app.post("/twitch", (req, res) => {
  const msgType = req.header("Twitch-Eventsub-Message-Type");
  const body = req.body;

  if (msgType === "webhook_callback_verification") {
    console.log("✅ Twitch Webhook bestätigt.");
    return res.status(200).send(body.challenge);
  }

  if (msgType === "notification") {
    const event = body.event;
    const type = body.subscription?.type;
    console.log("🎯 Twitch Event:", type);

    try {
      if (type === "channel.follow") {
        pushFeed({ type: "twitch_follow", message: `🟣 Follow: ${event.user_name}`, time: Date.now() });
      } 
      else if (type === "channel.subscribe") {
        const tierMap = { "1000": "Tier 1", "2000": "Tier 2", "3000": "Tier 3" };
        const tier = tierMap[event.tier] || "Tier ?";
        pushFeed({
          type: "twitch_sub",
          message: `💜 Sub: ${event.user_name} (${tier})`,
          time: Date.now()
        });
      } 
      else if (type === "channel.subscription.gift") {
        pushFeed({
          type: "twitch_gift",
          message: `🎁 Gift Sub: ${event.user_name} → ${event.recipient_user_name}`,
          time: Date.now()
        });
      } 
      else if (type === "channel.cheer") {
        pushFeed({
          type: "twitch_bits",
          message: `💎 Bits: ${event.user_name} hat ${event.bits} Bits gesendet!`,
          time: Date.now()
        });
      }
    } catch (err) {
      console.log("⚠️ Fehler bei Twitch-Event:", err);
    }
  }

  res.sendStatus(200);
});

// === FRONTEND ===
app.get("/feed", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>McHobi's Activity Feed</title>
<style>
  :root {
    --bg: #0e0e10;
    --card: #15151a;
    --text: #fff;
    --muted: #a5a5b0;
    --twitch: #9146ff;
    --sub: #6e46ff;
    --gift: #b57aff;
    --bits: #00c8ff;
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
    display: flex; align-items: center; justify-content: space-between;
  }
  header h1 { font-size: 18px; margin: 0; }
  #status { font-size: 13px; color: var(--muted); }
  #feed { padding: 16px; }
  .entry {
    background: var(--card);
    margin-bottom: 10px; padding: 10px 14px;
    border-left: 4px solid var(--twitch);
    border-radius: 10px; box-shadow: 0 3px 10px rgba(0,0,0,0.25);
    opacity: 0; transform: translateY(5px);
    animation: fadeIn .3s ease forwards;
  }
  @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
  .msg { font-weight: 600; }
  .time { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .kofi { border-left-color: var(--kofi); }
  .twitch_follow { border-left-color: var(--twitch); }
  .twitch_sub { border-left-color: var(--sub); }
  .twitch_gift { border-left-color: var(--gift); }
  .twitch_bits { border-left-color: var(--bits); }
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
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
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
</html>`);
});

// === HEALTH ===
app.get("/healthz", (_, res) => res.send("OK"));

// === AUTO-PING ===
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
app.listen(PORT, () => console.log("🚀 Server läuft auf Port", PORT));
