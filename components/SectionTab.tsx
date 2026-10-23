"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import HomeworkList from "@/components/HomeworkList";
import PosPicker from "@/components/PosPicker";
import { saveEntry } from "@/lib/data";
import { buildDraft } from "@/lib/draft";
import {
  computeDuaIndex, computeSurahTrackIndex, deriveQuranEnd, duaEntryName, effectiveDuaHomework,
  effectiveSurahHomework, fmtRange, fullRecorded, homeworkRange, HOMEWORK_STATUS_LABEL, isRec, priorEntries,
  priorWith, statusLabel, surahEntryName, textbookLabel, todayStr, trackLabel,
} from "@/lib/logic";
import { SURAHS, SURAH_TRACK, surahTrackName } from "@/lib/quran";
import type { ClassSettings, Entry, HomeworkStatus, Position, Section, Student } from "@/lib/types";

type Tone = "g" | "y" | "r";
interface StatusOption { v: string; label: string; tone: Tone }

const QURAN_STATUSES: StatusOption[] = [
  { v: "completed", label: HOMEWORK_STATUS_LABEL.completed, tone: "g" },
  { v: "almost", label: HOMEWORK_STATUS_LABEL.almost, tone: "y" },
  { v: "not_done", label: HOMEWORK_STATUS_LABEL.not_done, tone: "r" },
];
const TEXTBOOK_STATUSES: StatusOption[] = [
  { v: "done", label: textbookLabel("done"), tone: "g" },
  { v: "partial", label: textbookLabel("partial"), tone: "y" },
  { v: "not_done", label: textbookLabel("not_done"), tone: "r" },
];
const ITEM_STATUSES: StatusOption[] = [
  { v: "mastered", label: statusLabel("mastered"), tone: "g" },
  { v: "working", label: statusLabel("working"), tone: "y" },
];

const samePos = (a: Position, b: Position) =>
  a.mode === b.mode && a.page === b.page && a.line === b.line && a.surah === b.surah && a.ayah === b.ayah;

