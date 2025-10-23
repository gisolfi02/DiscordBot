// Ottiene userId e username dall'URL
const params = new URLSearchParams(window.location.search);
let userId = params.get("userId") || crypto.randomUUID();
let username = params.get("username") || "Guest";
let channelId = params.get("channelId");

let words = [];
let currentIndex = 0;
let results = [];
let timeLeft = 60;
let timerInterval;
let timerStarted = false; // NEW: il timer parte solo alla prima digitazione
const WINDOW_SIZE = 30; // parole visibili

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

// Rende le parole sullo schermo
function renderWords() {
  const start = Math.max(0, currentIndex - 3);
  const end = Math.min(words.length, start + WINDOW_SIZE);

  wordBox.innerHTML = words
    .slice(start, end)
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

// Gestione input tastiera
inputBox.addEventListener("keydown", async (e) => {
  if (!timerStarted && e.key.length === 1) {
    timerStarted = true;
    startTimer();
  }

  if (e.key === " ") {
    e.preventDefault();
    if (timeLeft <= 0) return;

    const word = inputBox.value.trim();
    inputBox.value = "";

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
    renderWords();

    if (!data.next) endGame();
  }
});

// NEW: evidenzia dinamicamente la parola corrente in base alla digitazione
inputBox.addEventListener("input", () => {
  const currentWord = words[currentIndex] || "";
  const typed = inputBox.value;

  const currentSpan = document.querySelector(".current");
  if (!currentSpan) return;

  // Se l'utente non ha ancora digitato nulla → sfondo grigio
  if (typed.length === 0) {
    currentSpan.classList.remove("error");
    currentSpan.style.backgroundColor = "#d3d3d3";
  } 
  // Se la parola digitata è ancora coerente con quella richiesta
  else if (currentWord.startsWith(typed)) {
    currentSpan.classList.remove("error");
    currentSpan.style.backgroundColor = "#d3d3d3";
  } 
  // Se l'utente digita in modo errato
  else {
    currentSpan.classList.add("error");
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
