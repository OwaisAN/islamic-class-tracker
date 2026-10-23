import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePos, quranStuck, duaStuck, duaEntryName, effectiveDuaHomework, effectiveSurahHomework, surahStuck,
  textbookBehind, computeDuaIndex, computeSurahTrackIndex, defaultDuaIndex, defaultStart, defaultSurahTrackIndex,
  homeworkRange, fmtRange, rollChapterForDate, buildParentUpdate, normalizeEntry, statusLabel, trackLabel,
  isRec, fullRecorded, priorWith, deriveQuranEnd, HOMEWORK_STATUS_LABEL, textbookLabel, daysAgoStr, reviewDraft,
} from "./logic.ts";
import { SURAHS, SURAH_TRACK } from "./quran.ts";
import { buildDraft } from "./draft.ts";
import { getRecent, setRecent, updateRecent, upsertEntry } from "./store.ts";
import type { Entry, Position } from "./types.ts";

const q = (surah: number, ayah: number): Position => ({ mode: "quran", page: null, line: null, surah, ayah });
const qa = (page: number, line: number): Position => ({ mode: "qaida", page, line, surah: null, ayah: null });
const mk = (date: string, end: Position, o: Partial<Entry> = {}): Entry => ({
  studentId: "s", date,
  quran: { start: end, end, letters: [], issues: [], hesitation: false, note: "", homework: null, homeworkStatus: null },
  dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: false, customDua: null, status: "working", homework: null },
  surah: { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "working", homework: null },
  textbook: { status: "done", note: "", homework: null },
  ...o,
});

