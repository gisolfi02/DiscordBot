const params = new URLSearchParams(window.location.search);
let token = params.get("token");


let words = [];
let currentIndex = 0;
let results = [];
let timeLeft = 60;
let timerInterval;
const WINDOW_SIZE = 30; // numero di parole visibili nel box

const wordBox = document.getElementById("wordBox");
const inputBox = document.getElementById("inputBox");
const timerEl = document.getElementById("timer");

async function startGame() {
  const res = await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  words = data.words;
  results = new Array(words.length).fill(null);
  renderWords();
  inputBox.focus();
  startTimer();
}

function renderWords() {
  // Mostra solo una finestra di parole
  const start = Math.max(0, currentIndex - 3); // tiene un po' di contesto
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

inputBox.addEventListener("keydown", async (e) => {
  if (e.key === " ") {
    e.preventDefault();
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

    renderWords(); // aggiorna la finestra visibile

    if (!data.next) endGame();
  }
});

function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = ` ${timeLeft}`;
    if (timeLeft <= 0) endGame();
  }, 1000);
}

async function endGame() {
  clearInterval(timerInterval);
  inputBox.disabled = true;

  await fetch("/api/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  });

  wordBox.innerHTML = `<h2>🏁 Partita terminata!</h2><p>I risultati sono stati inviati nel canale Discord.</p>`;
}

startGame();
