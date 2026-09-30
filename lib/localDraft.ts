import type { Entry } from "./types";

// Keeps an in-progress, unsaved session in the browser's local storage so an
// interrupted class (phone locks, tab closes, app is force-quit) doesn't lose
// what was already logged. Cleared once the entry is actually saved to Firestore.
const key = (studentId: string, date: string) => `sctracker:draft:${studentId}:${date}`;

export function loadLocalDraft(studentId: string, date: string): Entry | null {
  try {
    const raw = localStorage.getItem(key(studentId, date));
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null; // private browsing, storage disabled, or corrupt JSON — just skip it
  }
}

export function saveLocalDraft(entry: Entry): void {
  try {
    localStorage.setItem(key(entry.studentId, entry.date), JSON.stringify(entry));
  } catch {
    // storage full or unavailable — the draft just won't survive an interruption
  }
}

export function clearLocalDraft(studentId: string, date: string): void {
  try {
    localStorage.removeItem(key(studentId, date));
  } catch {
    // ignore
  }
}