test("surah data", () => {
  assert.equal(SURAHS.length, 114);
  assert.equal(SURAHS.reduce((a, s) => a + s.ayahs, 0), 6236);
});
test("quran stuck: equal/behind flagged, ahead not, mode switch resets", () => {
  const prior = mk("2026-01-03", q(1, 10));
  assert.ok(quranStuck(q(1, 10), prior));
  assert.ok(quranStuck(q(0, 7), prior));
  assert.ok(!quranStuck(q(1, 11), prior));
  assert.ok(!quranStuck(qa(1, 1), prior));
  assert.ok(!quranStuck(q(1, 1), undefined));
  assert.ok(comparePos(qa(2, 1), qa(1, 15)) > 0);
});
test("dua stuck, custom entries never flagged or advanced", () => {
  const prior = mk("2026-01-03", q(0, 1));
  assert.ok(duaStuck({ duaIndexAtEntry: 0, custom: false, status: "working" }, prior));
  assert.ok(!duaStuck({ duaIndexAtEntry: 1, custom: false, status: "working" }, prior));
  assert.ok(!duaStuck({ duaIndexAtEntry: 0, custom: false, status: "mastered" }, prior));
  assert.ok(!duaStuck({ duaIndexAtEntry: 0, custom: true, status: "working" }, prior));

  const masteredPrior = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 1, duaNameAtEntry: "After eating", custom: false, customDua: null, status: "mastered", homework: null } });
  const custom = mk("2026-01-08", q(0, 1), { dua: { duaIndexAtEntry: 1, duaNameAtEntry: null, custom: true, customDua: "Dua for parents", status: "mastered", homework: null } });
  assert.equal(defaultDuaIndex([masteredPrior], "2026-01-15", 0, 5), 2);
  // A custom dua session in between is skipped when picking up the next default.
  assert.equal(defaultDuaIndex([masteredPrior, custom], "2026-01-15", 0, 5), 2);
  assert.equal(computeDuaIndex([masteredPrior, custom], 5), 2);
});
test("dua name snapshot survives the list changing later; custom dua uses its own name", () => {
  const snapshotted = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 0, duaNameAtEntry: "Before eating", custom: false, customDua: null, status: "working", homework: null } });
  // The list has since changed — position 0 no longer means "Before eating" — but the snapshot wins.
  assert.equal(duaEntryName(snapshotted.dua, ["Something else", "Before eating"]), "Before eating");
  const legacy = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 1, duaNameAtEntry: null, custom: false, customDua: null, status: "working", homework: null } });
  assert.equal(duaEntryName(legacy.dua, ["Something else", "Before eating"]), "Before eating");
  const custom = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: true, customDua: "Dua for parents", status: "working", homework: null } });
  assert.equal(duaEntryName(custom.dua, ["Before eating"]), "Dua for parents");
});
test("homework range only applies when the mode still matches", () => {
  const range = { from: q(0, 1), to: q(1, 5) };
  const prior = mk("2026-01-01", q(0, 1), { quran: { start: q(0, 1), end: q(0, 1), letters: [], issues: [], hesitation: false, note: "", homework: range, homeworkStatus: null } });
  assert.deepEqual(homeworkRange(prior, "quran"), range);
  assert.equal(homeworkRange(prior, "qaida"), null);
  assert.equal(homeworkRange(undefined, "quran"), null);
  assert.equal(fmtRange(range), "Al-Fatihah 1 → Al-Baqarah 5");
});
test("textbook behind needs two prior not_done", () => {
  const nd = (d: string) => mk(d, q(0, 1), { textbook: { status: "not_done", note: "", homework: null } });
  assert.ok(textbookBehind([nd("2"), nd("1")]));
  assert.ok(!textbookBehind([nd("2")]));
  assert.ok(!textbookBehind([nd("2"), mk("1", q(0, 1))]));
});
test("dua index recomputed from latest entry, clamped", () => {
  const a = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 2, duaNameAtEntry: null, custom: false, customDua: null, status: "mastered", homework: null } });
  const b = mk("2026-01-08", q(0, 1), { dua: { duaIndexAtEntry: 3, duaNameAtEntry: null, custom: false, customDua: null, status: "working", homework: null } });
  assert.equal(computeDuaIndex([a, b], 5), 3);
  assert.equal(computeDuaIndex([a], 5), 3);
  const last = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 4, duaNameAtEntry: null, custom: false, customDua: null, status: "mastered", homework: null } });
  assert.equal(computeDuaIndex([last], 5), 4);
  assert.equal(computeDuaIndex([], 5), null);
});
test("surah track: Fatiha then An-Nas..Al-Fil, 11 entries", () => {
  assert.equal(SURAH_TRACK.length, 11);
  assert.equal(SURAHS[SURAH_TRACK[0]].name, "Al-Fatihah");
  assert.equal(SURAHS[SURAH_TRACK[1]].name, "An-Nas");
  assert.equal(SURAHS[SURAH_TRACK[10]].name, "Al-Fil");
});
test("surah stuck, custom entries never flagged or advanced", () => {
  const prior = mk("2026-01-01", q(0, 1), { surah: { trackIndexAtEntry: 1, custom: false, customSurah: null, status: "working", homework: null } });
  assert.ok(surahStuck({ trackIndexAtEntry: 1, custom: false, status: "working" }, prior));
  assert.ok(!surahStuck({ trackIndexAtEntry: 2, custom: false, status: "working" }, prior));
  assert.ok(!surahStuck({ trackIndexAtEntry: 1, custom: true, status: "working" }, prior));

  const masteredPrior = mk("2026-01-01", q(0, 1), { surah: { trackIndexAtEntry: 1, custom: false, customSurah: null, status: "mastered", homework: null } });
  const custom = mk("2026-01-08", q(0, 1), { surah: { trackIndexAtEntry: 1, custom: true, customSurah: 5, status: "mastered", homework: null } });
  assert.equal(defaultSurahTrackIndex([masteredPrior], "2026-01-15", 0), 2);
  // A custom session in between is skipped when picking up the next default.
  assert.equal(defaultSurahTrackIndex([masteredPrior, custom], "2026-01-15", 0), 2);
  assert.equal(computeSurahTrackIndex([masteredPrior, custom]), 2);
});
test("default start", () => {
  assert.deepEqual(defaultStart(mk("d", q(3, 4)), "quran"), q(3, 4));
  assert.equal(defaultStart(mk("d", q(3, 4)), "qaida").mode, "qaida");
});
test("parent update: terse per-track lines, all homework merged into one bubble", () => {
  const e = mk("2026-01-10", q(1, 20), {
    quran: { start: q(1, 10), end: q(1, 20), letters: ["saad"], issues: ["over"], hesitation: true, note: "", homework: { from: q(1, 20), to: q(2, 1) }, homeworkStatus: null },
    surah: { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "working", homework: [{ name: "An-Nas", custom: false }] },
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: "Before eating", custom: false, customDua: null, status: "working", homework: [{ name: "Before sleeping", custom: false }] },
    textbook: { status: "done", note: "", homework: "Finish exercise 3" },
  });
  const { blocks, plain } = buildParentUpdate("Ali", e, undefined, ["Before eating"], 3);
  assert.equal(blocks.length, 5); // Qur'an, Surah, Dua, Textbook, + one merged homework bubble
  assert.equal(blocks[0].tone, "attention");
  assert.match(blocks[0].text, /Saad/);
  const hw = blocks[blocks.length - 1];
  assert.equal(hw.title, "🌟 Homework for next class");
  assert.match(hw.text, /Qur'an: read from Al-Baqarah 20 to Aal-E-Imran 1/);
  assert.match(hw.text, /Surah: An-Nas/);
  assert.match(hw.text, /Dua: Before sleeping/);
  assert.match(hw.text, /Textbook: Finish exercise 3/);
  assert.match(plain, /Saad/);
});
test("parent update omits the homework bubble only when truly nothing applies", () => {
  // A "still working" dua always has an implicit homework (see effectiveDuaHomework),
  // so this needs mastered dua/surah too for the bubble to have nothing to show.
  const e = mk("2026-01-10", q(1, 20), {
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: false, customDua: null, status: "mastered", homework: null },
    surah: { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "mastered", homework: null },
  });
  const { blocks } = buildParentUpdate("Ali", e, undefined, ["Before eating"], 3);
  assert.equal(blocks.length, 4);
  assert.ok(!blocks.some((b) => b.title.includes("Homework")));
});
test("parent update: a still-working dua with no explicit homework shows itself as the homework", () => {
  const e = mk("2026-01-10", q(1, 20)); // default dua: duaIndexAtEntry 0, status "working", no homework set
  const { blocks } = buildParentUpdate("Ali", e, undefined, ["Before eating"], 3);
  const hw = blocks[blocks.length - 1];
  assert.equal(hw.title, "🌟 Homework for next class");
  assert.match(hw.text, /Dua: Before eating/);
});
test("chapter move is always included regardless of this student's completion status", () => {
  const incomplete = mk("2026-01-10", q(1, 20), { textbook: { status: "not_done", note: "", homework: null } });
  const { blocks: a } = buildParentUpdate("Ali", incomplete, undefined, ["Before eating"], 3, 4);
  const hwA = a[a.length - 1];
  assert.equal(hwA.title, "🌟 Homework for next class");
  assert.match(hwA.text, /Textbook: Move to Chapter 4/);

  const complete = mk("2026-01-10", q(1, 20), { textbook: { status: "done", note: "", homework: null } });
  const { blocks: b } = buildParentUpdate("Ali", complete, undefined, ["Before eating"], 3, 4);
  assert.match(b[b.length - 1].text, /Textbook: Move to Chapter 4/);

  // A per-student extra note rides alongside the automatic chapter move.
  const withNote = mk("2026-01-10", q(1, 20), { textbook: { status: "partial", note: "", homework: "Also finish page 12" } });
  const { blocks: c } = buildParentUpdate("Ali", withNote, undefined, ["Before eating"], 3, 4);
  assert.match(c[c.length - 1].text, /Textbook: Move to Chapter 4 · Also finish page 12/);

  // With no "Up next" set (and nothing else pending), nothing is assumed.
  const noNext = mk("2026-01-10", q(1, 20), {
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: false, customDua: null, status: "mastered", homework: null },
    surah: { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "mastered", homework: null },
  });
  const { blocks: d } = buildParentUpdate("Ali", noNext, undefined, ["Before eating"], 3, null);
  assert.ok(!d.some((bl) => bl.title.includes("Homework")));
});
test("rollChapterForDate: Up next only takes effect on a genuinely new date", () => {
  const fresh = { chapter: 3, nextChapter: null, lastSessionDate: null };
  assert.deepEqual(rollChapterForDate(fresh, "2026-01-10"), { chapter: 3, nextChapter: null, lastSessionDate: "2026-01-10" });

  const queued = { chapter: 3, nextChapter: 4, lastSessionDate: "2026-01-10" };
  // Same day: never promotes, no matter how many times it's set/checked mid-session.
  assert.deepEqual(rollChapterForDate(queued, "2026-01-10"), queued);
  // A later date: promotes and clears the queue.
  assert.deepEqual(rollChapterForDate(queued, "2026-01-17"), { chapter: 4, nextChapter: null, lastSessionDate: "2026-01-17" });

  const noQueue = { chapter: 3, nextChapter: null, lastSessionDate: "2026-01-10" };
  assert.deepEqual(rollChapterForDate(noQueue, "2026-01-17"), { chapter: 3, nextChapter: null, lastSessionDate: "2026-01-17" });
});
test("normalizeEntry repairs a stale draft's pre-range Qur'an homework so pickers never see undefined", () => {
  // Shape a draft would have had before homework became { from, to } — just a flat Position.
  const stale = mk("2026-01-10", q(0, 1), { quran: { ...mk("x", q(0, 1)).quran, homework: qa(3, 5) as unknown as Entry["quran"]["homework"] } });
  const fixed = normalizeEntry(stale);
  assert.ok(fixed.quran.homework);
  assert.deepEqual(fixed.quran.homework!.from, qa(3, 5));
  assert.deepEqual(fixed.quran.homework!.to, qa(3, 5));

  // A partially-repaired draft (has "to" but lost "from" mid-edit) is also recovered, not crashed on.
  const partial = mk("2026-01-10", q(0, 1), {
    quran: { ...mk("x", q(0, 1)).quran, homework: { to: qa(3, 5) } as unknown as Entry["quran"]["homework"] },
  });
  const fixedPartial = normalizeEntry(partial);
  assert.deepEqual(fixedPartial.quran.homework, { from: qa(3, 5), to: qa(3, 5) });
});
test("effectiveDuaHomework: a still-working dua is its own homework; a list, mastery or being unrecorded override that", () => {
  const list = ["Before eating", "After eating"];
  const working = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 1, duaNameAtEntry: "After eating", custom: false, customDua: null, status: "working", homework: null } });
  assert.deepEqual(effectiveDuaHomework(working, list), [{ name: "After eating", custom: false }]);

  const mastered = mk("2026-01-01", q(0, 1), { dua: { ...working.dua, status: "mastered" } });
  assert.deepEqual(effectiveDuaHomework(mastered, list), []);

  const explicit = mk("2026-01-01", q(0, 1), { dua: { ...working.dua, homework: [{ name: "Before sleeping", custom: false }, { name: "Before eating", custom: false }] } });
  assert.deepEqual(effectiveDuaHomework(explicit, list).map((h) => h.name), ["Before sleeping", "Before eating"]);

  // An explicit empty list means "none", and beats the automatic default.
  const none = mk("2026-01-01", q(0, 1), { dua: { ...working.dua, homework: [] } });
  assert.deepEqual(effectiveDuaHomework(none, list), []);

  const customDua = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: true, customDua: "Dua for parents", status: "working", homework: null } });
  assert.deepEqual(effectiveDuaHomework(customDua, []), [{ name: "Dua for parents", custom: true }]);

  const unrecorded = mk("2026-01-01", q(0, 1), { recorded: { quran: true, surah: true, dua: false, textbook: true } });
  assert.deepEqual(effectiveDuaHomework(unrecorded, list), []);
});
test("effectiveSurahHomework: same rules as duas", () => {
  const working = mk("2026-01-01", q(0, 1), { surah: { trackIndexAtEntry: 1, custom: false, customSurah: null, status: "working", homework: null } });
  assert.deepEqual(effectiveSurahHomework(working), [{ name: "An-Nas", custom: false }]);

  const complete = mk("2026-01-01", q(0, 1), { surah: { ...working.surah, status: "mastered" } });
  assert.deepEqual(effectiveSurahHomework(complete), []);

  const explicit = mk("2026-01-01", q(0, 1), { surah: { ...working.surah, homework: [{ name: "Al-Falaq", custom: false }, { name: "Al-Ikhlas", custom: false }] } });
  assert.deepEqual(effectiveSurahHomework(explicit).map((h) => h.name), ["Al-Falaq", "Al-Ikhlas"]);

  const unrecorded = mk("2026-01-01", q(0, 1), { recorded: { quran: true, surah: false, dua: true, textbook: true } });
  assert.deepEqual(effectiveSurahHomework(unrecorded), []);
});
test("trackLabel and statusLabel read naturally for both tracks and the renamed status", () => {
  assert.equal(trackLabel("qaida"), "Qaida");
  assert.equal(trackLabel("quran"), "Qur'an");
  assert.equal(statusLabel("mastered"), "Complete");
  assert.equal(statusLabel("working"), "Working");
});
test("parent update block kinds match their section, for per-section image/card coloring", () => {
  const e = mk("2026-01-10", qa(1, 1), {
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: false, customDua: null, status: "mastered", homework: null },
    surah: { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "mastered", homework: null },
  });
  const { blocks } = buildParentUpdate("Ali", e, undefined, ["Before eating"], 3);
  assert.deepEqual(blocks.map((b) => b.kind), ["quran", "surah", "dua", "textbook"]);
  // On Qaida, the Qur'an block is labeled "Qaida", not "Qur'an".
  assert.match(blocks[0].title, /Qaida/);
});

