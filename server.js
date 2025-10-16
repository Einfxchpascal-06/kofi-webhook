import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const STREAMERBOT_URL = "http://192.168.178.25:8080/ExecuteCode"; // anpassen falls nötig

// einfache Status-Seite
app.get("/", (req, res) => {
  res.send("✅ Soundwave Ko-fi Webhook läuft!");
});

// Webhook-Endpoint
app.post("/kofi", async (req, res) => {
  try {
    console.log("📩 Anfrage empfangen:", req.body);

    const data = req.body;

    if (data?.type === "Donation") {
      const donor = data.data.from_name;
      const amount = data.data.amount;
      const currency = data.data.currency;
      const message = data.data.message || "";

      console.log(`☕ Ko-fi Donation: ${donor} ${amount} ${currency} (${message})`);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server läuft auf Port ${PORT}`));
