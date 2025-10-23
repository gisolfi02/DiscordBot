import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Legge parole dal file di testo
const filePath = path.join(__dirname, "parole.txt");
const content = fs.readFileSync(filePath, "utf8");

// Divide le parole per riga e pulisce eventuali spazi vuoti
export const WORDS = content
  .split(/\r?\n/)
  .map(w => w.trim())
  .filter(w => w.length > 0);