test("normalizeEntry turns single-item dua/surah homework (and old plain strings) into lists, and leaves null automatic", () => {
  const old = mk("2026-01-01", q(0, 1), {
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: false, customDua: null, status: "working", homework: { name: "Before eating", custom: false } as unknown as null },
    surah: { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "working", homework: "An-Nas" as unknown as null },
  });
  const fixed = normalizeEntry(old);
  assert.deepEqual(fixed.dua.homework, [{ name: "Before eating", custom: false }]);
  assert.deepEqual(fixed.surah.homework, [{ name: "An-Nas", custom: true }]);
  assert.equal(normalizeEntry(mk("2026-01-01", q(0, 1))).dua.homework, null);
  assert.deepEqual(normalizeEntry(mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: false, customDua: null, status: "working", homework: [] } })).dua.homework, []);
});
test("entries saved before the recorded flags existed count as fully recorded", () => {
  const legacy = mk("2026-01-01", q(0, 1));
  assert.equal(legacy.recorded, undefined);
  for (const sec of ["quran", "surah", "dua", "textbook"] as const) assert.ok(isRec(legacy, sec));
  assert.deepEqual(fullRecorded(legacy), { quran: true, surah: true, dua: true, textbook: true });
  const partial = mk("2026-01-01", q(0, 1), { recorded: { quran: false, surah: true, dua: false, textbook: false } });
  assert.ok(isRec(partial, "surah") && !isRec(partial, "dua"));
});
test("progress and defaults ignore sessions where that section was never recorded", () => {
  const done = mk("2026-01-01", q(0, 1), { dua: { duaIndexAtEntry: 1, duaNameAtEntry: null, custom: false, customDua: null, status: "mastered", homework: null } });
  // A later entry whose dua is just an untouched default must not count as a dua session.
  const blank = mk("2026-01-08", q(0, 1), {
    recorded: { quran: true, surah: false, dua: false, textbook: false },
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: false, customDua: null, status: "working", homework: null },
  });
  assert.equal(computeDuaIndex([done, blank], 5), 2);
  assert.equal(defaultDuaIndex([done, blank], "2026-01-15", 0, 5), 2);
  assert.equal(priorWith([blank, done], "dua"), done);
  // Textbook "falling behind" needs two recorded misses, not two entries.
  const miss = (d: string, rec: boolean) => mk(d, q(0, 1), { recorded: { quran: true, surah: true, dua: true, textbook: rec }, textbook: { status: "not_done", note: "", homework: null } });
  assert.ok(!textbookBehind([miss("3", false), miss("2", true)]));
  assert.ok(textbookBehind([miss("3", true), miss("2", true)]));
});
test("parent update leaves out sections that were never recorded, along with their homework", () => {
  const e = mk("2026-01-10", q(1, 20), {
    recorded: { quran: false, surah: true, dua: false, textbook: false },
    surah: { trackIndexAtEntry: 1, custom: false, customSurah: null, status: "working", homework: null },
  });
  const { blocks, plain } = buildParentUpdate("Ali", e, undefined, ["Before eating"], 3, 4);
  assert.deepEqual(blocks.map((b) => b.kind), ["surah", "homework"]);
  const hw = blocks[1];
  assert.match(hw.text, /Surah: An-Nas/);
  assert.ok(!/Dua|Textbook|Chapter/.test(hw.text));
  assert.ok(!/Before eating/.test(plain));
});
test("parent update lists every surah and dua assigned as homework", () => {
  const e = mk("2026-01-10", q(1, 20), {
    surah: { trackIndexAtEntry: 1, custom: false, customSurah: null, status: "working", homework: [{ name: "An-Nas", custom: false }, { name: "Al-Falaq", custom: false }] },
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: "Before eating", custom: false, customDua: null, status: "working", homework: [{ name: "Before sleeping", custom: false }, { name: "After eating", custom: false }] },
  });
  const hw = buildParentUpdate("Ali", e, undefined, ["Before eating"], 3).blocks.at(-1)!;
  assert.match(hw.text, /Surah: An-Nas, Al-Falaq/);
  assert.match(hw.text, /Dua: Before sleeping, After eating/);
});
test("deriveQuranEnd: complete reaches the end of last homework, incomplete makes no progress, partial stops where the next homework starts", () => {
  const range = { from: q(1, 10), to: q(1, 25) };
  const start = q(1, 10);
  assert.deepEqual(deriveQuranEnd("completed", start, range, null), q(1, 25));
  assert.deepEqual(deriveQuranEnd("not_done", start, range, null), start);
  assert.deepEqual(deriveQuranEnd("almost", start, range, null), start);
  assert.deepEqual(deriveQuranEnd("almost", start, range, { from: q(1, 17), to: q(1, 30) }), q(1, 17));
  // Nothing was assigned last time, so there is nothing to have completed.
  assert.deepEqual(deriveQuranEnd("completed", start, null, null), start);
  assert.deepEqual(deriveQuranEnd(null, start, range, null), start);
});
test("labels: complete / partial / incomplete everywhere", () => {
  assert.equal(HOMEWORK_STATUS_LABEL.completed, "Complete");
  assert.equal(HOMEWORK_STATUS_LABEL.almost, "Partial");
  assert.equal(HOMEWORK_STATUS_LABEL.not_done, "Incomplete");
  assert.equal(textbookLabel("done"), "Complete");
  assert.equal(textbookLabel("partial"), "Partial");
  assert.equal(textbookLabel("not_done"), "Incomplete");
  assert.equal(daysAgoStr(7, new Date(2026, 9, 11)), "2026-10-04");
});

