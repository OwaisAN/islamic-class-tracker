import type { Entry, HomeworkStatus, Mode, Position } from "./types.ts";
import { SURAHS, SURAH_TRACK, emptyPosition, issueLabel, letterName, surahTrackName } from "./quran.ts";

// ---------- dates ----------
export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export const entryId = (studentId: string, date: string) => `${studentId}_${date}`;

// ---------- entry ordering ----------
/** Entries sorted newest first. */
export function sortDesc(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Prior entries (strictly before `date`), newest first. */
export function priorEntries(entries: Entry[], date: string): Entry[] {
  return sortDesc(entries.filter((e) => e.date < date));
}

// ---------- positions ----------
/** Returns <0 if a is behind b, 0 if equal, >0 if ahead. Only meaningful for same mode. */
export function comparePos(a: Position, b: Position): number {
  if (a.mode === "qaida") {
    return (a.page ?? 0) - (b.page ?? 0) || (a.line ?? 0) - (b.line ?? 0);
  }
  return (a.surah ?? 0) - (b.surah ?? 0) || (a.ayah ?? 0) - (b.ayah ?? 0);
}

export function fmtPos(p: Position): string {
  if (p.mode === "qaida") return `Page ${p.page}, line ${p.line}`;
  const s = SURAHS[p.surah ?? 0];
  return `${s?.name ?? "?"} ${p.ayah}`;
}

/** Default starting position for a new session: prior end if same mode, else the mode's beginning. */
export function defaultStart(prior: Entry | undefined, mode: Mode): Position {
  if (prior && prior.quran.end.mode === mode) return { ...prior.quran.end };
  return emptyPosition(mode);
}

// ---------- stuck detection ----------
export function quranStuck(end: Position, prior: Entry | undefined): boolean {
  if (!prior) return false;
  if (prior.quran.end.mode !== end.mode) return false; // mode switch resets the streak
  return comparePos(end, prior.quran.end) <= 0;
}

// ---------- homework ----------
/** The homework target set at the prior session, if any and still comparable (same mode). */
export function homeworkTarget(prior: Entry | undefined, mode: Mode): Position | null {
  if (!prior || !prior.quran.homework || prior.quran.homework.mode !== mode) return null;
  return prior.quran.homework;
}

export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  completed: "Completed",
  almost: "Almost",
  not_done: "Not at all",
};

export function duaStuck(
  dua: { duaIndexAtEntry: number; custom: boolean; status: string },
  prior: Entry | undefined,
): boolean {
  if (!prior || dua.custom || prior.dua.custom) return false;
  return (
    dua.status === "working" &&
    prior.dua.status === "working" &&
    prior.dua.duaIndexAtEntry === dua.duaIndexAtEntry
  );
}

/** priors = prior entries, newest first. Falling behind if the two most recent priors were not_done. */
export function textbookBehind(priors: Entry[]): boolean {
  return priors.length >= 2 && priors[0].textbook.status === "not_done" && priors[1].textbook.status === "not_done";
}

// ---------- dua default & auto-advance ----------
// A custom dua never advances or regresses the list position; it's a one-off
// for that session and is skipped when computing defaults/streaks.
function nextDua(e: Entry, duaCount: number): number {
  const i = e.dua.status === "mastered" ? e.dua.duaIndexAtEntry + 1 : e.dua.duaIndexAtEntry;
  return Math.min(Math.max(i, 0), Math.max(duaCount - 1, 0));
}

export function defaultDuaIndex(entries: Entry[], date: string, studentDuaIndex: number, duaCount: number): number {
  const priorNonCustom = priorEntries(entries, date).find((e) => !e.dua.custom);
  if (!priorNonCustom) return Math.min(Math.max(studentDuaIndex, 0), Math.max(duaCount - 1, 0));
  return nextDua(priorNonCustom, duaCount);
}

/** Student's stored duaIndex, recomputed from the latest non-custom entry. */
export function computeDuaIndex(entries: Entry[], duaCount: number): number | null {
  const latest = sortDesc(entries).find((e) => !e.dua.custom);
  return latest ? nextDua(latest, duaCount) : null;
}

// Prefers the name snapshot taken when the entry was saved, so editing the dua
// list later doesn't relabel history (see duaNameAtEntry in types.ts). Older
// entries saved before that snapshot existed fall back to a live list lookup.
export function duaEntryName(dua: Entry["dua"], duaList: string[]): string {
  if (dua.custom) return dua.customDua ?? "?";
  return dua.duaNameAtEntry ?? duaList[dua.duaIndexAtEntry] ?? "the current dua";
}

// ---------- surah track default, stuck & auto-advance ----------
// A custom-surah entry never advances or regresses the track; it's a one-off
// for that session and is skipped when computing defaults/streaks.
function nextSurahTrack(e: Entry): number {
  const i = e.surah.status === "mastered" ? e.surah.trackIndexAtEntry + 1 : e.surah.trackIndexAtEntry;
  return Math.min(Math.max(i, 0), SURAH_TRACK.length - 1);
}

export function defaultSurahTrackIndex(entries: Entry[], date: string, studentIndex: number): number {
  const priorNonCustom = priorEntries(entries, date).find((e) => !e.surah.custom);
  if (!priorNonCustom) return Math.min(Math.max(studentIndex, 0), SURAH_TRACK.length - 1);
  return nextSurahTrack(priorNonCustom);
}

