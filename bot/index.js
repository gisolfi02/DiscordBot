import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { WORDS } from "./words.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EmbedBuilder } from "discord.js";


dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const leaderboardFile = path.join(__dirname, "data", "leaderboard.json");
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;


if (!fs.existsSync(path.join(__dirname, "data"))) fs.mkdirSync(path.join(__dirname, "data"));
if (!fs.existsSync(leaderboardFile)) fs.writeFileSync(leaderboardFile, "{}");

app.use(express.static(path.join(__dirname, "../web")));
app.use(express.json());

// Memoria partite attive
let activeGames = new Map();

// === Discord Bot ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once("ready", () => {
  console.log(`✅ Bot attivo come ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const user = message.author;

  // !play
  if (message.content.startsWith("!play")) {
    const gameUrl = `${BASE_URL}/?userId=${user.id}&username=${encodeURIComponent(user.username)}&channelId=${message.channel.id}`;
    return message.reply({ content: `<@${user.id}>, clicca qui per iniziare la tua partita:\n👉 [Avvia Partita](${gameUrl})` });
  }

  // !leaderboard
  if (message.content.startsWith("!leaderboard")) {
  const leaderboard = JSON.parse(fs.readFileSync(leaderboardFile));
  const sorted = Object.values(leaderboard).sort((a, b) => b.bestWPM - a.bestWPM);

  if (sorted.length === 0) {
    return message.channel.send("🏆 Nessun punteggio registrato ancora!");
  }

  const medals = ["🥇", "🥈", "🥉"];
  const fields = sorted.slice(0, 10).map((p, i) => ({
    name: `${medals[i] || `#${i + 1}`}  @${p.username}`,
    value: `⚡ **${p.bestWPM} WPM**`,
    inline: true
  }));

  const embed = new EmbedBuilder()
    .setTitle("🏆 Classifica Globale — FastFingers")
    .setDescription("Le migliori performance di tutti i giocatori!")
    .setColor(0xffd700)
    .addFields(fields)
    .setFooter({ text: "🔥 Continua ad allenarti per salire in classifica!" })
    .setTimestamp();

  message.channel.send({ embeds: [embed] });
}

});

// === API REST ===

// avvio partita
app.post("/api/start", (req, res) => {
  const { userId, username, channelId } = req.body;
  const words = Array.from({ length: 200 }, () => WORDS[Math.floor(Math.random() * WORDS.length)]);
  activeGames.set(userId, { words, correct: 0, total: 0, index: 0, username, channelId });
  res.json({ words });
});

// verifica parola
app.post("/api/check", (req, res) => {
  const { userId, word } = req.body;
  const game = activeGames.get(userId);
  if (!game) return res.status(400).json({ error: "Nessuna partita attiva" });

  const expected = game.words[game.index];
  const correct = word === expected;

  // conteggio lettere
  let correctLetters = 0;
  let wrongLetters = 0;
  const minLen = Math.min(word.length, expected.length);
  for (let i = 0; i < minLen; i++) {
    if (word[i] === expected[i]) correctLetters++;
    else wrongLetters++;
  }
  // lettere extra o mancanti
  if (word.length > expected.length) wrongLetters += word.length - expected.length;
  if (expected.length > word.length) wrongLetters += expected.length - word.length;

  game.total++;
  if (correct) game.correct++;
  game.index++;

  // aggiorna statistiche lettere
  game.lettersCorrect = (game.lettersCorrect || 0) + correctLetters;
  game.lettersWrong = (game.lettersWrong || 0) + wrongLetters;

  res.json({ correct, next: game.words[game.index] || null });
});


// fine partita
app.post("/api/end", async (req, res) => {
  const { userId } = req.body;
  const game = activeGames.get(userId);
  if (!game) return res.status(400).json({ error: "Nessuna partita attiva" });

  const accuracy = ((game.correct / game.total) * 100 || 0).toFixed(2);
  const wpm = Math.round((game.correct / 60) * 60);
  const lettersCorrect = game.lettersCorrect || 0;
  const lettersWrong = game.lettersWrong || 0;
  const keystrokes = lettersCorrect + lettersWrong;

  // salva leaderboard
  const leaderboard = JSON.parse(fs.readFileSync(leaderboardFile));
  leaderboard[userId] = leaderboard[userId] || { username: game.username, bestWPM: 0 };
  if (wpm > leaderboard[userId].bestWPM) leaderboard[userId].bestWPM = wpm;
  fs.writeFileSync(leaderboardFile, JSON.stringify(leaderboard, null, 2));

  // 🔹 invio embed nel canale Discord
  if (game.channelId) {
    const channel = await client.channels.fetch(game.channelId).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(`🏁 FastFingers — Risultato di @${game.username}`)
        .setColor(0x00aaff)
        .addFields(
          { name: "🧠 Parole corrette", value: `${game.correct}/${game.total}`, inline: true },
          { name: "🎯 Accuratezza", value: `${accuracy}%`, inline: true },
          { name: "⚡ WPM", value: `${wpm}`, inline: true },
          { name: "⌨️ Keystrokes", value: `(${lettersCorrect}✅ | ${lettersWrong}❌) **${keystrokes}**`, inline: true }
        )
        .setFooter({ text: "🔥 Allenati per migliorare il tuo record!" })
        .setTimestamp();

      channel.send({ embeds: [embed] });
    }
  }

  activeGames.delete(userId);
  res.json({ ok: true });
});


// leaderboard via browser (solo JSON)
app.get("/api/leaderboard", (req, res) => {
  const leaderboard = JSON.parse(fs.readFileSync(leaderboardFile));
  const sorted = Object.values(leaderboard).sort((a, b) => b.bestWPM - a.bestWPM);
  res.json(sorted.slice(0, 10));
});

// avvio
app.get("/health", (req, res) => res.status(200).send("OK"));
app.listen(PORT, () => console.log(`🌐 Web server su http://localhost:${PORT}`));
client.login(process.env.TOKEN);