const hasUndefined = (v: unknown): boolean =>
  v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(hasUndefined));
test("an entry is always safe to write to Firestore (no undefined values anywhere), fresh or legacy", () => {
  const student = { id: "s", name: "Ali", mode: "qaida" as const, duaIndex: 0, surahTrackIndex: 0, active: true };
  const settings = { chapter: 3, nextChapter: null, lastSessionDate: null, duaList: ["Before eating"] };
  const fresh = buildDraft("s", "2026-01-10", [], student, settings);
  assert.ok(!hasUndefined(normalizeEntry(fresh)));
  assert.deepEqual(fresh.recorded, { quran: false, surah: false, dua: false, textbook: false });
  assert.ok(!hasUndefined(normalizeEntry({ ...fresh, recorded: { ...fresh.recorded!, surah: true } })));
  const legacy = normalizeEntry(mk("2026-01-01", q(0, 1)));
  assert.ok(!hasUndefined(legacy));
  assert.ok(!("recorded" in legacy));
});
test("a fresh draft ignores earlier sessions where its sections were never recorded", () => {
  const student = { id: "s", name: "Ali", mode: "quran" as const, duaIndex: 0, surahTrackIndex: 0, active: true };
  const settings = { chapter: 3, nextChapter: null, lastSessionDate: null, duaList: ["A", "B", "C"] };
  const recorded = mk("2026-01-01", q(1, 20), { dua: { duaIndexAtEntry: 1, duaNameAtEntry: "B", custom: false, customDua: null, status: "mastered", homework: null } });
  const blank = mk("2026-01-08", q(0, 1), { recorded: { quran: false, surah: false, dua: false, textbook: false } });
  const draft = buildDraft("s", "2026-01-15", [recorded, blank], student, settings);
  assert.equal(draft.dua.duaIndexAtEntry, 2); // advances from the recorded session, not the blank one
  assert.deepEqual(draft.quran.start, q(1, 20)); // starts where the last recorded reading ended
});

