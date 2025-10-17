import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 10000;

// === KONFIGURATION ===
const KOFI_VERIFICATION_TOKEN = "b1c80c22-ba70-4368-a35b-fcb517c562b6"; // dein echter Ko-fi Token
const TWITCH_SECRET = "soundwave_secret_2025"; // Twitch Eventsub Secret
const BROADCASTER_ID = "465427941"; // Deine Twitch User ID
const ACCESS_TOKEN = "m9i1a2as2l29winlen7ns7u06rgi7"; // dein App Access Token
const CLIENT_ID = "gg5rg8kg7xe6d94lt7rigjsz9qblc2"; // dein Twitch Client ID

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// === HEALTH CHECK (für UptimeRobot) ===
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// === KO-FI WEBHOOK ===
app.post("/kofi", (req, res) => {
  console.log("📩 Ko-fi Payload empfangen:", req.body);

  try {
    const data = JSON.parse(req.body.data || "{}");

    // Token-Prüfung
    if (data.verification_token !== KOFI_VERIFICATION_TOKEN) {
      console.log("❌ Ungültiger Ko-fi Token!");
      return res.status(403).send("Invalid token");
    }

    console.log("✅ Parsed Ko-fi data:", data);
    console.log(
      `💖 Neue Ko-fi Donation: ${data.from_name} ${data.amount} ${data.currency} – "${data.message}"`
    );
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Fehler beim Verarbeiten der Ko-fi Daten:", err);
    res.status(500).send("Server error");
  }
});

// === TWITCH EVENTSUB CALLBACK ===
app.post("/twitch", (req, res) => {
  const messageType = req.header("Twitch-Eventsub-Message-Type");

  if (messageType === "webhook_callback_verification") {
    console.log("✅ Twitch Webhook bestätigt.");
    return res.status(200).send(req.body.challenge);
  }

  if (messageType === "notification") {
    const event = req.body.event;
    console.log(`🎯 Twitch Event: ${req.body.subscription.type}`, event);

    switch (req.body.subscription.type) {
      case "channel.subscribe":
        console.log(
          `💜 Neuer Sub von ${event.user_name} (${event.tier}) – ${event.is_gift ? "Gift" : "Normal"}`
        );
        break;
      case "channel.cheer":
        console.log(`🎉 ${event.user_name} hat ${event.bits} Bits gesendet!`);
        break;
      case "channel.channel_points_custom_reward_redemption.add":
        console.log(
          `🏆 Kanalpunkte: ${event.user_name} löst "${event.reward.title}" ein – ${event.user_input || "kein Text"}`
        );
        break;
      case "channel.follow":
        console.log(`👤 Neuer Follower: ${event.user_name}`);
        break;
      case "channel.hype_train.begin":
        console.log("🚂 Hype Train gestartet!");
        break;
      default:
        console.log("📢 Anderes Event:", req.body.subscription.type);
    }

    res.status(200).end();
  } else {
    res.status(200).end();
  }
});

// === ERROR HANDLER ===
app.use((err, req, res, next) => {
  console.error("💥 Serverfehler:", err);
  res.status(500).send("Internal server error");
});

// === AUTO RECONNECT INTERVAL (gegen Render Timeouts) ===
setInterval(async () => {
  try {
    await axios.get("https://kofi-webhook-e87r.onrender.com/healthz");
    console.log("🟢 Render-Server aktiv gehalten");
  } catch (e) {
    console.log("⚠️ Render Reconnect Versuch...");
  }
}, 240000); // alle 4 Minuten

// === SERVER START ===
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
