import type { Entry, HomeworkStatus, Mode, NamedHomework, Position, QuranHomework, Recorded, Section } from "./types.ts";
import { SURAHS, SURAH_TRACK, emptyPosition, issueLabel, letterName, surahTrackName } from "./quran.ts";

// ---------- dates ----------
export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The date `days` before `from`, as YYYY-MM-DD. */
export function daysAgoStr(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return todayStr(d);
}

export function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export const entryId = (studentId: string, date: string) => `${studentId}_${date}`;

// ---------- entry shape normalization ----------
// Applied to every Entry read from ANYWHERE (Firestore, localStorage drafts) so that an older
// shape lingering in one place (e.g. a draft cached before a field's shape changed) never slips
// past the others and reaches a component expecting the current shape.
// Dua/surah homework used to be a single item (or an even older plain string); it's now a list.
// null still means "automatic", so only an actual value is converted.
function normalizeNamedList(h: unknown): NamedHomework[] | null {
  if (h === null || h === undefined) return null;
  if (Array.isArray(h)) return h as NamedHomework[];
  if (typeof h === "string") return h ? [{ name: h, custom: true }] : null;
  return [h as NamedHomework];
}

const SECTIONS: Section[] = ["quran", "surah", "dua", "textbook"];

/** Whether `section` of this entry holds real data (entries saved before this existed are all real). */
export const isRec = (e: Entry, section: Section) => e.recorded?.[section] !== false;

/** The recorded flags with any missing ones filled in as true. */
export const fullRecorded = (e: Entry): Recorded =>
  Object.fromEntries(SECTIONS.map((sec) => [sec, isRec(e, sec)])) as Recorded;

export const NOTHING_RECORDED: Recorded = { quran: false, surah: false, dua: false, textbook: false };

function normalizeQuranHomework(h: unknown): QuranHomework | null {
  if (!h) return null;
  if (typeof h === "object" && h !== null && "from" in h && "to" in h && h.from && h.to) return h as QuranHomework;
  // Pre-range shape (a single target Position) — treat that single point as both ends.
  // Also recovers a partially-formed { from, to } (e.g. a stale draft missing one side).
  const anyH = h as Partial<QuranHomework> & Position;
  const point = (anyH.from ?? anyH.to ?? anyH) as Position;
  return { from: anyH.from ?? point, to: anyH.to ?? point };
}

export function normalizeEntry(e: Entry): Entry {
  const out: Entry = {
    ...e,
    quran: { ...e.quran, homework: normalizeQuranHomework(e.quran.homework), homeworkStatus: e.quran.homeworkStatus ?? null },
    dua: {
      ...e.dua,
      custom: e.dua.custom ?? false,
      customDua: e.dua.customDua ?? null,
      duaNameAtEntry: e.dua.duaNameAtEntry ?? null,
      homework: normalizeNamedList(e.dua.homework),
    },
    surah: e.surah
      ? { ...e.surah, homework: normalizeNamedList(e.surah.homework) }
      : { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "working", homework: null },
    textbook: { ...e.textbook, homework: e.textbook.homework ?? null },
  };
  // Firestore rejects `undefined`, so a legacy entry gets no `recorded` key at all.
  if (e.recorded) out.recorded = fullRecorded(e);
  else delete out.recorded;
  return out;
}

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

/**
 * Which sections of `draft` count as recorded, and whether anything is still unsaved compared with
 * `base` (the last saved version). A section counts once it was already recorded, has been edited,
 * or has been tapped — even if the tap matched the default — so defaults nobody touched never turn
 * into real data on the parent update.
 */
export function reviewDraft(draft: Entry, base: Entry, touched: Section[]): { recorded: Recorded; dirty: boolean } {
  const changed = (sec: Section) => JSON.stringify(draft[sec]) !== JSON.stringify(base[sec]);
  const recorded = Object.fromEntries(
    SECTIONS.map((sec) => [sec, isRec(base, sec) || touched.includes(sec) || changed(sec)]),
  ) as Recorded;
  const dirty = SECTIONS.some((sec) => changed(sec) || (touched.includes(sec) && !isRec(base, sec)));
  return { recorded, dirty };
}

/** The most recent prior entry in which `section` was actually recorded. */
export function priorWith(priors: Entry[], section: Section): Entry | undefined {
  return priors.find((e) => isRec(e, section));
}

/** "Qaida" or "Qur'an" — whichever track a student is actually on, used anywhere the section is labeled. */
export const trackLabel = (mode: Mode) => (mode === "qaida" ? "Qaida" : "Qur'an");

/** The displayed status word — "Complete" reads better to parents than the internal "mastered" value. */
export const statusLabel = (status: "mastered" | "working") => (status === "mastered" ? "Complete" : "Working");

// ---------- stuck detection ----------
export function quranStuck(end: Position, prior: Entry | undefined): boolean {
  if (!prior) return false;
  if (prior.quran.end.mode !== end.mode) return false; // mode switch resets the streak
  return comparePos(end, prior.quran.end) <= 0;
}

