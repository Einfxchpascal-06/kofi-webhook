import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// 🔧 IP-Adresse deines Streamer.bot-PCs anpassen!
const STREAMERBOT_URL = "http://192.168.178.25:8080/ExecuteCode";

app.post("/kofi", async (req, res) => {
  const data = req.body;

  if (data && data.type === "Donation") {
    const donor = data.data.from_name;
    const amount = data.data.amount;
    const currency = data.data.currency;
    const message = data.data.message || "";

    try {
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
      console.log(`☕ Ko-fi Donation: ${donor} ${amount} ${currency}`);
    } catch (err) {
      console.error("❌ Fehler beim Senden an Streamer.bot:", err);
    }
  }

  res.sendStatus(200);
});

app.listen(3000, () => {
  console.log("✅ Ko-fi Webhook Bridge läuft auf Port 3000");
});
