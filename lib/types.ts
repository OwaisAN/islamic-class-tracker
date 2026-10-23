export type Mode = "qaida" | "quran";
export type HomeworkStatus = "completed" | "almost" | "not_done";
// A dua/surah picked as homework: `name` is captured at assignment time (like duaNameAtEntry),
// so editing the list or the fixed track's display later never relabels an already-set homework.
export interface NamedHomework { name: string; custom: boolean }
export interface QuranHomework { from: Position; to: Position }

export type Section = "quran" | "surah" | "dua" | "textbook";
// Which sections of an entry were actually recorded. Entries made from the per-section lists only
// fill in one section at a time, so the rest must not be mistaken for real data. An entry with no
// `recorded` field at all (saved before this existed) counts as fully recorded.
export type Recorded = Record<Section, boolean>;

// Sections that can split the class into teaching groups. Each section has its own groups, so a
// student can be in one group for surahs and a different one for duas.
export type GroupSection = "surah" | "dua";
export interface Group { id: string; name: string }

export interface Student {
  id: string;
  name: string;
  mode: Mode;
  duaIndex: number;
  surahTrackIndex: number; // position in the fixed SURAH_TRACK list
  active: boolean;
  groups?: Partial<Record<GroupSection, string>>; // group id per section; missing or unknown id = ungrouped
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
  recorded?: Recorded;
  quran: {
    start: Position;
    end: Position;
    letters: string[];
    issues: string[];
    hesitation: boolean;
    note: string;
    homework: QuranHomework | null; // range set this session, for the student to read by next class
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
    // null = automatic (a not-yet-complete dua is its own homework); an array, even an empty one,
    // is an explicit list chosen by the teacher.
    homework: NamedHomework[] | null;
  };
  surah: {
    trackIndexAtEntry: number; // index into SURAH_TRACK, kept even on a custom entry
    custom: boolean;
    customSurah: number | null; // 0-indexed surah number, set only when custom
    status: "mastered" | "working";
    homework: NamedHomework[] | null; // same rules as dua.homework
  };
  textbook: {
    status: "done" | "partial" | "not_done";
    note: string;
    chapter?: number; // chapter the class was on when logged
    homework: string | null; // free text — what to finish before next class
  };
}

export interface ClassSettings {
  chapter: number; // chapter the class is actively on — stamped onto today's entries
  nextChapter: number | null; // queued chapter for next class; never affects today's entries
  lastSessionDate: string | null; // YYYY-MM-DD of the most recent day settings were used for;
  // once a NEW date is seen, nextChapter (if set) is promoted into chapter automatically.
  duaList: string[];
  groups?: Partial<Record<GroupSection, Group[]>>; // the groups that exist in each section, in display order
}
