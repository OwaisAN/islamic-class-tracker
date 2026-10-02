import { normalizeEntry } from "./logic";
import type { Entry } from "./types";

// Keeps an in-progress, unsaved session in the browser's local storage so an
// interrupted class (phone locks, tab closes, app is force-quit) doesn't lose
// what was already logged. Cleared once the entry is actually saved to Firestore.
//
// IMPORTANT: bump DRAFT_SCHEMA_VERSION whenever the Entry shape changes (a field added,
// renamed, or restructured — e.g. Qur'an homework's single-target -> { from, to } change).
// A mismatched version is discarded outright rather than patched, because a draft is
// low-stakes, short-lived, per-browser data — it's far safer to lose an in-progress,
// unsaved edit than to risk a half-repaired shape reaching a component that assumes the
// current one. (Firestore data, by contrast, is the permanent record and must always be
// handled by normalizeEntry in lib/logic.ts instead, since it can't simply be discarded.)
const DRAFT_SCHEMA_VERSION = 1;

interface StoredDraft { v: number; entry: Entry }

const key = (studentId: string, date: string) => `sctracker:draft:${studentId}:${date}`;

export function loadLocalDraft(studentId: string, date: string): Entry | null {
  try {
    const raw = localStorage.getItem(key(studentId, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (parsed.v !== DRAFT_SCHEMA_VERSION) return null; // stale shape — safer to drop than patch
    // Still normalized on top of the version check, as a second line of defense (e.g. a
    // field within an unchanged version that was nonetheless left in a partial state).
    return normalizeEntry(parsed.entry);
  } catch {
    return null; // private browsing, storage disabled, or corrupt JSON — just skip it
  }
}

export function saveLocalDraft(entry: Entry): void {
  try {
    const stored: StoredDraft = { v: DRAFT_SCHEMA_VERSION, entry };
    localStorage.setItem(key(entry.studentId, entry.date), JSON.stringify(stored));
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
