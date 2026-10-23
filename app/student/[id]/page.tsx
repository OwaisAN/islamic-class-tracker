"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import ParentCard from "@/components/ParentCard";
import PosPicker from "@/components/PosPicker";
import HomeworkList from "@/components/HomeworkList";
import { getEntries, getSettings, getStudent, saveEntry, updateStudent } from "@/lib/data";
import { buildDraft } from "@/lib/draft";
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from "@/lib/localDraft";
import { upsertEntry } from "@/lib/store";
import {
  computeDuaIndex, computeSurahTrackIndex, defaultStart, duaEntryName, duaStuck, effectiveDuaHomework,
  effectiveSurahHomework, fmtRange, homeworkRange, HOMEWORK_STATUS_LABEL, isRec, prettyDate, priorEntries,
  priorWith, quranRange, quranStuck, reviewDraft, sortDesc, statusLabel, surahEntryName, surahStuck,
  textbookBehind, textbookLabel, todayStr, trackLabel,
} from "@/lib/logic";
import { ISSUES, LETTERS, SURAHS, SURAH_TRACK, surahTrackName } from "@/lib/quran";
import type { ClassSettings, Entry, HomeworkStatus, Mode, Recorded, Section, Student } from "@/lib/types";

const SECTION_LIST: Section[] = ["quran", "surah", "dua", "textbook"];

