import { useSyncExternalStore } from "react";
import type { Entry } from "./types.ts";

// One shared, in-memory copy of the class's recent entries. The home tabs read it, and the student
// page writes every save into it, so a change made on either screen shows up on the other
// immediately instead of waiting for a reload. Firestore stays the source of truth: the home screen
// re-fetches into this store whenever it comes back into view.
let recent: Entry[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getRecent = () => recent;

export function setRecent(next: Entry[]) {
  recent = next;
  emit();
}

export function updateRecent(fn: (prev: Entry[]) => Entry[]) {
  recent = fn(recent);
  emit();
}

/** Adds an entry, replacing any existing one for the same student and date. */
export function upsertEntry(entry: Entry) {
  updateRecent((prev) => [...prev.filter((x) => !(x.studentId === entry.studentId && x.date === entry.date)), entry]);
}

export const useRecentEntries = () => useSyncExternalStore(subscribe, getRecent, getRecent);
