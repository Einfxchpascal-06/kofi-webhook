// === McHobi Activity Feed Server ===
// Twitch (EventSub) + Ko-fi + Feed + Autoping – Vollautomatisch 😎

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 10000;

// === ENV VARIABLEN ===
const KOFI_VERIFICATION_TOKEN = process.env.KO_FI_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USER = process.env.TWITCH_USER;
const TWITCH_SECRET = "soundwave_secret_2025"; // eigener Signaturschlüssel

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// === EVENT STORAGE ===
let feedEntries = [];
let clients = [];

// ==================== 🟢 ACTIVITY FEED (SSE) ====================
app.get("/events", (req, res) => {
  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // 🔹 Alte Einträge so senden, dass die neuesten oben stehen
  for (const e of [...feedEntries]) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }

  clients.push(res);
  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

function pushFeed(entry) {
  // 🔹 Immer an den Anfang der Liste setzen
  feedEntries.unshift(entry);
  if (feedEntries.length > 200) feedEntries.pop();
  const payload = `data: ${JSON.stringify(entry)}\n\n`;

  // 🔹 An alle verbundenen Clients senden
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {}
  }
}

// Keep-alive Ping
setInterval(() => {
  clients.forEach((res) =>
    res.write(
      `event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`
    )
  );
}, 55000);

// === Feed clear ===
app.post("/clear", (_, res) => {
  feedEntries = [];
  for (const client of clients) {
    client.write(`event: clear\ndata: {}\n\n`);
  }
  res.sendStatus(200);
});

// ==================== ☕ KO-FI WEBHOOK ====================
app.post("/kofi", (req, res) => {
  let data = req.body;
  if (typeof data.data === "string") {
    try {
      data = JSON.parse(data.data);
    } catch {}
  }

  const token =
    data.verification_token ||
    data.verificationToken ||
    data.data?.verification_token ||
    data.data?.verificationToken;

  if (token !== KOFI_VERIFICATION_TOKEN) {
    console.log("❌ Ungültiger Ko-fi Token!");
    return res.status(403).send("invalid token");
  }

  const name = data.from_name || "Unbekannt";
  const amount = data.amount || "?";
  const currency = data.currency || "";
  const message = data.message || "";

  console.log(`☕ Neue Ko-fi Donation: ${name} ${amount} ${currency} – "${message}"`);
  pushFeed({
    type: "kofi",
    message: `☕ ${name} spendete ${amount} ${currency} – "${message}"`,
    time: Date.now(),
  });
  res.sendStatus(200);
});

// ==================== 🟣 TWITCH EVENTSUB ====================
function verifyTwitchSignature(req) {
  const msgId = req.header("Twitch-Eventsub-Message-Id");
  const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
  const signature = req.header("Twitch-Eventsub-Message-Signature");
  const body = JSON.stringify(req.body);
  const message = msgId + timestamp + body;
  const hmac = crypto.createHmac("sha256", TWITCH_SECRET).update(message).digest("hex");
  const expected = `sha256=${hmac}`;
  return signature === expected;
}

app.post("/twitch", (req, res) => {
  const msgType = req.header("Twitch-Eventsub-Message-Type");

  if (msgType === "webhook_callback_verification") {
    console.log("✅ Twitch Webhook bestätigt.");
    return res.status(200).send(req.body.challenge);
  }

 // if (!verifyTwitchSignature(req)) {
 //   console.log("⚠️ Ungültige Twitch-Signatur, Request verworfen.");
 //   return res.status(403).send("Invalid signature");
 // }

  const event = req.body.event;
  const type = req.body.subscription?.type;

  console.log("🎯 Twitch Event:", type, event);

  if (msgType === "notification") {
    try {
      switch (type) {
        case "channel.follow":
          pushFeed({
            type: "twitch_follow",
            message: `🟣 Follow: ${event.user_name}`,
            time: Date.now(),
          });
          break;

        case "channel.subscribe":
          pushFeed({
            type: "twitch_sub",
            message: `💜 Sub: ${event.user_name || "Neuer Sub"}`,
            time: Date.now(),
          });
          break;

        case "channel.subscription.gift": {
          const gifter = event.user_name || "Unbekannt";
          const total = event.total || 1;
          pushFeed({
            type: "twitch_gift",
            message: `🎁 Gift Sub: ${gifter} → ${total}`,
            time: Date.now(),
          });
          break;
        }

case "channel.cheer": {
  const bits = event.bits || 0;

  // Extrahiere Nachricht aus event.message oder message.text
  let rawMsg = "";
  if (typeof event.message === "string") rawMsg = event.message;
  else if (typeof event.message === "object") rawMsg = event.message.text || "";
  rawMsg = (rawMsg || "").trim();

  // Entferne den cheer-Tag, egal ob vorne oder hinten
  const cleanMsg = rawMsg.replace(/cheer\d+/gi, "").trim();

  const msgText = cleanMsg ? ` – "${cleanMsg}"` : "";

  pushFeed({
    type: "twitch_bits",
    message: `💎 ${event.user_name} sendete ${bits} Bits${msgText}`,
    time: Date.now(),
  });
  break;
}

        case "channel.channel_points_custom_reward_redemption.add": {
          const input = event.user_input ? ` ✏️ "${event.user_input}"` : "";
          pushFeed({
            type: "twitch_points",
            message: `🎯 ${event.user_name} löste "${event.reward.title}" ein!${input}`,
            time: Date.now(),
          });
          break;
        }

        case "channel.raid": {
          const raider =
            event.from_broadcaster_user_name ||
            event.broadcaster_user_name ||
            "Unbekannt";
          const viewers = event.viewers || 0;
          pushFeed({
            type: "twitch_raid",
            message: `🚀 Raid von ${raider} mit ${viewers} Zuschauern!`,
            time: Date.now(),
          });
          break;
        }
      }
    } catch (err) {
      console.log("⚠️ Fehler bei Twitch-Event:", err);
    }
  }

  res.sendStatus(200);
});

