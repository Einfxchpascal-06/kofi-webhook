import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const TWITCH_SECRET = "soundwave_secret_2025";
const KOFI_VERIFICATION_TOKEN = "8724041a-c3b4-4683-b309-8e08591552e2";

// ===== Speicher für Feed =====
let feedEntries = [];
const sseClients = new Set();

function pushFeed(entry) {
  feedEntries.unshift(entry);
  if (feedEntries.length > 200) feedEntries.pop();
  const data = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch {}
  }
}

// ===== Ko-fi Webhook =====
app.post("/kofi", (req, res) => {
  const data = req.body;
  if (data.verification_token !== KOFI_VERIFICATION_TOKEN) {
    console.log("❌ Ungültiger Ko-fi Token!");
    return res.status(403).send("invalid token");
  }
  console.log("☕ Neue Ko-fi Donation:", data.from_name, data.amount, data.currency);
  const message = `☕ ${data.from_name} spendete ${data.amount} ${data.currency} – "${data.message}"`;
  pushFeed({ type: "kofi", message, time: Date.now() });
  res.sendStatus(200);
});

// ===== Twitch Webhook =====
app.post("/twitch", (req, res) => {
  const msgType = req.header("Twitch-Eventsub-Message-Type");
  const body = req.body;

  // Twitch Challenge bestätigen
  if (msgType === "webhook_callback_verification") {
    console.log("✅ Twitch Webhook bestätigt.");
    return res.status(200).send(body.challenge);
  }

  // Events verarbeiten
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
        const months = event.cumulative_months || 1;
        pushFeed({
          type: "twitch_sub",
          message: `💜 Sub: ${event.user_name} (${tier}, insgesamt ${months} Monate)`,
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
else if (type === "channel.channel_points_custom_reward_redemption.add") {
  let msg = `🎯 ${event.user_name} löste "${event.reward?.title || "Belohnung"}" ein!`;
  if (event.user_input) {
    msg += ` ✏️ "${event.user_input}"`;
  }
  pushFeed({
    type: "twitch_points",
    message: msg,
    time: Date.now()
  });
}

    } catch (err) {
      console.log("⚠️ Fehler bei Twitch-Event:", err);
    }
  }

  res.sendStatus(200);
});

// ====== Server-Sent Events für Feed ======
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Letzte 25 Einträge sofort senden
  for (const e of [...feedEntries].slice(0, 25).reverse()) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ====== Schicker Feed unter /feed ======
app.get("/feed", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>McHobi Activity Feed</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
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
    --points: #00ff95;
    --kofi: #ff7f32;
    --accent: #18e0d0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; height: 100vh;
  }
  header {
    padding: 12px 18px;
    background: rgba(20,20,25,0.85);
    border-bottom: 1px solid #222;
    position: sticky; top: 0; backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: space-between;
  }
  header h1 { font-size: 18px; margin: 0; letter-spacing: .4px; }
  #status { font-size: 13px; color: var(--muted); }
  #feed {
    flex: 1; overflow-y: auto; padding: 16px;
    scroll-behavior: smooth;
  }
  .entry {
    background: var(--card);
    margin-bottom: 10px; padding: 10px 14px;
    border-left: 4px solid var(--accent);
    border-radius: 10px; box-shadow: 0 3px 10px rgba(0,0,0,0.25);
    opacity: 0; transform: translateY(5px);
    animation: fadeIn .3s ease forwards;
  }
  @keyframes fadeIn {
    to { opacity: 1; transform: translateY(0); }
  }
  .msg { font-weight: 600; }
  .time { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .kofi { border-left-color: var(--kofi); }
  .twitch_follow { border-left-color: var(--twitch); }
  .twitch_sub { border-left-color: var(--sub); }
  .twitch_gift { border-left-color: var(--gift); }
  .twitch_bits { border-left-color: var(--bits); }
  .twitch_points { border-left-color: var(--points); }
</style>
</head>
<body>
  <header>
    <h1>🎧 McHobi74 Live Activity Feed</h1>
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
  if (feed.children.length > 200) feed.removeChild(feed.firstChild);
}

function connect() {
  const es = new EventSource("/events");
  es.onopen = () => statusEl.textContent = "Live verbunden";
  es.onerror = () => statusEl.textContent = "Verbindung getrennt…";
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

// ====== Healthcheck ======
app.get("/", (_, res) => res.send("Soundwave Ko-fi & Twitch Webhook läuft!"));

// ====== Start Server ======
app.listen(PORT, () => console.log("🚀 Server läuft auf Port", PORT));
