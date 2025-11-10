// Estrae i parametri dalla query string dell'URL
const params = new URLSearchParams(window.location.search);
let userId = params.get("userId") || crypto.randomUUID(); // Identificativo univoco dell'utente
let username = params.get("username") || "Guest"; // Nome utente (default: "Guest")
let channelId = params.get("channelId"); // ID del canale (opzionale)

// Variabili di stato del gioco
let words = []; // Lista delle parole da digitare
let currentIndex = 0; // Indice della parola corrente
let results = []; // Risultati delle parole digitate (true/false/null)
let timeLeft = 60; // Tempo rimanente in secondi
let timerInterval; // Riferimento al timer
let timerStarted = false; // Flag per verificare se il timer è stato avviato

// Costanti per la visualizzazione delle parole
const WORDS_PER_LINE = 10; // Numero di parole per riga
const LINES_VISIBLE = 2;   // Numero di righe visibili
const WORDS_VISIBLE = WORDS_PER_LINE * LINES_VISIBLE; // Numero totale di parole visibili

// Elementi DOM
const wordBox = document.getElementById("wordBox"); // Contenitore delle parole
const inputBox = document.getElementById("inputBox"); // Casella di input
const timerEl = document.getElementById("timer"); // Elemento per il timer
const restartButton = document.getElementById("restart-button"); // Pulsante di restart

/**
 * Avvia il gioco richiedendo le parole iniziali dal server.
 * Inizializza la lista delle parole e i risultati, quindi chiama `renderWords`.
 * Imposta il focus sulla casella di input.
 */
async function startGame() {
  const res = await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, username, channelId })
  });
  const data = await res.json();
  words = data.words; // Riceve la lista di parole dal server
  results = new Array(words.length).fill(null); // Inizializza i risultati con `null`
  renderWords(); // Renderizza le parole iniziali
  inputBox.focus(); // Imposta il focus sulla casella di input
}

/**
 * Renderizza le parole visibili nella finestra di gioco.
 * Mostra due righe di parole alla volta, evidenziando la parola corrente
 * e colorando le parole già processate come corrette o errate.
 */
function renderWords() {
  const currentLine = Math.floor(currentIndex / WORDS_PER_LINE); // Calcola la riga corrente
  const start = currentLine * WORDS_PER_LINE; // Indice iniziale delle parole visibili
  const end = Math.min(words.length, start + WORDS_VISIBLE); // Indice finale delle parole visibili

  const visibleWords = words.slice(start, end); // Estrae le parole visibili

  // Genera l'HTML per le parole visibili
  wordBox.innerHTML = visibleWords
    .map((w, i) => {
      const realIndex = start + i; // Indice reale della parola
      if (realIndex < currentIndex) {
        // Parole già processate
        return results[realIndex] === true
          ? `<span class="correct">${w}</span>` // Corrette
          : `<span class="wrong">${w}</span>`; // Errate
      } else if (realIndex === currentIndex) {
        // Parola corrente
        return `<span class="current">${w}</span>`;
      } else {
        // Parole future
        return `<span>${w}</span>`;
      }
    })
    .join(" ");
}

/**
 * Gestisce l'invio di una parola da parte dell'utente.
 * Controlla la parola con il server e aggiorna i risultati.
 * Se necessario, carica la riga successiva di parole.
 * @param {string} word - La parola digitata dall'utente.
 */
async function handleWordSubmit(word) {
  if (timeLeft <= 0) return; // Non fare nulla se il tempo è scaduto

  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, word }) // Invia la parola al server per il controllo
  });

  const data = await res.json();
  if (data.error) {
    console.error("Errore:", data.error); // Logga eventuali errori
    return;
  }

  results[currentIndex] = data.correct; // Aggiorna il risultato della parola corrente
  currentIndex++; // Passa alla parola successiva

  renderWords(); // Aggiorna la visualizzazione delle parole

  if (!data.next) endGame(); // Termina il gioco se non ci sono altre parole
}

/**
 * Avvia il timer del gioco, decrementando il tempo rimanente ogni secondo.
 * Termina il gioco quando il tempo scade.
 */
function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft--; // Decrementa il tempo rimanente
    timerEl.textContent = `${timeLeft}`; // Aggiorna il timer visibile
    if (timeLeft <= 0) endGame(); // Termina il gioco se il tempo è scaduto
  }, 1000);
}

/**
 * Termina il gioco, disabilita la casella di input e invia i risultati al server.
 * Mostra un messaggio di fine partita o un errore in caso di problemi.
 */
async function endGame() {
  clearInterval(timerInterval); // Ferma il timer
  inputBox.disabled = true; // Disabilita la casella di input
  wordBox.innerHTML = `<h2>⏳ Calcolo dei risultati...</h2>`; // Mostra un messaggio di attesa

  try {
    await fetch("/api/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }) // Invia i risultati al server
    });
    wordBox.innerHTML = `<h2>🏁 Partita terminata!</h2><p>I risultati sono stati inviati nel canale Discord.</p>`;
  } catch (err) {
    wordBox.innerHTML = `<h2>⚠️ Errore nel salvataggio dei risultati.</h2><p>Riprova più tardi.</p>`;
  }
}

/**
 * Riavvia il gioco resettando il timer, gli indici, i risultati e la casella di input.
 */
async function restartGame() {
    // Resetta il timer
    timeLeft = 60;
    timerEl.textContent = `${timeLeft}`;
    timerStarted = false;
    clearInterval(timerInterval);
    
    // Fai una nuova chiamata al backend per ottenere un nuovo set di parole
    const res = await fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, username, channelId })
    });

    const data = await res.json();
    const words = data.words; // Ottieni il nuovo set di parole

    // Resetta lo stato del gioco
    currentIndex = 0;
    results = new Array(words.length).fill(null);
    renderWords();

    // Svuota la casella di input
    inputBox.value = "";
    inputBox.disabled = false;
    inputBox.focus();
}


/**
 * Gestisce gli eventi della tastiera fisica.
 * Avvia il timer alla prima pressione di un tasto e invia la parola quando si preme la barra spaziatrice.
 */
inputBox.addEventListener("keydown", async (e) => {
  // Avvia timer alla prima pressione su desktop
  if (!timerStarted && e.key.length === 1) {
    timerStarted = true;
    startTimer();
  }

  if (e.key === " ") {
    e.preventDefault();
    const word = inputBox.value.trim();
    inputBox.value = "";
    await handleWordSubmit(word);
  }
});

/**
 * Gestisce gli eventi della tastiera virtuale.
 * Avvia il timer alla prima digitazione e invia la parola quando viene digitato uno spazio.
 */
inputBox.addEventListener("input", async () => {
  const typed = inputBox.value;

  // ⏱️ Avvia timer alla prima digitazione su mobile
  if (!timerStarted && typed.length > 0) {
    timerStarted = true;
    startTimer();
  }

  // Se l'utente ha digitato uno spazio → parola terminata
  if (typed.endsWith(" ")) {
    const word = typed.trim();
    inputBox.value = "";
    await handleWordSubmit(word);
  }
});



/**
 * Evidenzia dinamicamente la parola corrente in base alla digitazione dell'utente.
 * Cambia il colore di sfondo della parola corrente per indicare errori o corrispondenze parziali.
 */
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


//restartButton.addEventListener("click", restartGame);

// Avvia il gioco al caricamento della pagina
startGame();
