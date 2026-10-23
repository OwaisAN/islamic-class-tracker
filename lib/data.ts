import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, waitForPendingWrites, where,
} from "firebase/firestore";
import type { ClassSettings, Entry, Mode, Student } from "./types";
import { DEFAULT_DUAS } from "./quran";
import { computeDuaIndex, computeSurahTrackIndex, entryId, normalizeEntry, rollChapterForDate, todayStr } from "./logic";

// Existing student docs predate the surahTrackIndex field.
const withDefaults = (s: Omit<Student, "id">): Omit<Student, "id"> => ({ ...s, surahTrackIndex: s.surahTrackIndex ?? 0 });

const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
const db = getFirestore(app);

/**
 * Reads wait (briefly) for this device's own unsent saves to reach the server first. Without that, a
 * screen that loads right after a save can fetch the old data and show it as if nothing changed. The
 * wait is capped so a bad connection can never leave a screen stuck on "Loading…".
 */
async function afterOwnWrites() {
  await Promise.race([waitForPendingWrites(db).catch(() => undefined), new Promise((r) => setTimeout(r, 3000))]);
}

// All access goes through this module so a teacherId filter / auth can be added in one place later.

// ----- settings -----
const settingsRef = () => doc(db, "settings", "class");

/**
 * Reads settings, then rolls "Up next" into "current" if a new day has started since the last
 * time this was called (see rollChapterForDate) — so just opening the app for the day is enough
 * to start the new chapter, with no risk of a mid-class edit relabeling today's own entries.
 */
export async function getSettings(): Promise<ClassSettings> {
  const snap = await getDoc(settingsRef());
  const base: ClassSettings = snap.exists()
    ? {
        chapter: 1, nextChapter: null, lastSessionDate: null, duaList: DEFAULT_DUAS,
        ...(snap.data() as Partial<ClassSettings>),
      }
    : { chapter: 1, nextChapter: null, lastSessionDate: null, duaList: DEFAULT_DUAS };
  if (!snap.exists()) await setDoc(settingsRef(), base);

  const rolled = rollChapterForDate(base, todayStr());
  if (rolled !== base) {
    await saveSettings(rolled);
    return { ...base, ...rolled };
  }
  return base;
}

export async function saveSettings(patch: Partial<ClassSettings>) {
  await setDoc(settingsRef(), patch, { merge: true });
}

// ----- students -----
export async function getStudents(): Promise<Student[]> {
  await afterOwnWrites();
  const snap = await getDocs(collection(db, "students"));
  return snap.docs.map((d) => ({ id: d.id, ...withDefaults(d.data() as Omit<Student, "id">) }));
}

export async function getStudent(id: string): Promise<Student | null> {
  await afterOwnWrites();
  const snap = await getDoc(doc(db, "students", id));
  return snap.exists() ? { id: snap.id, ...withDefaults(snap.data() as Omit<Student, "id">) } : null;
}

export async function addStudent(name: string, mode: Mode) {
  const ref = doc(collection(db, "students"));
  await setDoc(ref, { name: name.trim(), mode, duaIndex: 0, surahTrackIndex: 0, active: true });
  return ref.id;
}

export async function updateStudent(id: string, patch: Partial<Omit<Student, "id">>) {
  await updateDoc(doc(db, "students", id), patch);
}

// ----- entries -----
export async function getEntries(studentId: string): Promise<Entry[]> {
  await afterOwnWrites();
  const snap = await getDocs(query(collection(db, "entries"), where("studentId", "==", studentId)));
  return snap.docs.map((d) => normalizeEntry(d.data() as Entry));
}

/**
 * Every student's entries from `sinceDate` on, in one query — enough history for the per-section
 * lists to show each student's last homework without reading the whole collection.
 */
export async function getRecentEntries(sinceDate: string): Promise<Entry[]> {
  await afterOwnWrites();
  const snap = await getDocs(query(collection(db, "entries"), where("date", ">=", sinceDate)));
  return snap.docs.map((d) => normalizeEntry(d.data() as Entry));
}

/**
 * Overwrites the entry for (student, date), then re-syncs the student's duaIndex/surahTrackIndex.
 * `otherEntries` is the student's already-loaded entries (any entry for this same date is replaced,
 * not duplicated) — this avoids re-fetching everything from Firestore just to recompute the two indexes.
 * The entry is normalized before writing, too, so a stale draft never persists a broken shape.
 */
export async function saveEntry(entry: Entry, otherEntries: Entry[], duaCount: number): Promise<Entry[]> {
  const normalized = normalizeEntry(entry);
  await setDoc(doc(db, "entries", entryId(normalized.studentId, normalized.date)), normalized);
  const all = [...otherEntries.filter((e) => e.date !== normalized.date), normalized];
  const duaIdx = computeDuaIndex(all, duaCount);
  const surahIdx = computeSurahTrackIndex(all);
  const patch: Partial<Student> = {};
  if (duaIdx !== null) patch.duaIndex = duaIdx;
  if (surahIdx !== null) patch.surahTrackIndex = surahIdx;
  if (Object.keys(patch).length) await updateStudent(entry.studentId, patch);
  return all;
}
