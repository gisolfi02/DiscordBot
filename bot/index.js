// Importazione dei moduli necessari
import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { WORDS } from "./words.js"; // Lista di parole
import dotenv from "dotenv"; // Per gestire le variabili d'ambiente
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb"; // Per connettersi a MongoDB

// Configurazione delle variabili d'ambiente
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configurazione di Express e variabili globali
const app = express();
const PORT = process.env.PORT || 3000; // Porta del server
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`; // URL base per il gioco
console.log("BASE_URL attuale:", BASE_URL);

//Connessione a MongoDB Atlas
const mongoClient = new MongoClient(process.env.MONGODB_URI); // Connessione al database
let leaderboardCollection; // Riferimento alla collezione "leaderboard"

/**
 * Inizializza la connessione a MongoDB e imposta la collezione "leaderboard".
 */
async function initMongo() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db("fastfingers"); // Nome del database
    leaderboardCollection = db.collection("leaderboard"); // Collezione per la classifica
    console.log("MongoDB Atlas connesso e pronto!");
  } catch (err) {
    console.error("Errore connessione MongoDB:", err);
  }
}
initMongo();

// ================== EXPRESS CONFIG ==================
// Configura la cartella statica e il middleware per il parsing JSON
app.use(express.static(path.join(__dirname, "../web")));
app.use(express.json());

// Memoria per le partite attive
let activeGames = new Map(); // Mappa che associa userId ai dati di gioco

// ================== DISCORD BOT ==================
// Configurazione del bot Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Per gestire i server
    GatewayIntentBits.GuildMessages, // Per gestire i messaggi
    GatewayIntentBits.MessageContent, // Per leggere il contenuto dei messaggi
  ],
});

// Evento: il bot è pronto
client.once("ready", () => {
  console.log(`Bot attivo come ${client.user.tag}`);
});

// Evento: gestione dei messaggi
client.on("messageCreate", async (message) => {
  if (message.author.bot) return; // Ignora i messaggi dei bot
  const user = message.author;

  // ================== !play ==================
  if (message.content.startsWith("!play")) {
    // Genera un link per iniziare una partita
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
      // Recupera i migliori 10 giocatori dalla classifica
      const topPlayers = await leaderboardCollection
        .find({})
        .sort({ best_wpm: -1 }) // Ordina per WPM decrescente
        .limit(10)
        .toArray();

      if (topPlayers.length === 0) {
        return message.channel.send("🏆 Nessun punteggio registrato ancora!");
      }

      // Crea i campi per l'embed della classifica
      const medals = ["🥇", "🥈", "🥉"];
      const fields = topPlayers.map((p, i) => ({
        name: `${medals[i] || `#${i + 1}`}  @${p.username}`,
        value: `⚡ **${p.best_wpm} WPM**`,
        inline: true,
      }));

      // Crea e invia l'embed della classifica
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
      console.error("Errore lettura leaderboard:", err);
      message.channel.send("Errore nel recupero della classifica.");
    }
  }
});

// ================== API REST ==================

// Funzione per generare una parola (favorendo quelle corte)
function generateWord() {
  // Pesi per le categorie di parole
  const weightShort = 0.6; // 60% probabilità per parole corte
  const weightMedium = 0.3; // 30% probabilità per parole medie
  const weightLong = 0.1; // 10% probabilità per parole lunghe

  // Scegli un numero casuale tra 0 e 1 per determinare quale categoria di parole scegliere
  const rand = Math.random();

  let chosenCategory;
  if (rand < weightShort) {
    chosenCategory = WORDS.filter(word => word.length <= 4); // Parole corte
  } else if (rand < weightShort + weightMedium) {
    chosenCategory = WORDS.filter(word => word.length >= 5 && word.length <= 7); // Parole medie
  } else {
    chosenCategory = WORDS.filter(word => word.length >= 8); // Parole lunghe
  }

  // Seleziona una parola a caso dalla categoria scelta
  const randomIndex = Math.floor(Math.random() * chosenCategory.length);
  return chosenCategory[randomIndex];
}

// Avvio partita
app.post("/api/start", (req, res) => {
  const { userId, username, channelId } = req.body;

  // Genera 200 parole usando la nuova distribuzione
  const words = Array.from({ length: 200 }, () => generateWord());

  activeGames.set(userId, {
    words,
    correct: 0,
    total: 0,
    index: 0,
    username,
    channelId,
  });

  res.json({ words }); // Restituisce le parole al client
});


// Verifica parola
app.post("/api/check", (req, res) => {
  const { userId, word } = req.body;
  const game = activeGames.get(userId);
  if (!game)
    return res.status(400).json({ error: "Nessuna partita attiva" });

  const expected = game.words[game.index]; // Parola attesa
  const correct = word === expected; // Verifica se la parola è corretta

  // Conteggio lettere corrette/sbagliate
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

  // Aggiorna statistiche lettere
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

  const accuracy = ((game.correct / game.total) * 100 || 0).toFixed(2); // Accuratezza
  const wpm = Math.round((game.correct / 60) * 60); // Parole per minuto
  const lettersCorrect = game.lettersCorrect || 0;
  const lettersWrong = game.lettersWrong || 0;
  const keystrokes = lettersCorrect + lettersWrong;

  // Salva o aggiorna il record su MongoDB
  try {
    await leaderboardCollection.updateOne(
      { user_id: userId },
      {
        $set: { username: game.username },
        $max: { best_wpm: wpm },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("Errore salvataggio leaderboard:", err);
  }

  // 🔹 Invio embed nel canale Discord
  if (game.channelId) {
    const channel = await client.channels
      .fetch(game.channelId)
      .catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(`🏁 FastFingers — Risultato di @${game.username}`)
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

  activeGames.delete(userId); // Rimuove la partita dalla memoria
  res.json({ ok: true });
});

// Leaderboard via browser (solo JSON)
app.get("/api/leaderboard", async (req, res) => {
  try {
    const data = await leaderboardCollection
      .find({})
      .sort({ best_wpm: -1 })
      .limit(10)
      .toArray();
    res.json(data);
  } catch (err) {
    console.error("Errore lettura leaderboard:", err);
    res.status(500).json({ error: "Errore nel recupero della classifica" });
  }
});

// ================== HEALTH CHECK ==================
app.get("/health", (req, res) => res.status(200).send("OK")); // Endpoint per verificare lo stato del server

// ================== AVVIO ==================
app.listen(PORT, () =>
  console.log(`Web server su http://localhost:${PORT}`)
);
client.login(process.env.TOKEN); // Login del bot Discord
