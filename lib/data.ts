import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where,
} from "firebase/firestore";
import type { ClassSettings, Entry, Mode, NamedHomework, Student } from "./types";
import { DEFAULT_DUAS } from "./quran";
import { computeDuaIndex, computeSurahTrackIndex, entryId } from "./logic";

// Existing student docs predate the surahTrackIndex field.
const withDefaults = (s: Omit<Student, "id">): Omit<Student, "id"> => ({ ...s, surahTrackIndex: s.surahTrackIndex ?? 0 });

// A brief earlier version stored dua/surah homework as a plain string; normalize that
// into the current { name, custom } shape (treated as a custom entry, since we can no
// longer tell whether it came from the list).
function normalizeNamedHomework(h: unknown): NamedHomework | null {
  if (!h) return null;
  if (typeof h === "string") return { name: h, custom: true };
  return h as NamedHomework;
}

// Existing entry docs predate the surah field, the dua custom/customDua/duaNameAtEntry/homework
// fields, and the quran/textbook homework fields.
const withEntryDefaults = (e: Entry): Entry => ({
  ...e,
  quran: { ...e.quran, homework: e.quran.homework ?? null, homeworkStatus: e.quran.homeworkStatus ?? null },
  dua: {
    ...e.dua,
    custom: e.dua.custom ?? false,
    customDua: e.dua.customDua ?? null,
    duaNameAtEntry: e.dua.duaNameAtEntry ?? null,
    homework: normalizeNamedHomework(e.dua.homework),
  },
  surah: e.surah
    ? { ...e.surah, homework: normalizeNamedHomework(e.surah.homework) }
    : { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "working", homework: null },
  textbook: { ...e.textbook, homework: e.textbook.homework ?? null },
});

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

// All access goes through this module so a teacherId filter / auth can be added in one place later.

// ----- settings -----
const settingsRef = () => doc(db, "settings", "class");

export async function getSettings(): Promise<ClassSettings> {
  const snap = await getDoc(settingsRef());
  if (snap.exists()) {
    const d = snap.data() as Partial<ClassSettings>;
    return { chapter: d.chapter ?? 1, duaList: d.duaList ?? DEFAULT_DUAS };
  }
  const fresh: ClassSettings = { chapter: 1, duaList: DEFAULT_DUAS };
  await setDoc(settingsRef(), fresh);
  return fresh;
}

export async function saveSettings(patch: Partial<ClassSettings>) {
  await setDoc(settingsRef(), patch, { merge: true });
}

// ----- students -----
export async function getStudents(): Promise<Student[]> {
  const snap = await getDocs(collection(db, "students"));
  return snap.docs.map((d) => ({ id: d.id, ...withDefaults(d.data() as Omit<Student, "id">) }));
}

export async function getStudent(id: string): Promise<Student | null> {
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
  const snap = await getDocs(query(collection(db, "entries"), where("studentId", "==", studentId)));
  return snap.docs.map((d) => withEntryDefaults(d.data() as Entry));
}

/**
 * Overwrites the entry for (student, date), then re-syncs the student's duaIndex/surahTrackIndex.
 * `otherEntries` is the student's already-loaded entries (any entry for this same date is replaced,
 * not duplicated) — this avoids re-fetching everything from Firestore just to recompute the two indexes.
 */
export async function saveEntry(entry: Entry, otherEntries: Entry[], duaCount: number): Promise<Entry[]> {
  await setDoc(doc(db, "entries", entryId(entry.studentId, entry.date)), entry);
  const all = [...otherEntries.filter((e) => e.date !== entry.date), entry];
  const duaIdx = computeDuaIndex(all, duaCount);
  const surahIdx = computeSurahTrackIndex(all);
  const patch: Partial<Student> = {};
  if (duaIdx !== null) patch.duaIndex = duaIdx;
  if (surahIdx !== null) patch.surahTrackIndex = surahIdx;
  if (Object.keys(patch).length) await updateStudent(entry.studentId, patch);
  return all;
}
