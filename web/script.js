const params = new URLSearchParams(window.location.search);
let userId = params.get("userId") || crypto.randomUUID();
let username = params.get("username") || "Guest";
let channelId = params.get("channelId");

let words = [];
let currentIndex = 0;
let results = [];
let timeLeft = 60;
let timerInterval;
let timerStarted = false;

const WORDS_PER_LINE = 10; // parole per riga (puoi adattarlo)
const LINES_VISIBLE = 2;   // numero di righe visibili
const WORDS_VISIBLE = WORDS_PER_LINE * LINES_VISIBLE;

const wordBox = document.getElementById("wordBox");
const inputBox = document.getElementById("inputBox");
const timerEl = document.getElementById("timer");

async function startGame() {
  const res = await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, username, channelId })
  });
  const data = await res.json();
  words = data.words;
  results = new Array(words.length).fill(null);
  renderWords();
  inputBox.focus();
}

// Funzione per renderizzare 2 righe di parole alla volta
function renderWords() {
  const currentLine = Math.floor(currentIndex / WORDS_PER_LINE);
  const start = currentLine * WORDS_PER_LINE;
  const end = Math.min(words.length, start + WORDS_VISIBLE);

  const visibleWords = words.slice(start, end);

  wordBox.innerHTML = visibleWords
    .map((w, i) => {
      const realIndex = start + i;
      if (realIndex < currentIndex) {
        return results[realIndex] === true
          ? `<span class="correct">${w}</span>`
          : `<span class="wrong">${w}</span>`;
      } else if (realIndex === currentIndex) {
        return `<span class="current">${w}</span>`;
      } else {
        return `<span>${w}</span>`;
      }
    })
    .join(" ");
}

// Funzione che processa una parola terminata
async function handleWordSubmit(word) {
  if (timeLeft <= 0) return;

  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, word })
  });

  const data = await res.json();
  if (data.error) {
    console.error("Errore:", data.error);
    return;
  }

  results[currentIndex] = data.correct;
  currentIndex++;

  // Se si supera una riga, carica la successiva
  const currentLine = Math.floor(currentIndex / WORDS_PER_LINE);
  const previousLine = Math.floor((currentIndex - 1) / WORDS_PER_LINE);
  renderWords();
  if (!data.next) endGame();
}

// ✅ Gestione tastiera fisica (desktop)
inputBox.addEventListener("keydown", async (e) => {
  if (!timerStarted && e.key.length === 1) {
    timerStarted = true;
    startTimer();
  }

  if (e.key === " ") {
    e.preventDefault(); // evita spazi multipli
    const word = inputBox.value.trim();
    inputBox.value = "";
    await handleWordSubmit(word);
  }
});

// ✅ Gestione tastiera mobile (input event)
inputBox.addEventListener("input", async () => {
  const typed = inputBox.value;

  // Se la parola termina con uno spazio → considerala inviata
  if (typed.endsWith(" ")) {
    const word = typed.trim();
    inputBox.value = "";
    await handleWordSubmit(word);
  }
});


// NEW: evidenzia dinamicamente la parola corrente in base alla digitazione
inputBox.addEventListener("input", () => {
  const currentWord = words[currentIndex] || "";
  const typed = inputBox.value;

  const currentSpan = document.querySelector(".current");
  if (!currentSpan) return;

  if (typed.length === 0) {
    currentSpan.style.color = ""; // colore predefinito
  } else if (currentWord.startsWith(typed)) {
    currentSpan.style.backgroundColor = ""; // parziale corretto
  } else {
    currentSpan.style.backgroundColor = "#ef4444"; // errore nella digitazione
  }
});

function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `${timeLeft}`;
    if (timeLeft <= 0) endGame();
  }, 1000);
}

async function endGame() {
  clearInterval(timerInterval);
  inputBox.disabled = true;
  wordBox.innerHTML = `<h2>⏳ Calcolo dei risultati...</h2>`;

  try {
    await fetch("/api/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    wordBox.innerHTML = `<h2>🏁 Partita terminata!</h2><p>I risultati sono stati inviati nel canale Discord.</p>`;
  } catch (err) {
    wordBox.innerHTML = `<h2>⚠️ Errore nel salvataggio dei risultati.</h2><p>Riprova più tardi.</p>`;
  }
}

startGame();
