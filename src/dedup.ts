import * as fs from 'fs';
import * as path from 'path';

const SEEN_PATH = path.join(__dirname, '../data/seen-opportunities.json');

export function loadSeen(): Set<string> {
  try {
    const raw = fs.readFileSync(SEEN_PATH, 'utf-8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function saveSeen(seen: Set<string>): void {
  fs.mkdirSync(path.dirname(SEEN_PATH), { recursive: true });
  fs.writeFileSync(SEEN_PATH, JSON.stringify([...seen], null, 2));
}