// ---------- homework ----------
/** The homework range set at the prior session, if any and still comparable (same mode). */
export function homeworkRange(prior: Entry | undefined, mode: Mode): QuranHomework | null {
  const hw = prior?.quran.homework;
  if (!hw || hw.to.mode !== mode) return null;
  return hw;
}

export const fmtRange = (r: QuranHomework) => `${fmtPos(r.from)} → ${fmtPos(r.to)}`;

export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  completed: "Complete",
  almost: "Partial",
  not_done: "Incomplete",
};

/**
 * Where a student is taken to have ended, when only "did they finish last homework?" is recorded:
 * complete = they reached its end; incomplete = they made no progress; partial = they stopped
 * wherever the teacher set the next homework to start (the From picker), else no progress.
 */
export function deriveQuranEnd(
  status: HomeworkStatus | null,
  start: Position,
  prevRange: QuranHomework | null,
  nextHomework: QuranHomework | null,
): Position {
  if (status === "completed" && prevRange) return { ...prevRange.to };
  if (status === "almost" && nextHomework) return { ...nextHomework.from };
  return { ...start };
}

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
export function textbookBehind(allPriors: Entry[]): boolean {
  const priors = allPriors.filter((e) => isRec(e, "textbook"));
  return priors.length >= 2 && priors[0].textbook.status === "not_done" && priors[1].textbook.status === "not_done";
}

// ---------- chapter rollover ----------
export interface ChapterState { chapter: number; nextChapter: number | null; lastSessionDate: string | null }

/**
 * Decides whether "Up next" should become "current" for `date`. It only promotes once a
 * genuinely NEW date is seen (never retroactively mid-session), so changing "Up next" at any
 * point during today's class can never relabel today's own entries.
 */
export function rollChapterForDate(settings: ChapterState, date: string): ChapterState {
  if (!settings.lastSessionDate || date > settings.lastSessionDate) {
    return { chapter: settings.nextChapter ?? settings.chapter, nextChapter: null, lastSessionDate: date };
  }
  return settings;
}

// ---------- dua default & auto-advance ----------
// A custom dua never advances or regresses the list position; it's a one-off
// for that session and is skipped when computing defaults/streaks.
function nextDua(e: Entry, duaCount: number): number {
  const i = e.dua.status === "mastered" ? e.dua.duaIndexAtEntry + 1 : e.dua.duaIndexAtEntry;
  return Math.min(Math.max(i, 0), Math.max(duaCount - 1, 0));
}

export function defaultDuaIndex(entries: Entry[], date: string, studentDuaIndex: number, duaCount: number): number {
  const priorNonCustom = priorEntries(entries, date).find((e) => !e.dua.custom && isRec(e, "dua"));
  if (!priorNonCustom) return Math.min(Math.max(studentDuaIndex, 0), Math.max(duaCount - 1, 0));
  return nextDua(priorNonCustom, duaCount);
}

/** Student's stored duaIndex, recomputed from the latest non-custom entry. */
export function computeDuaIndex(entries: Entry[], duaCount: number): number | null {
  const latest = sortDesc(entries).find((e) => !e.dua.custom && isRec(e, "dua"));
  return latest ? nextDua(latest, duaCount) : null;
}

// Prefers the name snapshot taken when the entry was saved, so editing the dua
// list later doesn't relabel history (see duaNameAtEntry in types.ts). Older
// entries saved before that snapshot existed fall back to a live list lookup.
export function duaEntryName(dua: Entry["dua"], duaList: string[]): string {
  if (dua.custom) return dua.customDua ?? "?";
  return dua.duaNameAtEntry ?? duaList[dua.duaIndexAtEntry] ?? "the current dua";
}

/**
 * The dua homework for this session. An explicit list (even an empty one) always wins; with no
 * list set, a dua that isn't complete yet is its own homework — "still working on it" IS the
 * homework by default. An unrecorded dua has no homework at all.
 */
export function effectiveDuaHomework(entry: Entry, duaList: string[]): NamedHomework[] {
  if (!isRec(entry, "dua")) return [];
  const { dua } = entry;
  if (dua.homework) return dua.homework;
  if (dua.status === "working") return [{ name: duaEntryName(dua, duaList), custom: dua.custom }];
  return [];
}

// ---------- surah track default, stuck & auto-advance ----------
// A custom-surah entry never advances or regresses the track; it's a one-off
// for that session and is skipped when computing defaults/streaks.
function nextSurahTrack(e: Entry): number {
  const i = e.surah.status === "mastered" ? e.surah.trackIndexAtEntry + 1 : e.surah.trackIndexAtEntry;
  return Math.min(Math.max(i, 0), SURAH_TRACK.length - 1);
}

export function defaultSurahTrackIndex(entries: Entry[], date: string, studentIndex: number): number {
  const priorNonCustom = priorEntries(entries, date).find((e) => !e.surah.custom && isRec(e, "surah"));
  if (!priorNonCustom) return Math.min(Math.max(studentIndex, 0), SURAH_TRACK.length - 1);
  return nextSurahTrack(priorNonCustom);
}

