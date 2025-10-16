import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// === ENV ===
const KOFI_TOKEN = "8724041a-c3b4-4683-b309-8e08591552e2";
const TWITCH_CLIENT_ID = process.env.gq5rg8kg7xe6d941t7rigjsz9qb1c2;
const TWITCH_CLIENT_SECRET = process.env.dem6uszeu98gnaqbbix2gdlaci1hgy;
const TWITCH_USER = process.env.McHobi74 || "McHobi74";
let TWITCH_ACCESS_TOKEN = "";

// === Speicher ===
let activityFeed = [];

// === Hilfsfunktionen ===
async function getTwitchToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  TWITCH_ACCESS_TOKEN = data.access_token;
  console.log("🔑 Twitch Token erneuert.");
}

// === Twitch-Webhook ===
app.post("/twitch", async (req, res) => {
  try {
    const type = req.body.subscription?.type || req.body.type;
    const e = req.body.event || {};
    let color = "#7c3aed", icon = "🎉", title = type;
    let message = "";

    if (type.includes("follow")) { color="#00ffcc"; icon="💚"; title="Follow"; }
    if (type.includes("subscribe")) {
      const tierMap = { "1000": "Tier 1", "2000": "Tier 2", "3000": "Tier 3" };
      const tier = tierMap[e.tier] || "Tier ?";
      if (type.includes("gift")) {
        color="#eab308"; icon="🎁"; title="Sub Gift";
        message = `${e.user_name} verschenkte ${e.total ?? 1} Subs (${tier})`;
      } else {
        color="#eab308"; icon="⭐"; title="Sub";
        message = `${e.user_name} (${tier})`;
      }
    }
    if (type.includes("cheer")) {
      color="#ff9800"; icon="💎"; title="Bits";
      message = `${e.user_name} cheerte ${e.bits} Bits – „${e.message ?? ""}“`;
    }
    if (type.includes("channel.channel_points_custom_reward_redemption")) {
      color="#ff66cc"; icon="🎯"; title="Channel Points";
      message = `${e.user_name}: ${e.reward?.title ?? ""}`;
    }

    activityFeed.unshift({
      type: title,
      donor: e.user_name || e.user_login || "Unbekannt",
      amount: "",
      currency: "",
      message,
      color,
      icon,
      time: new Date().toLocaleString("de-DE"),
    });
    if (activityFeed.length > 100) activityFeed.pop();

    console.log(`💜 Twitch ${title}: ${message}`);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Twitch Fehler:", err);
    res.sendStatus(500);
  }
});


// === Twitch-Callback-Verifizierung ===
app.get("/twitch/callback", (req, res) => {
  res.send("✅ Twitch EventSub Callback bestätigt.");
});

// === Ko-fi-Webhook ===
app.post("/kofi", (req, res) => {
  try {
    let data = req.body;
    if (typeof data.data === "string") data = JSON.parse(data.data);
    const token = data.verification_token || req.body.verification_token;
    if (token !== KOFI_TOKEN) console.warn("⚠️ Ungültiger Token:", token);

    if (data.type === "Donation") {
      const donor = data.from_name || "Unbekannt";
      const amount = data.amount || "0";
      const currency = data.currency || "";
      const message = data.message || "";

      activityFeed.unshift({
        type: "Ko-fi Donation", donor, amount, currency,
        message, color: "#58a6ff", icon: "☕",
        time: new Date().toLocaleString("de-DE")
      });
      if (activityFeed.length > 100) activityFeed.pop();
      console.log(`☕ Ko-fi Donation: ${donor} ${amount} ${currency} (${message})`);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Ko-fi Fehler:", err);
    res.sendStatus(500);
  }
});

// === Feed-Seite ===
app.get("/feed", (req, res) => {
  const html = `
  <html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10">
  <title>Soundwave / McHobi74 Feed</title>
  <style>
    body{background:#0d1117;color:#e6edf3;font-family:'Segoe UI',sans-serif;margin:20px;}
    h1{color:#58a6ff;}
    .entry{margin-bottom:15px;padding:15px;border-radius:8px;background:#161b22;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);}
    .time{color:#8b949e;font-size:0.85em;margin-bottom:5px;}
  </style></head><body>
  <h1>🩵 Soundwave / McHobi74 Activity Feed</h1>
  ${
    activityFeed.length
      ? activityFeed.map(e=>`
        <div class="entry" style="border-left:5px solid ${e.color};">
          <div class="time">${e.time}</div>
          <div>${e.icon} <b>${e.type}</b> — <b>${e.donor}</b> ${e.amount?("→ "+e.amount+" "+(e.currency||"")):""}</div>
          <div>${e.message||""}</div>
        </div>`).join("")
      : "<p>Keine Einträge bisher.</p>"
  }
  </body></html>`;
  res.send(html);
});

// === Startup ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
  await getTwitchToken();
});
