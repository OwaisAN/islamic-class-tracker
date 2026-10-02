import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePos, quranStuck, duaStuck, duaEntryName, effectiveDuaHomework, surahStuck, textbookBehind, computeDuaIndex,
  computeSurahTrackIndex, defaultDuaIndex, defaultStart, defaultSurahTrackIndex, homeworkRange, fmtRange,
  rollChapterForDate, buildParentUpdate, normalizeEntry,
} from "./logic.ts";
import { SURAHS, SURAH_TRACK } from "./quran.ts";
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
    surah: { trackIndexAtEntry: 0, custom: false, customSurah: null, status: "working", homework: { name: "An-Nas", custom: false } },
    dua: { duaIndexAtEntry: 0, duaNameAtEntry: "Before eating", custom: false, customDua: null, status: "working", homework: { name: "Before sleeping", custom: false } },
    textbook: { status: "done", note: "", homework: "Finish exercise 3" },
  });
  const { blocks, plain } = buildParentUpdate("Ali", e, undefined, ["Before eating"], 3);
  assert.equal(blocks.length, 5); // Qur'an, Surah, Dua, Textbook, + one merged homework bubble
  assert.equal(blocks[0].tone, "attention");
  assert.match(blocks[0].text, /Saad/);
  const hw = blocks[blocks.length - 1];
  assert.equal(hw.title, "🎯 Homework for next class");
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
  assert.equal(hw.title, "🎯 Homework for next class");
  assert.match(hw.text, /Dua: Before eating/);
});
test("chapter move is always included regardless of this student's completion status", () => {
  const incomplete = mk("2026-01-10", q(1, 20), { textbook: { status: "not_done", note: "", homework: null } });
  const { blocks: a } = buildParentUpdate("Ali", incomplete, undefined, ["Before eating"], 3, 4);
  const hwA = a[a.length - 1];
  assert.equal(hwA.title, "🎯 Homework for next class");
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
test("effectiveDuaHomework: still-working defaults to the current dua; an explicit choice or mastery override that", () => {
  const working = { duaIndexAtEntry: 1, duaNameAtEntry: "After eating", custom: false, customDua: null, status: "working" as const, homework: null };
  assert.deepEqual(effectiveDuaHomework(working, ["Before eating", "After eating"]), { name: "After eating", custom: false });

  const mastered = { ...working, status: "mastered" as const };
  assert.equal(effectiveDuaHomework(mastered, ["Before eating", "After eating"]), null);

  const explicit = { ...working, homework: { name: "Before sleeping", custom: false } };
  assert.deepEqual(effectiveDuaHomework(explicit, ["Before eating", "After eating"]), { name: "Before sleeping", custom: false });

  const customDua = { duaIndexAtEntry: 0, duaNameAtEntry: null, custom: true, customDua: "Dua for parents", status: "working" as const, homework: null };
  assert.deepEqual(effectiveDuaHomework(customDua, []), { name: "Dua for parents", custom: true });
});
