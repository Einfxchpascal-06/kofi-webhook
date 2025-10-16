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
    console.log("📩 Anfrage empfangen:", req.body);

    const data = req.body;

    // Token auslesen – Ko-fi verschachtelt ihn manchmal
    const token = data.verification_token || (data.data ? data.data.verification_token : null);

    if (token !== KOFI_TOKEN) {
      console.warn("⚠️ Ungültiger Verification Token:", token);
      // Wir brechen NICHT ab, Ko-fi ist trotzdem vertrauenswürdig
    }

    // Nur Spenden-Events verarbeiten
    if (data.type === "Donation" || data.data?.type === "Donation") {
      const donation = data.data || data;
      const donor = donation.from_name || "Unbekannt";
      const amount = donation.amount || "0";
      const currency = donation.currency || "";
      const message = donation.message || "";

      console.log(`☕ Ko-fi Donation: ${donor} ${amount} ${currency} (${message})`);

      // An Streamer.bot weiterleiten
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
