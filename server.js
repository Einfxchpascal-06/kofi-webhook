// === McHobi Activity Feed Server ===
// Twitch (EventSub) + Ko-fi + Feed + Auto-Ping + Power-Ups + Clear-Fix 🔥

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
const TWITCH_SECRET = "soundwave_secret_2025";

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// === EVENT STORAGE ===
let feedEntries = [];
let clients = [];

// === SSE FEED ===
app.get("/events", (req, res) => {
  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Neueste zuerst auch beim Reconnect!
  for (const e of [...feedEntries].reverse()) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

function pushFeed(entry) {
  feedEntries.unshift(entry);
  if (feedEntries.length > 200) feedEntries.pop();
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {}
  }
}

// === CLEAR ===
app.post("/clear", (req, res) => {
  feedEntries = [];
  for (const c of clients) {
    try {
      c.write(`event: clear\ndata: {}\n\n`);
    } catch {}
  }
  console.log("🧹 Feed manuell geleert!");
  res.sendStatus(200);
});

// === AUTO PING ===
setInterval(() => {
  clients.forEach((res) =>
    res.write(`event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`)
  );
}, 55000);

// === KO-FI ===
app.post("/kofi", (req, res) => {
  let data = req.body;
  if (typeof data.data === "string") {
    try {
      data = JSON.parse(data.data);
    } catch {}
  }

  const token = data.verification_token || data.verificationToken;
  if (token !== KOFI_VERIFICATION_TOKEN) {
    console.log("❌ Ungültiger Ko-fi Token!");
    return res.status(403).send("invalid token");
  }

  const name = data.from_name || "Unbekannt";
  const amount = data.amount || "?";
  const currency = data.currency || "";
  const message = data.message || "";

  pushFeed({
    type: "kofi",
    message: `☕ ${name} spendete ${amount} ${currency} – "${message}"`,
    time: Date.now(),
  });
  res.sendStatus(200);
});

// === TWITCH EVENTSUB ===
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

  if (msgType === "webhook_callback_verification")
    return res.status(200).send(req.body.challenge);

  if (!verifyTwitchSignature(req)) {
    console.log("⚠️ Ungültige Twitch-Signatur!");
    return res.status(403).send("Invalid signature");
  }

  const event = req.body.event;
  const type = req.body.subscription?.type;
  if (msgType !== "notification") return res.sendStatus(200);

  try {
    switch (type) {
      case "channel.follow":
        pushFeed({ type: "twitch_follow", message: `🟣 Follow: ${event.user_name}`, time: Date.now() });
        break;
      case "channel.subscribe":
        pushFeed({
          type: "twitch_sub",
          message: event.message
            ? `💜 Sub: ${event.user_name} – "${event.message.text}"`
            : `💜 Sub: ${event.user_name}`,
          time: Date.now(),
        });
        break;
      case "channel.subscription.gift":
        pushFeed({
          type: "twitch_gift",
          message: `🎁 Gift Sub: ${event.user_name} → ${event.recipient_user_name}`,
          time: Date.now(),
        });
        break;
      case "channel.cheer": {
  const bits = event.bits || 0;
  // Twitch sendet message unterschiedlich
  const msg =
    typeof event.message === "object"
      ? event.message.text
      : typeof event.message === "string"
      ? event.message
      : "";
  const cleanMsg = msg?.trim() ? ` – "${msg.trim()}"` : "";

  pushFeed({
    type: "twitch_bits",
    message: `💎 ${event.user_name} sendete ${bits} Bits${cleanMsg}`,
    time: Date.now(),
  });
  break;
}
      case "channel.channel_points_custom_reward_redemption.add":
        const input = event.user_input ? ` ✏️ "${event.user_input}"` : "";
        pushFeed({
          type: "twitch_points",
          message: `🎯 ${event.user_name} löste "${event.reward.title}" ein!${input}`,
          time: Date.now(),
        });
        break;
      case "channel.raid":
        pushFeed({
          type: "twitch_raid",
          message: `🚀 Raid von ${event.from_broadcaster_user_name} mit ${event.viewers} Zuschauern!`,
          time: Date.now(),
        });
        break;
      case "channel.power_up":
        const user = event.user_name || "Unbekannt";
        const powerType = event.power_up_type || "Power-Up";
        const bitsUsed = event.bits_used || event.bits || "?";
        pushFeed({
          type: "twitch_powerup",
          message: `⚡ ${user} aktivierte "${powerType}" (${bitsUsed} Bits)`,
          time: Date.now(),
        });
        break;
    }
  } catch (err) {
    console.log("⚠️ Twitch-Fehler:", err);
  }

  res.sendStatus(200);
});

