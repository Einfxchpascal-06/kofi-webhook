// === McHobi Activity Feed Server ===
// Twitch (EventSub v1 – aktuelle Typen 2025) + Ko-fi + Feed Display

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

  // immer neueste oben
  for (const e of [...feedEntries].reverse()) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }

  clients.push(res);
  req.on("close", () => (clients = clients.filter((c) => c !== res)));
});

function pushFeed(entry) {
  feedEntries.unshift(entry);
  if (feedEntries.length > 200) feedEntries.pop();
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const c of clients) {
    try {
      c.write(payload);
    } catch {}
  }
}

setInterval(() => {
  clients.forEach((res) =>
    res.write(`event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`)
  );
}, 55000);

app.post("/clear", (_, res) => {
  feedEntries = [];
  for (const c of clients) c.write(`event: clear\ndata: {}\n\n`);
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

  if (!verifyTwitchSignature(req)) {
    console.log("⚠️ Ungültige Twitch-Signatur.");
    return res.status(403).send("Invalid signature");
  }

  const event = req.body.event;
  const type = req.body.subscription?.type;
  console.log("🎯 Twitch Event:", type, event);

  if (msgType === "notification") {
    try {
      switch (type) {
        case "channel.subscription.message":
          pushFeed({
            type: "twitch_sub",
            message: `💜 Sub von ${event.user_name || "Neuer Sub"} – Tier ${
              event.tier / 1000 || 1
            } (${event.cumulative_months || 1} Monate)`,
            time: Date.now(),
          });
          break;

        case "channel.subscription.gift":
          pushFeed({
            type: "twitch_gift",
            message: `🎁 ${event.user_name || "Jemand"} verschenkte ${
              event.total || 1
            } Sub(s)!`,
            time: Date.now(),
          });
          break;

        case "channel.cheer":
          const msg =
            typeof event.message === "object"
              ? event.message.text
              : typeof event.message === "string"
              ? event.message
              : "";
          const cleanMsg = msg?.trim() ? ` – "${msg.trim()}"` : "";
          pushFeed({
            type: "twitch_bits",
            message: `💎 ${event.user_name} sendete ${event.bits} Bits${cleanMsg}`,
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
      }
    } catch (err) {
      console.log("⚠️ Fehler bei Twitch-Event:", err);
    }
  }

  res.sendStatus(200);
});

// === Twitch OAuth Callback ===
app.get("/twitch/callback", (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Fehlender Code");
  res.send("✅ Twitch Autorisierung erfolgreich! Du kannst das Fenster jetzt schließen.");
  console.log("🔑 Twitch OAuth Code erhalten:", code);
});

// === Twitch Auto-Subscribe ===
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

    // === Nur gültige Typen (v1, 2025) ===
    const topics = [
      { type: "channel.subscription.message", version: "1" },
      { type: "channel.subscription.gift", version: "1" },
      { type: "channel.cheer", version: "1" },
      { type: "channel.raid", version: "1" },
    ];

    for (const topic of topics) {
      try {
        await axios.post(
          "https://api.twitch.tv/helix/eventsub/subscriptions",
          {
            type: topic.type,
            version: topic.version,
            condition:
              topic.type === "channel.raid"
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
        console.log(`📡 Twitch EventSub "${topic.type}" (v${topic.version}) registriert.`);
      } catch (err) {
        console.log(
          `⚠️ Twitch EventSub "${topic.type}" konnte nicht registriert werden:`,
          err.response?.data || err.message
        );
      }
    }
  } catch (err) {
    console.error("❌ Fehler beim Twitch-EventSub-Setup:", err.response?.data || err.message);
  }
}

// ==================== FRONTEND ====================
app.get("/feed", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="de"><head>
<meta charset="utf-8"/><title>McHobi Feed</title>
<style>
:root{--bg:#0e0e10;--card:#15151a;--text:#fff;--accent:#18e0d0;
--kofi:#ff7f32;--sub:#6e46ff;--gift:#b57aff;--bits:#00c8ff;--raid:#ff3d8e;}
body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",Roboto,sans-serif;}
#feed{padding:16px;display:flex;flex-direction:column;}
.entry{background:var(--card);margin-bottom:10px;padding:10px 14px;
border-left:4px solid var(--accent);border-radius:10px;box-shadow:0 3px 10px rgba(0,0,0,.25);}
.kofi{border-left-color:var(--kofi)}.twitch_sub{border-left-color:var(--sub)}
.twitch_gift{border-left-color:var(--gift)}.twitch_bits{border-left-color:var(--bits)}
.twitch_raid{border-left-color:var(--raid)}
</style></head><body><div id="feed"></div>
<script>
const f=document.getElementById("feed");
function add(e){const d=document.createElement("div");
d.className="entry "+e.type;
d.innerHTML=\`<div>\${e.message}</div>\`;
f.prepend(d);}
const es=new EventSource("/events");
es.onmessage=e=>{try{add(JSON.parse(e.data))}catch{}};
</script></body></html>`);
});

app.get("/healthz", (_, res) => res.send("OK"));

app.listen(PORT, async () => {
  console.log(\`🚀 Server läuft auf Port \${PORT}\`);
  await registerTwitchEvents();
});