test("reviewDraft: only touched or edited sections count as recorded, and dirty means something is unsaved", () => {
  const student = { id: "s", name: "Ali", mode: "quran" as const, duaIndex: 0, surahTrackIndex: 0, active: true };
  const settings = { chapter: 3, nextChapter: null, lastSessionDate: null, duaList: ["A", "B"] };
  const base = buildDraft("s", "2026-01-10", [], student, settings);

  // Untouched: nothing recorded, nothing to save.
  const untouched = reviewDraft(structuredClone(base), base, []);
  assert.deepEqual(untouched.recorded, { quran: false, surah: false, dua: false, textbook: false });
  assert.equal(untouched.dirty, false);

  // Editing a section records exactly that section.
  const edited = structuredClone(base);
  edited.surah.status = "mastered";
  assert.deepEqual(reviewDraft(edited, base, []).recorded, { quran: false, surah: true, dua: false, textbook: false });
  assert.equal(reviewDraft(edited, base, []).dirty, true);

  // Tapping a button that matches the default still records that section.
  const tapped = reviewDraft(structuredClone(base), base, ["dua"]);
  assert.equal(tapped.recorded.dua, true);
  assert.equal(tapped.dirty, true);

  // Once saved (base now says recorded), tapping again changes nothing — no endless re-saving.
  const saved = { ...structuredClone(base), recorded: { ...base.recorded!, dua: true } };
  assert.equal(reviewDraft(structuredClone(saved), saved, ["dua"]).dirty, false);
});
test("the shared store replaces an entry for the same student and date instead of duplicating it", () => {
  const a = mk("2026-01-10", q(0, 1));
  setRecent([a, { ...mk("2026-01-03", q(0, 1)), studentId: "other" }]);
  upsertEntry({ ...a, textbook: { ...a.textbook, status: "not_done" } });
  const forS = getRecent().filter((e) => e.studentId === "s" && e.date === "2026-01-10");
  assert.equal(forS.length, 1);
  assert.equal(forS[0].textbook.status, "not_done");
  assert.equal(getRecent().length, 2);
  updateRecent(() => []);
  assert.deepEqual(getRecent(), []);
});