// === TWITCH SUBS ===
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
    const userRes = await axios.get(`https://api.twitch.tv/helix/users?login=${TWITCH_USER}`, {
      headers: { Authorization: `Bearer ${appToken}`, "Client-Id": TWITCH_CLIENT_ID },
    });
    const userId = userRes.data.data[0].id;

    const topics = [
      "channel.follow",
      "channel.subscribe",
      "channel.subscription.gift",
      "channel.cheer",
      "channel.channel_points_custom_reward_redemption.add",
      "channel.raid",
      "channel.power_up",
    ];

    for (const type of topics) {
      await axios.post(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          type,
          version: "1",
          condition: type === "channel.raid"
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
    console.error("❌ Twitch Setup Fehler:", err.response?.data || err.message);
  }
}

// === FRONTEND ===
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
    --bg:#0e0e10;--card:#15151a;--text:#fff;--muted:#a5a5b0;
    --twitch:#9146ff;--sub:#6e46ff;--gift:#b57aff;--bits:#00c8ff;
    --points:#00ff95;--raid:#ff3d8e;--powerup:#ffd700;--kofi:#ff7f32;
    --accent:#18e0d0;
  }
  body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",Roboto,sans-serif;}
  header{padding:12px 18px;background:rgba(20,20,25,0.85);border-bottom:1px solid #222;
  display:flex;align-items:center;justify-content:space-between;}
  header h1{font-size:18px;margin:0;}
  #status{font-size:13px;color:var(--muted);}
  #feed{padding:16px;display:flex;flex-direction:column;}
  .entry{background:var(--card);margin-bottom:10px;padding:10px 14px;border-left:4px solid var(--accent);
  border-radius:10px;box-shadow:0 3px 10px rgba(0,0,0,0.25);animation:fadeIn .3s ease forwards;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  .msg{font-weight:600;}
  .time{font-size:12px;color:var(--muted);margin-top:2px;}
  .kofi{border-left-color:var(--kofi);}
  .twitch_follow{border-left-color:var(--twitch);}
  .twitch_sub{border-left-color:var(--sub);}
  .twitch_gift{border-left-color:var(--gift);}
  .twitch_bits{border-left-color:var(--bits);}
  .twitch_points{border-left-color:var(--points);}
  .twitch_raid{border-left-color:var(--raid);}
  .twitch_powerup{border-left-color:var(--powerup);}
  button{background:var(--accent);color:#000;font-weight:600;border:none;padding:8px 14px;
  border-radius:8px;cursor:pointer;transition:.2s;margin-right:10px;}
  button:hover{filter:brightness(1.2);}
</style>
</head>
<body>
  <header>
    <h1>🎧 McHobi's Activity Feed</h1>
    <div>
      <button onclick="clearFeed()">🧹 Alles löschen</button>
      <span id="status">Verbinde…</span>
    </div>
  </header>
  <div id="feed"></div>
<script>
const feed=document.getElementById("feed");
const statusEl=document.getElementById("status");
let es;

function fmtTime(ts){return new Date(ts).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});}
function addEntry(e){
  const div=document.createElement("div");
  div.className="entry "+e.type;
  div.innerHTML=\`<div class="msg">\${e.message}</div><div class="time">\${fmtTime(e.time)}</div>\`;
  feed.insertBefore(div, feed.firstChild);
}
function clearFeed(){
  fetch("/clear",{method:"POST"}).then(()=>{
    feed.innerHTML="";
  });
}
function connect(){
  es=new EventSource("/events");
  es.onopen=()=>statusEl.textContent="🟢 Live verbunden";
  es.onerror=()=>statusEl.textContent="🔴 Verbindung getrennt…";
  es.onmessage=ev=>{
    try{addEntry(JSON.parse(ev.data));}catch{}
  };
  es.addEventListener("clear",()=>{
    feed.innerHTML="";
    // Reconnect sofort danach
    setTimeout(()=>{es.close();connect();},200);
  });
}
connect();
</script>
</body>
</html>
  `);
});

// === HEALTH ===
app.get("/healthz", (_, res) => res.send("OK"));

// === START ===
app.listen(PORT, async () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  await registerTwitchEvents();
});
