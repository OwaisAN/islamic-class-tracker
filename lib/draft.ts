import type { ClassSettings, Entry, Student } from "./types.ts";
import {
  NOTHING_RECORDED, defaultDuaIndex, defaultStart, defaultSurahTrackIndex, priorEntries, priorWith,
} from "./logic.ts";

/**
 * Today's entry for a student: the saved one if it exists, otherwise a fresh draft whose
 * defaults come from their history. A fresh draft starts with nothing recorded, so a section the
 * teacher never touches is never mistaken for real data (see `Entry.recorded`).
 */
export function buildDraft(
  studentId: string,
  date: string,
  entries: Entry[],
  student: Student,
  settings: ClassSettings,
): Entry {
  const existing = entries.find((e) => e.date === date);
  if (existing) return structuredClone(existing);
  const start = defaultStart(priorWith(priorEntries(entries, date), "quran"), student.mode);
  return {
    studentId,
    date,
    recorded: { ...NOTHING_RECORDED },
    quran: { start, end: { ...start }, letters: [], issues: [], hesitation: false, note: "", homework: null, homeworkStatus: null },
    dua: {
      duaIndexAtEntry: defaultDuaIndex(entries, date, student.duaIndex, settings.duaList.length),
      duaNameAtEntry: null,
      custom: false,
      customDua: null,
      status: "working",
      homework: null,
    },
    surah: {
      trackIndexAtEntry: defaultSurahTrackIndex(entries, date, student.surahTrackIndex),
      custom: false,
      customSurah: null,
      status: "working",
      homework: null,
    },
    textbook: { status: "done", note: "", chapter: settings.chapter, homework: null },
  };
}
