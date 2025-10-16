import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();

// Unterstützt Ko-fi's "application/x-www-form-urlencoded" UND JSON
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 🌐 IP deines Streamer.bot-PCs anpassen!
const STREAMERBOT_URL = "http://192.168.178.25:8080/ExecuteCode";

// 🔐 Dein Ko-fi Verification Token
const KOFI_TOKEN = "8724041a-c3b4-4683-b309-8e08591552e2";

// ✅ Kleine Statusseite, wenn du / im Browser öffnest
app.get("/", (req, res) => {
  res.send("✅ Soundwave Ko-fi Webhook läuft!");
});

// ☕ Webhook-Endpoint für Ko-fi
app.post("/kofi", async (req, res) => {
  try {
    // 📨 Alles anzeigen, was ankommt
    console.log("📩 Anfrage empfangen:", req.body);

    // Wenn Ko-fi "data" als String schickt → in echtes Objekt umwandeln
    let data = req.body;
    if (typeof req.body.data === "string") {
      try {
        data = JSON.parse(req.body.data);
      } catch (e) {
        console.warn("⚠️ Konnte data nicht parsen:", e);
      }
    }

    // 🔑 Token extrahieren
    const token = data.verification_token || req.body.verification_token;
    if (token !== KOFI_TOKEN) {
      console.warn("⚠️ Ungültiger Verification Token:", token);
      // Wir brechen nicht ab, nur Warnung
    }

    // 🎁 Spende verarbeiten
    if (data.type === "Donation") {
      const donor = data.from_name || "Unbekannt";
      const amount = data.amount || "0";
      const currency = data.currency || "";
      const message = data.message || "";

      console.log(`☕ Ko-fi Donation: ${donor} ${amount} ${currency} (${message})`);

      // An Streamer.bot senden
      await fetch(STREAMERBOT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: `
            import CSharpScriptHost;
            StreamerBotActions["KoFi Donation"].Execute(new Dictionary<string, string> {
              {"name", "${donor}"},
              {"amount", "${amount} ${currency}"},
              {"message", "${message.replace(/"/g, '\\"')}"}
            });
          `,
        }),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Fehler beim Verarbeiten:", err);
    res.sendStatus(500);
  }
});


// 🚀 Render-Port oder lokal (Fallback 3000)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server läuft auf Port ${PORT}`));