// === Twitch Auto-Subscribe beim Start ===
async function registerTwitchEvents() {
  try {
    const tokenRes = await axios.post("https://id.twitch.tv/oauth2/token", null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials",
      },
    });

    const appToken = tokenRes.data.access_token;
    console.log("✅ Twitch App Token erhalten.");

    const userRes = await axios.get(`https://api.twitch.tv/helix/users?login=${TWITCH_USER}`, {
      headers: { Authorization: `Bearer ${appToken}`, "Client-Id": TWITCH_CLIENT_ID },
    });
    const userId = userRes.data.data[0].id;
    console.log("🆔 Twitch User-ID:", userId);

    const topics = [
      "channel.follow",
      "channel.subscribe",
      "channel.subscription.gift",
      "channel.cheer",
      "channel.channel_points_custom_reward_redemption.add",
      "channel.raid",
    ];

    for (const type of topics) {
      await axios.post(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          type,
          version: "1",
          condition:
            type === "channel.raid"
              ? { to_broadcaster_user_id: userId }
              : { broadcaster_user_id: userId },
          transport: {
            method: "webhook",
            callback: `https://kofi-webhook-e87r.onrender.com/twitch`,
            secret: TWITCH_SECRET,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${appToken}`,
            "Client-Id": TWITCH_CLIENT_ID,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`📡 Twitch EventSub "${type}" registriert.`);
    }
  } catch (err) {
    console.error("❌ Fehler beim Twitch-EventSub-Setup:", err.response?.data || err.message);
  }
}

// ==================== 🌐 FRONTEND ====================
app.get("/feed", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>McHobi's Activity Feed</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --bg: #0e0e10; --card: #15151a; --text: #fff; --muted: #a5a5b0;
    --accent: #18e0d0; --kofi: #ff7f32; --twitch: #9146ff;
    --sub: #6e46ff; --gift: #b57aff; --bits: #00c8ff;
    --points: #00ff95; --raid: #ff3d8e;
  }
  body { margin:0; background:var(--bg); color:var(--text); font-family:"Segoe UI",Roboto,sans-serif; }
  header { padding:12px 18px; background:rgba(20,20,25,0.85); border-bottom:1px solid #222;
    backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:space-between; }
  header h1 { font-size:18px; margin:0; }
  #status { font-size:13px; color:var(--muted); }
  #feed { padding:16px; display:flex; flex-direction:column; }
  .entry { background:var(--card); margin-bottom:10px; padding:10px 14px;
    border-left:4px solid var(--accent); border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.25);
    animation:fadeIn .3s ease forwards; }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  .msg { font-weight:600; }
  .time { font-size:12px; color:var(--muted); margin-top:2px; }
  .kofi { border-left-color:var(--kofi); }
  .twitch_follow { border-left-color:var(--twitch); }
  .twitch_sub { border-left-color:var(--sub); }
  .twitch_gift { border-left-color:var(--gift); }
  .twitch_bits { border-left-color:var(--bits); }
  .twitch_points { border-left-color:var(--points); }
  .twitch_raid { border-left-color:var(--raid); }
  button { background:var(--raid); border:none; color:white; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:600; }
  button:hover { opacity:0.8; }
</style>
</head>
<body>
  <header>
    <h1>🎧 McHobi's Activity Feed</h1>
    <div>
      <button onclick="clearFeed()">Reset</button>
      <span id="status">Verbinde…</span>
    </div>
  </header>
  <div id="feed"></div>
<script>
const feed=document.getElementById("feed"),statusEl=document.getElementById("status");
function fmtTime(ts){return new Date(ts).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});}
function addEntry(e){
  const div=document.createElement("div");
  div.className="entry "+e.type;
  div.innerHTML=\`<div class="msg">\${e.message}</div><div class="time">\${fmtTime(e.time)}</div>\`;
  feed.prepend(div);
}
function clearFeed(){feed.innerHTML="";fetch("/clear",{method:"POST"});}
function connect(){
  const es=new EventSource("/events");
  es.onopen=()=>statusEl.textContent="🟢 Live verbunden";
  es.onerror=()=>statusEl.textContent="🔴 Verbindung getrennt…";
  es.addEventListener("clear",()=>feed.innerHTML="");
  es.onmessage=ev=>{try{addEntry(JSON.parse(ev.data));}catch{}};
}
connect();
</script>
</body>
</html>`);
});

// === HEALTH CHECK ===
app.get("/healthz", (_, res) => res.send("OK"));

// === START SERVER ===
app.listen(PORT, async () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  await registerTwitchEvents();
});
