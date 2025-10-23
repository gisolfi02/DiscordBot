import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { WORDS } from "./words.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
console.log("🌍 BASE_URL attuale:", BASE_URL);

// ✅ connessione PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// inizializza tabella leaderboard se non esiste
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      best_wpm INT DEFAULT 0
    );
  `);
  console.log("✅ PostgreSQL pronto (tabella leaderboard).");
}
initDB().catch((err) => console.error("❌ Errore initDB:", err));

// ================== EXPRESS CONFIG ==================
app.use(express.static(path.join(__dirname, "../web")));
app.use(express.json());

// Memoria partite attive
let activeGames = new Map();

// ================== DISCORD BOT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`✅ Bot attivo come ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const user = message.author;

  // ================== !play ==================
  if (message.content.startsWith("!play")) {
    const gameUrl = `${BASE_URL}/?userId=${user.id}&username=${encodeURIComponent(
      user.username
    )}&channelId=${message.channel.id}`;
    return message.reply({
      content: `<@${user.id}>, clicca qui per iniziare la tua partita:\n👉 [Avvia Partita](${gameUrl})`,
    });
  }

  // ================== !leaderboard ==================
  if (message.content.startsWith("!leaderboard")) {
    try {
      const { rows } = await pool.query(`
        SELECT user_id, username, best_wpm
        FROM leaderboard
        ORDER BY best_wpm DESC
        LIMIT 10;
      `);

      if (rows.length === 0) {
        return message.channel.send("🏆 Nessun punteggio registrato ancora!");
      }

      const medals = ["🥇", "🥈", "🥉"];
      const fields = rows.map((p, i) => ({
        name: `${medals[i] || `#${i + 1}`}  <@${p.user_id}>`,
        value: `⚡ **${p.best_wpm} WPM**`,
        inline: true,
      }));

      const embed = new EmbedBuilder()
        .setTitle("🏆 Classifica Globale — FastFingers")
        .setDescription("Le migliori performance di tutti i giocatori!")
        .setColor(0xffd700)
        .addFields(fields)
        .setFooter({
          text: "🔥 Continua ad allenarti per salire in classifica!",
        })
        .setTimestamp();

      message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Errore lettura leaderboard:", err);
      message.channel.send("⚠️ Errore nel recupero della classifica.");
    }
  }
});

// ================== API REST ==================

// avvio partita
app.post("/api/start", (req, res) => {
  const { userId, username, channelId } = req.body;
  const words = Array.from(
    { length: 200 },
    () => WORDS[Math.floor(Math.random() * WORDS.length)]
  );
  activeGames.set(userId, {
    words,
    correct: 0,
    total: 0,
    index: 0,
    username,
    channelId,
  });
  res.json({ words });
});

// verifica parola
app.post("/api/check", (req, res) => {
  const { userId, word } = req.body;
  const game = activeGames.get(userId);
  if (!game)
    return res.status(400).json({ error: "Nessuna partita attiva" });

  const expected = game.words[game.index];
  const correct = word === expected;

  // conteggio lettere corrette/sbagliate
  let correctLetters = 0;
  let wrongLetters = 0;
  const minLen = Math.min(word.length, expected.length);
  for (let i = 0; i < minLen; i++) {
    if (word[i] === expected[i]) correctLetters++;
    else wrongLetters++;
  }
  if (word.length > expected.length)
    wrongLetters += word.length - expected.length;
  if (expected.length > word.length)
    wrongLetters += expected.length - word.length;

  game.total++;
  if (correct) game.correct++;
  game.index++;

  // aggiorna statistiche lettere
  game.lettersCorrect = (game.lettersCorrect || 0) + correctLetters;
  game.lettersWrong = (game.lettersWrong || 0) + wrongLetters;

  res.json({ correct, next: game.words[game.index] || null });
});

// ================== FINE PARTITA ==================
app.post("/api/end", async (req, res) => {
  const { userId } = req.body;
  const game = activeGames.get(userId);
  if (!game)
    return res.status(400).json({ error: "Nessuna partita attiva" });

  const accuracy = ((game.correct / game.total) * 100 || 0).toFixed(2);
  const wpm = Math.round((game.correct / 60) * 60);
  const lettersCorrect = game.lettersCorrect || 0;
  const lettersWrong = game.lettersWrong || 0;
  const keystrokes = lettersCorrect + lettersWrong;

  // ✅ salva risultato su PostgreSQL
  try {
    await pool.query(
      `
      INSERT INTO leaderboard (user_id, username, best_wpm)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        best_wpm = GREATEST(leaderboard.best_wpm, EXCLUDED.best_wpm);
    `,
      [userId, game.username, wpm]
    );
  } catch (err) {
    console.error("❌ Errore salvataggio leaderboard:", err);
  }

  // 🔹 invio embed nel canale Discord
  if (game.channelId) {
    const channel = await client.channels
      .fetch(game.channelId)
      .catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(`🏁 FastFingers — Risultato di <@${userId}>`)
        .setColor(0x00aaff)
        .addFields(
          {
            name: "🧠 Parole corrette",
            value: `${game.correct}/${game.total}`,
            inline: true,
          },
          { name: "🎯 Accuratezza", value: `${accuracy}%`, inline: true },
          { name: "⚡ WPM", value: `${wpm}`, inline: true },
          {
            name: "⌨️ Keystrokes",
            value: `(${lettersCorrect}✅ | ${lettersWrong}❌) **${keystrokes}**`,
            inline: true,
          }
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
app.get("/api/leaderboard", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT user_id, username, best_wpm
      FROM leaderboard
      ORDER BY best_wpm DESC
      LIMIT 10;
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ Errore lettura leaderboard:", err);
    res
      .status(500)
      .json({ error: "Errore nel recupero della classifica" });
  }
});

// ================== HEALTH CHECK ==================
app.get("/health", (req, res) => res.status(200).send("OK"));

// ================== AVVIO ==================
app.listen(PORT, () =>
  console.log(`🌐 Web server su http://localhost:${PORT}`)
);
client.login(process.env.TOKEN);
