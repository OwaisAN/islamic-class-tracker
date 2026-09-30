export type Mode = "qaida" | "quran";
export type HomeworkStatus = "completed" | "almost" | "not_done";
// A dua/surah picked as homework: `name` is captured at assignment time (like duaNameAtEntry),
// so editing the list or the fixed track's display later never relabels an already-set homework.
export interface NamedHomework { name: string; custom: boolean }

export interface Student {
  id: string;
  name: string;
  mode: Mode;
  duaIndex: number;
  surahTrackIndex: number; // position in the fixed SURAH_TRACK list
  active: boolean;
  // teacherId?: string;  // reserved for multi-teacher support
}

export interface Position {
  mode: Mode;
  page: number | null;
  line: number | null;
  surah: number | null; // 0-indexed
  ayah: number | null;
}

export interface Entry {
  studentId: string;
  date: string; // YYYY-MM-DD
  quran: {
    start: Position;
    end: Position;
    letters: string[];
    issues: string[];
    hesitation: boolean;
    note: string;
    homework: Position | null; // target set this session, for the student to reach by next class
    // How this session's reading compared to the homework set at the PREVIOUS session.
    // null when there was no prior homework to compare against (or the mode changed since).
    homeworkStatus: HomeworkStatus | null;
  };
  dua: {
    duaIndexAtEntry: number; // index into duaList, kept even on a custom entry
    duaNameAtEntry: string | null; // name snapshot, so editing the list later doesn't relabel history
    custom: boolean;
    customDua: string | null; // free-text name, set only when custom
    status: "mastered" | "working";
    homework: NamedHomework | null; // dua to prepare for next class
  };
  surah: {
    trackIndexAtEntry: number; // index into SURAH_TRACK, kept even on a custom entry
    custom: boolean;
    customSurah: number | null; // 0-indexed surah number, set only when custom
    status: "mastered" | "working";
    homework: NamedHomework | null; // surah to practise for next class
  };
  textbook: {
    status: "done" | "partial" | "not_done";
    note: string;
    chapter?: number; // chapter the class was on when logged
    homework: string | null; // free text — what to finish before next class
  };
}

export interface ClassSettings {
  chapter: number;
  duaList: string[];
}