/** The default draft, or a locally-saved unsaved draft if one differs from it. `base` is what "untouched" means. */
function resolveDraft(studentId: string, date: string, entries: Entry[], student: Student, settings: ClassSettings) {
  const base = buildDraft(studentId, date, entries, student, settings);
  const local = loadLocalDraft(studentId, date);
  if (local && JSON.stringify(local) !== JSON.stringify(base)) return { draft: local, base, restored: true };
  return { draft: base, base, restored: false };
}

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const HOMEWORK_STATUSES: HomeworkStatus[] = ["completed", "almost", "not_done"];

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const today = todayStr();

  const [student, setStudent] = useState<Student | null>(null);
  const [settings, setSettings] = useState<ClassSettings | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState<Entry | null>(null);
  const [baseline, setBaseline] = useState<Entry | null>(null);
  const [endTouched, setEndTouched] = useState(false);
  const [restored, setRestored] = useState(false);
  const [openSection, setOpenSection] = useState<Section>("quran");
  const [showHist, setShowHist] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const [autoStatus, setAutoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Sections the teacher has tapped, even if the tap matched the default and so changed nothing.
  const [touched, setTouched] = useState<Section[]>([]);

  // The save below runs from a timer, so it reads the latest values from refs rather than from
  // whatever render it was scheduled in. baseline/entries are written to their ref at the same
  // moment as their state, so a save never works from a copy older than the one before it.
  const draftRef = useRef<Entry | null>(null);
  const baseRef = useRef<Entry | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const touchedRef = useRef<Section[]>([]);
  const inFlight = useRef(false);
  const live = useRef({ id, student: null as Student | null, settings: null as ClassSettings | null });
  const setBase = (b: Entry | null) => { baseRef.current = b; setBaseline(b); };
  const setAll = (all: Entry[]) => { entriesRef.current = all; setEntries(all); };

  useEffect(() => {
    (async () => {
      try {
        const [s, st, en] = await Promise.all([getStudent(id), getSettings(), getEntries(id)]);
        if (!s) { setErr("Student not found."); return; }
        setStudent(s); setSettings(st); setAll(en);
        const { draft: d0, base, restored: r0 } = resolveDraft(id, today, en, s, st);
        setDraft(d0);
        setBase(base);
        setRestored(r0);
        setEndTouched(en.some((e) => e.date === today && isRec(e, "quran")));
      } catch (e) {
        setErr("Couldn't reach the database.");
        console.error(e);
      }
    })();
  }, [id, today]);

  draftRef.current = draft;
  touchedRef.current = touched;
  live.current = { id, student, settings };

  // Today's changes save themselves a moment after the teacher stops tapping, so the home tabs and
  // this page always agree. Past dates stay manual: a stray tap shouldn't rewrite history, and a
  // restored (unsaved) draft waits for the teacher to choose Save or Discard.
  useEffect(() => {
    if (!draft || !baseline || restored || date !== today) return;
    if (!reviewDraft(draft, baseline, touched).dirty) return;
    const timer = setTimeout(() => commit(true), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, baseline, touched, restored, date, today]);

  /**
   * Saves the draft. A section counts as recorded once it was already recorded, has been tapped, or
   * has been edited, so defaults nobody touched never turn into real data on the parent update.
   */
  async function commit(silent: boolean) {
    const { id: sid, student: stu, settings: set } = live.current;
    const d = draftRef.current;
    const base = baseRef.current;
    if (!stu || !set || !d || !base) return;
    if (inFlight.current) {
      if (!silent) { setToast("Still saving…"); setTimeout(() => setToast(""), 1500); }
      return;
    }
    const tNow = touchedRef.current;
    const { recorded, dirty } = reviewDraft(d, base, tNow);
    if (!dirty) {
      if (!silent) {
        setToast(Object.values(recorded).some(Boolean) ? "Everything is already saved." : "Nothing to save yet. Record at least one section first.");
        setTimeout(() => setToast(""), 2500);
      }
      return;
    }
    inFlight.current = true;
    setAutoStatus("saving");
    try {
      const duaCount = set.duaList.length;
      const toSave: Entry = structuredClone(d);
      toSave.recorded = recorded;
      if (!toSave.dua.custom) toSave.dua.duaNameAtEntry = set.duaList[toSave.dua.duaIndexAtEntry] ?? null;
      const all = await saveEntry(toSave, entriesRef.current, duaCount);
      setAll(all);
      setBase(toSave);
      upsertEntry(toSave);
      clearLocalDraft(sid, toSave.date);
      setRestored(false);
      setTouched((t) => t.filter((x) => !tNow.includes(x)));
      // Keep whatever was typed while the save was in flight; only pick up what the save itself added.
      setDraft((cur) => (cur ? { ...cur, recorded, dua: { ...cur.dua, duaNameAtEntry: toSave.dua.duaNameAtEntry } } : cur));
      const duaIdx = computeDuaIndex(all, duaCount);
      const surahIdx = computeSurahTrackIndex(all);
      setStudent((cur) => (cur ? { ...cur, duaIndex: duaIdx ?? cur.duaIndex, surahTrackIndex: surahIdx ?? cur.surahTrackIndex } : cur));
      setAutoStatus("saved");
      if (!silent) {
        setToast(`Saved for ${stu.name} · ${prettyDate(toSave.date)}`);
        setTimeout(() => setToast(""), 2200);
      }
    } catch (e) {
      console.error(e);
      setAutoStatus("error");
      setToast("Save failed. Check connection.");
      setTimeout(() => setToast(""), 3000);
    } finally {
      inFlight.current = false;
    }
  }

  const priors = useMemo(() => (draft ? priorEntries(entries, draft.date) : []), [entries, draft]);
  const prior = priors[0];
  const latest = useMemo(() => sortDesc(entries)[0], [entries]);
  const latestPrior = latest ? priorEntries(entries, latest.date)[0] : undefined;

  if (err) return <><Link href="/" className="back">← Students</Link><div className="warn-box">{err}</div></>;
  if (!student || !settings || !draft || !baseline) return <p className="muted">Loading…</p>;

  const d = draft;
  const editingPast = date !== today;
  const patch = (fn: (e: Entry) => void) => setDraft((cur) => {
    const c = structuredClone(cur!);
    fn(c);
    saveLocalDraft(c);
    return c;
  });

  function goDate(newDate: string) {
    if (date === today && !restored) commit(true); // don't lose edits that haven't auto-saved yet
    setDate(newDate);
    setTouched([]);
    const { draft: d1, base: b1, restored: r1 } = resolveDraft(id, newDate, entriesRef.current, student!, settings!);
    setDraft(d1);
    setBase(b1);
    setRestored(r1);
    setEndTouched(entriesRef.current.some((e) => e.date === newDate && isRec(e, "quran")));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function discardLocalDraft() {
    clearLocalDraft(id, date);
    const fresh = buildDraft(id, date, entries, student!, settings!);
    setDraft(fresh);
    setBase(fresh);
    setTouched([]);
    setRestored(false);
  }

  async function switchMode() {
    const next: Mode = student!.mode === "qaida" ? "quran" : "qaida";
    await updateStudent(id, { mode: next });
    const s2 = { ...student!, mode: next };
    setStudent(s2);
    if (!editingPast) {
      // Re-point today's draft at the new mode; history is untouched.
      const start = defaultStart(priorWith(priors, "quran"), next);
      patch((e) => {
        e.quran.start = start;
        e.quran.end = { ...start };
        e.quran.homeworkStatus = null; // last homework was set in the old mode, no longer comparable
      });
      setEndTouched(false);
    }
  }

  async function archive() {
    if (!confirm(`Archive ${student!.name}? You can reactivate them in Settings.`)) return;
    await updateStudent(id, { active: false });
    router.push("/");
  }

  // Accordion: opening one of the four log sections auto-collapses the others.
  const sectionProps = (name: Section) => ({
    open: openSection === name,
    onToggle: (e: SyntheticEvent<HTMLDetailsElement>) => {
      if (e.currentTarget.open) setOpenSection(name);
    },
  });

  // Each section is compared against the last session in which it was actually recorded.
  const pQ = priorWith(priors, "quran");
  const pS = priorWith(priors, "surah");
  const pD = priorWith(priors, "dua");
  const qStuck = endTouched && quranStuck(d.quran.end, pQ);
  const dStuck = duaStuck(d.dua, pD);
  const sStuck = surahStuck(d.surah, pS);
  const tBehind = textbookBehind(priors);
  const duaName = (dua: Entry["dua"]) => duaEntryName(dua, settings.duaList);
  const hwRange = homeworkRange(pQ, d.quran.start.mode);

  const lastQHw = prior ? homeworkRange(prior, d.quran.start.mode) : null;
  const lastDuaHw = prior ? effectiveDuaHomework(prior, settings.duaList) : [];
  const lastSurahHw = prior ? effectiveSurahHomework(prior) : [];
  const lastTextHw = prior && isRec(prior, "textbook") ? prior.textbook.homework : null;
  const anyPriorHomework = Boolean(lastQHw || lastSurahHw.length || lastDuaHw.length || lastTextHw);

  // What the draft's automatic homework would be, ignoring whether it has been saved yet.
  const draftAsRecorded: Entry = { ...d, recorded: undefined };
  const duaItems = effectiveDuaHomework(draftAsRecorded, settings.duaList);
  const surahItems = effectiveSurahHomework(draftAsRecorded);
  const review = reviewDraft(d, baseline, touched);
  const recNow = (sec: Section) => review.recorded[sec];
  const touch = (sec: Section) => setTouched((t) => (t.includes(sec) ? t : [...t, sec]));
  const dirtyNow = review.dirty;
  const unrecorded = (sec: Section) => (recNow(sec) ? null : <span className="muted" style={{ fontWeight: 500, fontSize: "0.8rem" }}> · not recorded</span>);

  return (
    <>
      <div className="topbar">
        <Link href="/" className="back">← Students</Link>
        <button className="ghost small" onClick={archive}>Archive</button>
      </div>

      <div className="row between" style={{ marginBottom: 12 }}>
        <h1>{student.name}</h1>
        <button className="modeToggle" onClick={switchMode} aria-label="Switch mode">
          {student.mode === "qaida" ? "On Qaida" : "Reading Qur'an"} ⇄
        </button>
      </div>

      {editingPast && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <span>Editing session from {prettyDate(date)}</span>
          <button className="small ghost" onClick={() => goDate(today)}>Back to today</button>
        </div>
      )}

      {restored && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <span>Restored unsaved changes from earlier</span>
          <button className="small ghost" onClick={discardLocalDraft}>Discard</button>
        </div>
      )}

      <div className="summary" style={{ marginBottom: 12 }}>
        <b>Last session{prior ? ` · ${prettyDate(prior.date)}` : ""}</b>
        {prior ? (
          <>
            {isRec(prior, "quran") && <div>📖 {quranRange(prior)}</div>}
            {isRec(prior, "surah") && <div>🌙 {surahEntryName(prior.surah)} · {statusLabel(prior.surah.status)}</div>}
            {isRec(prior, "dua") && <div>🤲 {duaName(prior.dua)} · {statusLabel(prior.dua.status)}</div>}
            {isRec(prior, "textbook") && <div>📝 Textbook: {textbookLabel(prior.textbook.status)}</div>}
            {anyPriorHomework && (
              <div className="hw" style={{ marginTop: 10 }}>
                <div className="hw-title">🌟 Homework set</div>
                {lastQHw && <div>{trackLabel(prior.quran.end.mode)}: {fmtRange(lastQHw)}</div>}
                {lastSurahHw.length > 0 && <div>Surah: {lastSurahHw.map((h) => h.name).join(", ")}</div>}
                {lastDuaHw.length > 0 && <div>Dua: {lastDuaHw.map((h) => h.name).join(", ")}</div>}
                {lastTextHw && <div>Textbook: {lastTextHw}</div>}
              </div>
            )}
          </>
        ) : <div className="muted">No earlier sessions yet.</div>}
      </div>

      <div className="stack">
        {/* Qur'an */}
        <details className="sect" {...sectionProps("quran")}>
          <summary><span>{trackLabel(d.quran.start.mode)}{unrecorded("quran")}</span></summary>
          <div className="body">
            {hwRange && (
              <div className="hw">
                <div className="hw-title">🌟 Homework was: {fmtRange(hwRange)}</div>
                <div className="seg warn" style={{ marginTop: 8 }}>
                  {HOMEWORK_STATUSES.map((s) => (
                    <button
                      key={s}
                      className={d.quran.homeworkStatus === s ? "on" : ""}
                      style={d.quran.homeworkStatus === s && s === "completed" ? { background: "var(--green)" } : undefined}
                      onClick={() => {
                        if (s === "completed") setEndTouched(true);
                        patch((e) => {
                          e.quran.homeworkStatus = s;
                          if (s === "completed") { e.quran.end = { ...hwRange.to }; }
                        });
                      }}
                    >
                      {HOMEWORK_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <PosPicker label="Starting from" pos={d.quran.start} onChange={(p) => patch((e) => { e.quran.start = p; })} />
            <PosPicker label="Ended at" pos={d.quran.end} onChange={(p) => { setEndTouched(true); patch((e) => { e.quran.end = p; }); }} />
            {qStuck && <div className="warn-box">Ending position is the same as, or behind, the last session. No progress yet.</div>}

            <div>
              <label className="lbl">Letters mispronounced</label>
              <div className="letters">
                {LETTERS.map((l) => (
                  <button key={l.id} className={`letter ${d.quran.letters.includes(l.id) ? "on" : ""}`} aria-label={l.en} aria-pressed={d.quran.letters.includes(l.id)}
                    onClick={() => patch((e) => { e.quran.letters = toggle(e.quran.letters, l.id); })}>{l.ar}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="lbl">Issues</label>
              <div className="tags">
                {ISSUES.map((i) => (
                  <button key={i.id} className={`tag ${d.quran.issues.includes(i.id) ? "on" : ""}`} aria-pressed={d.quran.issues.includes(i.id)}
                    onClick={() => patch((e) => { e.quran.issues = toggle(e.quran.issues, i.id); })}>{i.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="lbl">Reading</label>
              <div className="seg warn">
                <button className={!d.quran.hesitation ? "on" : ""} style={!d.quran.hesitation ? { background: "var(--green)" } : undefined} onClick={() => { touch("quran"); patch((e) => { e.quran.hesitation = false; }); }}>Fluent</button>
                <button className={d.quran.hesitation ? "on" : ""} onClick={() => patch((e) => { e.quran.hesitation = true; })}>Hesitant</button>
              </div>
            </div>

            <div>
              <label className="lbl">Note (optional)</label>
              <textarea value={d.quran.note} onChange={(ev) => patch((e) => { e.quran.note = ev.target.value; })} />
            </div>

            <div className="hw">
              <div className="hw-title">🌟 Homework for next class</div>
              {d.quran.homework ? (
                <div className="stack" style={{ gap: 8 }}>
                  <PosPicker label="Read from" pos={d.quran.homework.from} onChange={(p) => patch((e) => { e.quran.homework!.from = p; })} />
                  <PosPicker label="Read up to" pos={d.quran.homework.to} onChange={(p) => patch((e) => { e.quran.homework!.to = p; })} />
                  <button className="ghost small" onClick={() => patch((e) => { e.quran.homework = null; })}>Remove homework</button>
                </div>
              ) : (
                <button className="ghost" onClick={() => patch((e) => { e.quran.homework = { from: { ...e.quran.end }, to: { ...e.quran.end } }; })}>+ Set homework for next class</button>
              )}
            </div>
          </div>
        </details>

        {/* Surahs */}
        <details className="sect" {...sectionProps("surah")}>
          <summary><span>Surahs{unrecorded("surah")}</span></summary>
          <div className="body">
            <div>
              <label className="lbl">Current surah</label>
              <select
                value={d.surah.custom ? "custom" : d.surah.trackIndexAtEntry}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === "custom") {
                    patch((e) => { e.surah.custom = true; e.surah.customSurah = e.surah.customSurah ?? 0; });
                  } else {
                    patch((e) => { e.surah.custom = false; e.surah.customSurah = null; e.surah.trackIndexAtEntry = +v; });
                  }
                }}
              >
                {SURAH_TRACK.map((_, i) => <option key={i} value={i}>{surahTrackName(i)}</option>)}
                <option value="custom">Other surah…</option>
              </select>
            </div>
            {d.surah.custom && (
              <div>
                <label className="lbl">Which surah</label>
                <select value={d.surah.customSurah ?? 0} onChange={(ev) => patch((e) => { e.surah.customSurah = +ev.target.value; })}>
                  {SURAHS.map((s, i) => <option key={i} value={i}>{i + 1}. {s.name}</option>)}
                </select>
              </div>
            )}
            <div className="seg warn">
              <button className={d.surah.status === "working" ? "on" : ""} onClick={() => { touch("surah"); patch((e) => { e.surah.status = "working"; }); }}>Still working</button>
              <button className={d.surah.status === "mastered" ? "on" : ""} style={d.surah.status === "mastered" ? { background: "var(--green)" } : undefined} onClick={() => { touch("surah"); patch((e) => { e.surah.status = "mastered"; }); }}>Complete</button>
            </div>
            {sStuck && <div className="warn-box">Same surah as last session and still working.</div>}

            <div className="hw">
              <div className="hw-title">🌟 Homework for next class</div>
              <HomeworkList
                kind="surah"
                items={surahItems}
                auto={d.surah.homework === null}
                options={SURAH_TRACK.map((_, i) => surahTrackName(i))}
                onChange={(next) => patch((e) => { e.surah.homework = next; })}
              />
            </div>
          </div>
        </details>

        {/* Duas */}
        <details className="sect" {...sectionProps("dua")}>
          <summary><span>Duas{unrecorded("dua")}</span></summary>
          <div className="body">
            <div>
              <label className="lbl">Current dua</label>
              <select
                value={d.dua.custom ? "custom" : d.dua.duaIndexAtEntry}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === "custom") {
                    patch((e) => { e.dua.custom = true; e.dua.customDua = e.dua.customDua ?? ""; });
                  } else {
                    patch((e) => { e.dua.custom = false; e.dua.customDua = null; e.dua.duaIndexAtEntry = +v; });
                  }
                }}
              >
                {settings.duaList.map((n, i) => <option key={i} value={i}>{i + 1}. {n}</option>)}
                {!settings.duaList.length && <option value={0}>No duas. Add some in Settings</option>}
                <option value="custom">Other…</option>
              </select>
            </div>
            {d.dua.custom && (
              <div>
                <label className="lbl">Which dua</label>
                <input
                  type="text"
                  value={d.dua.customDua ?? ""}
                  autoFocus
                  placeholder="e.g. Dua for parents"
                  onChange={(ev) => patch((e) => { e.dua.customDua = ev.target.value; })}
                />
              </div>
            )}
            <div className="seg warn">
              <button className={d.dua.status === "working" ? "on" : ""} onClick={() => { touch("dua"); patch((e) => { e.dua.status = "working"; }); }}>Still working</button>
              <button className={d.dua.status === "mastered" ? "on" : ""} style={d.dua.status === "mastered" ? { background: "var(--green)" } : undefined} onClick={() => { touch("dua"); patch((e) => { e.dua.status = "mastered"; }); }}>Complete</button>
            </div>
            {dStuck && <div className="warn-box">Same dua as last session and still working.</div>}

            <div className="hw">
              <div className="hw-title">🌟 Homework for next class</div>
              <HomeworkList
                kind="dua"
                items={duaItems}
                auto={d.dua.homework === null}
                options={settings.duaList}
                onChange={(next) => patch((e) => { e.dua.homework = next; })}
              />
            </div>
          </div>
        </details>

        {/* Textbook */}
        <details className="sect" {...sectionProps("textbook")}>
          <summary><span>Textbook · Chapter {d.textbook.chapter ?? settings.chapter}{unrecorded("textbook")}</span></summary>
          <div className="body">
            <div className="seg">
              {(["done", "partial", "not_done"] as const).map((s) => (
                <button key={s} className={d.textbook.status === s ? "on" : ""} onClick={() => { touch("textbook"); patch((e) => { e.textbook.status = s; }); }}>{textbookLabel(s)}</button>
              ))}
            </div>
            <textarea placeholder="Note (optional)" value={d.textbook.note} onChange={(ev) => patch((e) => { e.textbook.note = ev.target.value; })} />
            {tBehind && <div className="warn-box">Not done for two sessions running. Falling behind.</div>}

            <div className="hw">
              <div className="hw-title">
                🌟 {settings.nextChapter !== null ? `Homework: Move to Chapter ${settings.nextChapter}` : "Homework for next class"}
              </div>
              {settings.nextChapter !== null && (
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Applies to every student automatically. Add a note below only if this student needs something extra.
                </p>
              )}
              <input
                type="text"
                value={d.textbook.homework ?? ""}
                placeholder={settings.nextChapter !== null ? "Extra note (optional)" : "e.g. Finish exercise 3, page 14"}
                onChange={(ev) => patch((e) => { e.textbook.homework = ev.target.value || null; })}
              />
            </div>
          </div>
        </details>

        {/* History */}
        <details className="sect" open={showHist} onToggle={(e) => setShowHist((e.target as HTMLDetailsElement).open)}>
          <summary>Past sessions ({entries.length})</summary>
          <div className="body">
            {!entries.length && <p className="muted" style={{ margin: 0 }}>Nothing saved yet.</p>}
            {sortDesc(entries).map((e) => {
              const duaHw = effectiveDuaHomework(e, settings.duaList);
              const surahHw = effectiveSurahHomework(e);
              const qHw = isRec(e, "quran") ? e.quran.homework : null;
              const textHw = isRec(e, "textbook") ? e.textbook.homework : null;
              const anyHomework = Boolean(qHw || surahHw.length || duaHw.length || textHw);
              return (
                <button key={e.date} className={`hist ${e.date === date ? "cur" : ""}`} onClick={() => goDate(e.date)}>
                  <b>{prettyDate(e.date)}</b>
                  {isRec(e, "quran") && <span>📖 {quranRange(e)}{e.quran.homeworkStatus ? ` · Homework: ${HOMEWORK_STATUS_LABEL[e.quran.homeworkStatus]}` : ""}</span>}
                  {isRec(e, "surah") && <span>🌙 {surahEntryName(e.surah)} · {statusLabel(e.surah.status)}</span>}
                  {isRec(e, "dua") && <span>🤲 {duaName(e.dua)} · {statusLabel(e.dua.status)}</span>}
                  {isRec(e, "textbook") && <span>📝 {textbookLabel(e.textbook.status)}</span>}
                  {anyHomework && (
                    <div className="hw" style={{ marginTop: 6, padding: "8px 10px" }}>
                      <div className="hw-title" style={{ fontSize: "0.8rem" }}>🌟 Homework set</div>
                      {qHw && <span>{trackLabel(e.quran.end.mode)}: {fmtRange(qHw)}</span>}
                      {surahHw.length > 0 && <span>Surah: {surahHw.map((h) => h.name).join(", ")}</span>}
                      {duaHw.length > 0 && <span>Dua: {duaHw.map((h) => h.name).join(", ")}</span>}
                      {textHw && <span>Textbook: {textHw}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      <div className="autosave" aria-live="polite">
        {editingPast
          ? "Past sessions save when you tap Save."
          : autoStatus === "saving"
            ? "Saving…"
            : autoStatus === "error"
              ? "Couldn't save. It will retry on your next change."
              : dirtyNow
                ? "Saving shortly…"
                : "All changes saved"}
      </div>
      <div className="savebar">
        <button className="gold" onClick={() => setShowCard(true)} disabled={!latest}>Parent update</button>
        <button onClick={() => commit(false)} disabled={autoStatus === "saving"}>
          {autoStatus === "saving" ? "Saving…" : editingPast ? "Save this date" : dirtyNow ? "Save now" : "Saved ✓"}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {showCard && latest && (
        <ParentCard
          name={student.name} entry={latest} prior={latestPrior} duaList={settings.duaList}
          chapter={settings.chapter} nextChapter={settings.nextChapter} onClose={() => setShowCard(false)}
        />
      )}
    </>
  );
}