function StatusButtons({ options, value, onPick }: { options: StatusOption[]; value: string | null | undefined; onPick: (v: string) => void }) {
  return (
    <div className="stbtns">
      {options.map((o) => (
        <button key={o.v} type="button" className={`st ${o.tone}${value === o.v ? " on" : ""}`} aria-pressed={value === o.v} onClick={() => onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A text box that saves when you leave it, not on every keystroke. */
function NoteInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      type="text"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
    />
  );
}

interface Props {
  section: Section;
  students: Student[];
  entries: Entry[];
  settings: ClassSettings;
  setEntries: (fn: (prev: Entry[]) => Entry[]) => void;
  patchStudent: (id: string, patch: Partial<Student>) => void;
  notify: (message: string) => void;
}

/**
 * One section (Qur'an, Surahs, Duas or Textbook) for the whole class: every student in a list showing
 * last session's homework, and a panel per student to record how it went and set the next homework.
 * Every change is written straight to today's entry, touching only this section.
 */
export default function SectionTab({ section, students, entries, settings, setEntries, patchStudent, notify }: Props) {
  const today = todayStr();
  const [exp, setExp] = useState<string | null>(null);
  const duaList = settings.duaList;

  const sameStudentToday = (id: string) => (x: Entry) => x.studentId === id && x.date === today;

  /** Applies `fn` to today's entry for `s` (creating it if needed), marks this section recorded, and saves. */
  async function apply(s: Student, fn: (e: Entry) => void) {
    const mine = entries.filter((x) => x.studentId === s.id);
    const before = mine.find((x) => x.date === today);
    const e = structuredClone(buildDraft(s.id, today, mine, s, settings));
    fn(e);
    e.recorded = { ...fullRecorded(e), [section]: true };
    if (!e.dua.custom) e.dua.duaNameAtEntry = duaList[e.dua.duaIndexAtEntry] ?? null;

    const isOther = (x: Entry) => !sameStudentToday(s.id)(x);
    setEntries((prev) => [...prev.filter(isOther), e]);
    try {
      const all = await saveEntry(e, mine, duaList.length);
      const duaIndex = computeDuaIndex(all, duaList.length);
      const surahTrackIndex = computeSurahTrackIndex(all);
      patchStudent(s.id, {
        ...(duaIndex !== null ? { duaIndex } : {}),
        ...(surahTrackIndex !== null ? { surahTrackIndex } : {}),
      });
    } catch (err) {
      console.error(err);
      setEntries((prev) => [...prev.filter(isOther), ...(before ? [before] : [])]);
      notify(`Couldn't save ${s.name}. Check your connection.`);
    }
  }

  function row(s: Student) {
    const mine = entries.filter((x) => x.studentId === s.id);
    const priors = priorEntries(mine, today);
    const p = priorWith(priors, section);
    const e = buildDraft(s.id, today, mine, s, settings); // today's saved entry, or a fresh draft
    const recorded = isRec(e, section);
    const open = exp === s.id;
    // The draft as if recorded, so automatic homework can be shown while the teacher is still editing.
    const live: Entry = { ...e, recorded: undefined };

    let prevText: string | null = null;
    let nowText = "";
    let nextText = "none";
    let chip: { label: string; tone: Tone | "" } | null = null;
    let panel: ReactNode = null;

    if (section === "quran") {
      const mode = e.quran.start.mode;
      const pHw = p?.quran.homework ?? null;
      prevText = pHw ? fmtRange(pHw) : null;
      const hwRange = p ? homeworkRange(p, mode) : null;
      const st = e.quran.homeworkStatus;
      const defFromFor = (status: HomeworkStatus | null): Position =>
        hwRange && status === "completed" ? hwRange.to : hwRange && status ? hwRange.from : e.quran.start;
      const hw = e.quran.homework ?? { from: defFromFor(st), to: defFromFor(st) };
      nextText = e.quran.homework ? fmtRange(e.quran.homework) : "none";
      if (recorded) chip = { label: st ? HOMEWORK_STATUS_LABEL[st] : "Recorded", tone: st === "completed" ? "g" : st === "almost" ? "y" : st === "not_done" ? "r" : "" };

      const pick = (status: HomeworkStatus) =>
        apply(s, (x) => {
          const was = x.quran.homeworkStatus;
          const oldDef = defFromFor(was);
          const newDef = defFromFor(status);
          // If the next homework still sits on its automatic default, move it along with the status.
          if (x.quran.homework) {
            if (samePos(x.quran.homework.from, oldDef)) x.quran.homework.from = { ...newDef };
            if (samePos(x.quran.homework.to, oldDef)) x.quran.homework.to = { ...newDef };
          }
          x.quran.homeworkStatus = status;
          x.quran.end = deriveQuranEnd(status, x.quran.start, hwRange, x.quran.homework);
        });
      const setPos = (which: "from" | "to", pos: Position) =>
        apply(s, (x) => {
          const cur = x.quran.homework ?? { from: { ...hw.from }, to: { ...hw.to } };
          cur[which] = pos;
          x.quran.homework = cur;
          // Where the next homework starts is where a partial student stopped.
          if (x.quran.homeworkStatus) x.quran.end = deriveQuranEnd(x.quran.homeworkStatus, x.quran.start, hwRange, cur);
        });

      panel = (
        <>
          {hwRange && <StatusButtons options={QURAN_STATUSES} value={st} onPick={(v) => pick(v as HomeworkStatus)} />}
          <div className="hw">
            <div className="hw-title">🌟 Homework</div>
            <PosPicker label="From" pos={hw.from} onChange={(pos) => setPos("from", pos)} />
            <PosPicker label="To" pos={hw.to} onChange={(pos) => setPos("to", pos)} />
            {e.quran.homework && (
              <button type="button" className="linkbtn" onClick={() => apply(s, (x) => { x.quran.homework = null; })}>Remove homework</button>
            )}
          </div>
        </>
      );
    } else if (section === "textbook") {
      const st = e.textbook.status;
      prevText = p ? `Chapter ${settings.chapter}${p.textbook.homework ? ` · ${p.textbook.homework}` : ""}` : null;
      nextText = [settings.nextChapter !== null ? `Chapter ${settings.nextChapter}` : "", e.textbook.homework ?? ""].filter(Boolean).join(" · ") || "none";
      if (recorded) chip = { label: textbookLabel(st), tone: st === "done" ? "g" : st === "partial" ? "y" : "r" };
      panel = (
        <>
          <StatusButtons options={TEXTBOOK_STATUSES} value={recorded ? st : null} onPick={(v) => apply(s, (x) => { x.textbook.status = v as Entry["textbook"]["status"]; })} />
          <div className="hw">
            <div className="hw-title">🌟 Homework</div>
            {settings.nextChapter !== null && <div className="muted" style={{ fontSize: "0.85rem" }}>Chapter {settings.nextChapter} for everyone</div>}
            <NoteInput
              value={e.textbook.homework ?? ""}
              placeholder={settings.nextChapter !== null ? "Extra note (optional)" : "e.g. Finish exercise 3, page 14"}
              onCommit={(v) => apply(s, (x) => { x.textbook.homework = v.trim() || null; })}
            />
          </div>
        </>
      );
    } else {
      const isSurah = section === "surah";
      const items = isSurah ? effectiveSurahHomework(live) : effectiveDuaHomework(live, duaList);
      const auto = (isSurah ? e.surah.homework : e.dua.homework) === null;
      const status = isSurah ? e.surah.status : e.dua.status;
      const currentName = isSurah ? surahEntryName(e.surah) : duaEntryName(e.dua, duaList);
      const priorItems = p ? (isSurah ? effectiveSurahHomework(p) : effectiveDuaHomework(p, duaList)) : [];
      prevText = priorItems.map((h) => h.name).join(", ") || null;
      if (currentName && !priorItems.some((h) => h.name === currentName)) nowText = ` · now ${currentName}`;
      nextText = (recorded ? items.map((h) => h.name).join(", ") : "") || "none";
      if (recorded) chip = { label: statusLabel(status), tone: status === "mastered" ? "g" : "y" };

      const custom = isSurah ? e.surah.custom : e.dua.custom;
      const currentSelect = isSurah ? (
        <>
          <select
            aria-label="Current surah"
            value={custom ? "custom" : e.surah.trackIndexAtEntry}
            onChange={(ev) => {
              const v = ev.target.value;
              apply(s, (x) => {
                if (v === "custom") { x.surah.custom = true; x.surah.customSurah = x.surah.customSurah ?? 0; }
                else { x.surah.custom = false; x.surah.customSurah = null; x.surah.trackIndexAtEntry = +v; }
              });
            }}
          >
            {SURAH_TRACK.map((_, i) => <option key={i} value={i}>{surahTrackName(i)}</option>)}
            <option value="custom">Other surah…</option>
          </select>
          {e.surah.custom && (
            <select aria-label="Which surah" value={e.surah.customSurah ?? 0} onChange={(ev) => apply(s, (x) => { x.surah.customSurah = +ev.target.value; })}>
              {SURAHS.map((sr, i) => <option key={i} value={i}>{i + 1}. {sr.name}</option>)}
            </select>
          )}
        </>
      ) : (
        <>
          <select
            aria-label="Current dua"
            value={custom ? "custom" : e.dua.duaIndexAtEntry}
            onChange={(ev) => {
              const v = ev.target.value;
              apply(s, (x) => {
                if (v === "custom") { x.dua.custom = true; x.dua.customDua = x.dua.customDua ?? ""; }
                else { x.dua.custom = false; x.dua.customDua = null; x.dua.duaIndexAtEntry = +v; }
              });
            }}
          >
            {duaList.map((n, i) => <option key={i} value={i}>{i + 1}. {n}</option>)}
            {!duaList.length && <option value={0}>No duas. Add some in Settings</option>}
            <option value="custom">Other…</option>
          </select>
          {e.dua.custom && (
            <NoteInput value={e.dua.customDua ?? ""} placeholder="Which dua?" onCommit={(v) => apply(s, (x) => { x.dua.customDua = v; })} />
          )}
        </>
      );

      panel = (
        <>
          {currentSelect}
          <StatusButtons
            options={ITEM_STATUSES}
            value={recorded ? status : null}
            onPick={(v) => apply(s, (x) => { (isSurah ? x.surah : x.dua).status = v as "mastered" | "working"; })}
          />
          <div className="hw">
            <div className="hw-title">🌟 Homework</div>
            <HomeworkList
              kind={isSurah ? "surah" : "dua"}
              items={items}
              auto={auto}
              options={isSurah ? SURAH_TRACK.map((_, i) => surahTrackName(i)) : duaList}
              onChange={(next) => apply(s, (x) => { (isSurah ? x.surah : x.dua).homework = next; })}
            />
          </div>
        </>
      );
    }

    return (
      <div key={s.id} className="srow">
        <button type="button" className="plain srow-head" aria-expanded={open} onClick={() => setExp(open ? null : s.id)}>
          <span className="srow-main">
            <span className="srow-name">
              {s.name}
              {section === "quran" && <span className="pill">{trackLabel(e.quran.start.mode)}</span>}
            </span>
            <span className="srow-sub"><b className="hwlabel">Homework:</b> {prevText ?? "none"}{nowText}</span>
            {recorded && <span className="srow-sub">Next: {nextText}</span>}
          </span>
          <span className="srow-side">
            {chip && <span className={`chipst ${chip.tone}`}>✓ {chip.label}</span>}
            <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span>
          </span>
        </button>
        {open && (
          <div className="srow-panel">
            {panel}
            <Link href={`/student/${s.id}`} className="linkbtn">Open student page ›</Link>
          </div>
        )}
      </div>
    );
  }

  const recordedCount = students.filter((s) => isRec(buildDraft(s.id, today, entries.filter((x) => x.studentId === s.id), s, settings), section)).length;

  return (
    <>
      <div className="muted" style={{ marginBottom: 8, fontSize: "0.85rem" }}>{recordedCount} of {students.length} recorded</div>
      <div className="stack" style={{ gap: 8 }}>
        {students.map(row)}
        {!students.length && <p className="muted">No students yet.</p>}
      </div>
    </>
  );
}
