// Seleziona il bottone e aggiungi l'evento di click
const themeToggleButton = document.getElementById('theme-toggle');

// Verifica se l'utente ha già una preferenza salvata nel localStorage
const isNightMode = localStorage.getItem('night-mode') === 'true';

// Imposta il tema iniziale
if (isNightMode) {
  document.body.classList.add('night-mode');
  themeToggleButton.innerHTML = '<i class="fas fa-sun fa-2xl"></i>'; // Icona sole per modalità giorno
} else {
  themeToggleButton.innerHTML = '<i class="fas fa-moon fa-2xl"></i>'; // Icona luna per modalità notte
}

// Cambia il tema quando il bottone viene cliccato
themeToggleButton.addEventListener('click', () => {
  document.body.classList.toggle('night-mode');

  // Salva la preferenza nel localStorage per mantenerla tra i ricaricamenti
  const isNight = document.body.classList.contains('night-mode');
  localStorage.setItem('night-mode', isNight);

  // Modifica l'icona in base alla modalità attiva
  if (isNight) {
    themeToggleButton.innerHTML = '<i class="fas fa-sun fa-2xl"></i>'; // Modalità giorno
  } else {
    themeToggleButton.innerHTML = '<i class="fas fa-moon fa-2xl"></i>'; // Modalità notte
  }
});