/** Student's stored surahTrackIndex, recomputed from the latest non-custom entry. */
export function computeSurahTrackIndex(entries: Entry[]): number | null {
  const latest = sortDesc(entries).find((e) => !e.surah.custom);
  return latest ? nextSurahTrack(latest) : null;
}

export function surahStuck(
  surah: { trackIndexAtEntry: number; custom: boolean; status: string },
  prior: Entry | undefined,
): boolean {
  if (!prior || surah.custom || prior.surah.custom) return false;
  return (
    surah.status === "working" &&
    prior.surah.status === "working" &&
    prior.surah.trackIndexAtEntry === surah.trackIndexAtEntry
  );
}

export function surahEntryName(surah: Entry["surah"]): string {
  return surah.custom ? SURAHS[surah.customSurah ?? 0]?.name ?? "?" : surahTrackName(surah.trackIndexAtEntry);
}

// ---------- summaries ----------
export function quranRange(e: Entry): string {
  return `${fmtPos(e.quran.start)} → ${fmtPos(e.quran.end)}`;
}

const TEXTBOOK_LABEL = { done: "Done", partial: "Partly done", not_done: "Not done" } as const;
export const textbookLabel = (s: Entry["textbook"]["status"]) => TEXTBOOK_LABEL[s];

// ---------- parent update ----------
export interface ParentBlock {
  title: string;
  tone: "good" | "attention";
  text: string;
}

// Kept short on purpose: color/tone already signals good-vs-needs-attention (✅/🟠),
// so the text only needs to state facts and call out exceptions, not restate the obvious.
export function buildParentUpdate(
  name: string,
  entry: Entry,
  prior: Entry | undefined,
  duaList: string[],
  chapter: number,
): { blocks: ParentBlock[]; plain: string } {
  const q = entry.quran;
  const moved = q.end.mode === q.start.mode ? comparePos(q.end, q.start) > 0 : true;
  const stuck = quranStuck(q.end, prior);

  const qTags: string[] = [];
  if (q.letters.length) qTags.push(`Needs: ${q.letters.map(letterName).join(", ")}`);
  if (q.issues.length) qTags.push(q.issues.map((i) => issueLabel(i)).join(", "));
  if (q.hesitation) qTags.push("Hesitant");
  if (stuck) qTags.push("No progress");
  if (q.note.trim()) qTags.push(q.note.trim());
  let qLine = moved ? `${fmtPos(q.start)} → ${fmtPos(q.end)}` : `Revised ${fmtPos(q.end)}`;
  if (qTags.length) qLine += ` · ${qTags.join(" · ")}`;
  if (q.homeworkStatus === "almost") qLine = `Nearly finished homework · ${qLine}`;
  else if (q.homeworkStatus === "not_done") qLine = `⚠️ Missed homework · ${qLine}`;
  const qAttention = qTags.length > 0 || q.homeworkStatus === "not_done" || q.homeworkStatus === "almost";

  const surahName = surahEntryName(entry.surah);
  const sStuck = surahStuck(entry.surah, prior);
  const sLine = `${surahName} — ${entry.surah.status === "mastered" ? "Mastered" : "Working"}${sStuck ? " · No progress" : ""}`;

  const duaName = duaEntryName(entry.dua, duaList);
  const dStuck = duaStuck(entry.dua, prior);
  const dLine = `${duaName} — ${entry.dua.status === "mastered" ? "Mastered" : "Working"}${dStuck ? " · No progress" : ""}`;

  const tb = entry.textbook;
  const ch = tb.chapter ?? chapter;
  let tLine = `Ch. ${ch} — ${textbookLabel(tb.status)}`;
  if (tb.note.trim()) tLine += ` · ${tb.note.trim()}`;

  const blocks: ParentBlock[] = [
    { title: "📖 Qur'an", tone: qAttention ? "attention" : "good", text: qLine },
    { title: "📗 Surah", tone: entry.surah.status === "mastered" ? "good" : "attention", text: sLine },
    { title: "🤲 Dua", tone: entry.dua.status === "mastered" ? "good" : "attention", text: dLine },
    { title: "📚 Textbook", tone: tb.status === "done" ? "good" : "attention", text: tLine },
  ];

  // All three tracks' homework in one bubble, so parents see the full to-do list at a glance.
  const hwLines: string[] = [];
  if (q.homework) hwLines.push(`Qur'an: read to ${fmtPos(q.homework)}`);
  if (entry.surah.homework) hwLines.push(`Surah: ${entry.surah.homework.name}`);
  if (entry.dua.homework) hwLines.push(`Dua: ${entry.dua.homework.name}`);
  if (tb.homework) hwLines.push(`Textbook: ${tb.homework}`);
  if (hwLines.length) blocks.push({ title: "🎯 Homework for next class", tone: "attention", text: hwLines.join("\n") });

  const plain = [
    `Assalamu alaikum! ${name}'s update from ${prettyDate(entry.date)}:`,
    "",
    ...blocks.flatMap((b) => [`${b.tone === "good" ? "✅" : "🟠"} *${b.title}*\n${b.text}`, ""]),
    "JazakAllahu khairan.",
  ].join("\n");

  return { blocks, plain };
}