/** Student's stored surahTrackIndex, recomputed from the latest non-custom entry. */
export function computeSurahTrackIndex(entries: Entry[]): number | null {
  const latest = sortDesc(entries).find((e) => !e.surah.custom && isRec(e, "surah"));
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

/** Same idea as effectiveDuaHomework: a not-yet-complete surah IS its own homework by default. */
export function effectiveSurahHomework(entry: Entry): NamedHomework[] {
  if (!isRec(entry, "surah")) return [];
  const { surah } = entry;
  if (surah.homework) return surah.homework;
  if (surah.status === "working") return [{ name: surahEntryName(surah), custom: surah.custom }];
  return [];
}

// ---------- summaries ----------
export function quranRange(e: Entry): string {
  return `${fmtPos(e.quran.start)} → ${fmtPos(e.quran.end)}`;
}

const TEXTBOOK_LABEL = { done: "Complete", partial: "Partial", not_done: "Incomplete" } as const;
export const textbookLabel = (s: Entry["textbook"]["status"]) => TEXTBOOK_LABEL[s];

// ---------- parent update ----------
export type BlockKind = "quran" | "surah" | "dua" | "textbook" | "homework";

export interface ParentBlock {
  kind: BlockKind;
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
  nextChapter: number | null = null,
): { blocks: ParentBlock[]; plain: string } {
  const q = entry.quran;
  const rec = fullRecorded(entry);
  const track = trackLabel(q.end.mode);
  const blocks: ParentBlock[] = [];
  const hwLines: string[] = [];

  if (rec.quran) {
    const pq = prior && isRec(prior, "quran") ? prior : undefined;
    const moved = q.end.mode === q.start.mode ? comparePos(q.end, q.start) > 0 : true;
    const stuck = quranStuck(q.end, pq);
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
    blocks.push({ kind: "quran", title: `📖 ${track}`, tone: qAttention ? "attention" : "good", text: qLine });
    if (q.homework) hwLines.push(`${track}: read from ${fmtPos(q.homework.from)} to ${fmtPos(q.homework.to)}`);
  }

  if (rec.surah) {
    const ps = prior && isRec(prior, "surah") ? prior : undefined;
    const sStuck = surahStuck(entry.surah, ps);
    const sLine = `${surahEntryName(entry.surah)} — ${statusLabel(entry.surah.status)}${sStuck ? " · No progress" : ""}`;
    blocks.push({ kind: "surah", title: "🌙 Surah", tone: entry.surah.status === "mastered" ? "good" : "attention", text: sLine });
    const surahHw = effectiveSurahHomework(entry);
    if (surahHw.length) hwLines.push(`Surah: ${surahHw.map((h) => h.name).join(", ")}`);
  }

  if (rec.dua) {
    const pd = prior && isRec(prior, "dua") ? prior : undefined;
    const dStuck = duaStuck(entry.dua, pd);
    const dLine = `${duaEntryName(entry.dua, duaList)} — ${statusLabel(entry.dua.status)}${dStuck ? " · No progress" : ""}`;
    blocks.push({ kind: "dua", title: "🤲 Dua", tone: entry.dua.status === "mastered" ? "good" : "attention", text: dLine });
    const duaHw = effectiveDuaHomework(entry, duaList);
    if (duaHw.length) hwLines.push(`Dua: ${duaHw.map((h) => h.name).join(", ")}`);
  }

  if (rec.textbook) {
    const tb = entry.textbook;
    let tLine = `Ch. ${tb.chapter ?? chapter} — ${textbookLabel(tb.status)}`;
    if (tb.note.trim()) tLine += ` · ${tb.note.trim()}`;
    blocks.push({ kind: "textbook", title: "📝 Textbook", tone: tb.status === "done" ? "good" : "attention", text: tLine });
    // The chapter move is classwide and applies no matter whether this student finished today's
    // chapter — it's about what's next, not a reward for completion. A per-student note (if any)
    // rides alongside it.
    const tbHwParts: string[] = [];
    if (nextChapter !== null) tbHwParts.push(`Move to Chapter ${nextChapter}`);
    if (tb.homework) tbHwParts.push(tb.homework);
    if (tbHwParts.length) hwLines.push(`Textbook: ${tbHwParts.join(" · ")}`);
  }

  // All the tracks' homework in one bubble, so parents see the full to-do list at a glance.
  if (hwLines.length) blocks.push({ kind: "homework", title: "🌟 Homework for next class", tone: "attention", text: hwLines.join("\n") });

  const plain = [
    `Assalamu alaikum! ${name}'s update from ${prettyDate(entry.date)}:`,
    "",
    ...blocks.flatMap((b) => [`${b.tone === "good" ? "✅" : "🟠"} *${b.title}*\n${b.text}`, ""]),
    "JazakAllahu khairan.",
  ].join("\n");

  return { blocks, plain };
}
