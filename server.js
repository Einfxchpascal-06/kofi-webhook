import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const STREAMERBOT_URL = "http://192.168.178.25:8080/ExecuteCode";
const KOFI_TOKEN = "8724041a-c3b4-4683-b309-8e08591552e2"; // dein Token

app.get("/", (req, res) => {
  res.send("✅ Soundwave Ko-fi Webhook läuft!");
});

app.post("/kofi", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Anfrage empfangen:", data);

    // optional prüfen, ob Token übereinstimmt
    if (data.verification_token !== KOFI_TOKEN) {
      console.warn("⚠️ Ungültiger Verification Token:", data.verification_token);
      return res.sendStatus(403);
    }

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
