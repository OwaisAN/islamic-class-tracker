"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ParentCard from "@/components/ParentCard";
import PosPicker from "@/components/PosPicker";
import { getEntries, getSettings, getStudent, saveEntry, updateStudent } from "@/lib/data";
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from "@/lib/localDraft";
import {
  computeDuaIndex, computeSurahTrackIndex, defaultDuaIndex, defaultStart, defaultSurahTrackIndex, duaEntryName,
  duaStuck, fmtPos, homeworkTarget, HOMEWORK_STATUS_LABEL, prettyDate, priorEntries, quranRange, quranStuck,
  sortDesc, surahEntryName, surahStuck, textbookBehind, textbookLabel, todayStr,
} from "@/lib/logic";
import { ISSUES, LETTERS, SURAHS, SURAH_TRACK, surahTrackName } from "@/lib/quran";
import type { ClassSettings, Entry, HomeworkStatus, Mode, Student } from "@/lib/types";

function buildDraft(studentId: string, date: string, entries: Entry[], student: Student, settings: ClassSettings): Entry {
  const existing = entries.find((e) => e.date === date);
  if (existing) return structuredClone(existing);
  const prior = priorEntries(entries, date)[0];
  const start = defaultStart(prior, student.mode);
  return {
    studentId,
    date,
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

/** The default draft, or a locally-saved unsaved draft if one differs from it. */
function resolveDraft(studentId: string, date: string, entries: Entry[], student: Student, settings: ClassSettings) {
  const base = buildDraft(studentId, date, entries, student, settings);
  const local = loadLocalDraft(studentId, date);
  if (local && JSON.stringify(local) !== JSON.stringify(base)) return { draft: local, restored: true };
  return { draft: base, restored: false };
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
  const [endTouched, setEndTouched] = useState(false);
  const [restored, setRestored] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, st, en] = await Promise.all([getStudent(id), getSettings(), getEntries(id)]);
        if (!s) { setErr("Student not found."); return; }
        setStudent(s); setSettings(st); setEntries(en);
        const { draft: d0, restored: r0 } = resolveDraft(id, today, en, s, st);
        setDraft(d0);
        setRestored(r0);
        setEndTouched(en.some((e) => e.date === today));
      } catch (e) {
        setErr("Couldn't reach the database.");
        console.error(e);
      }
    })();
  }, [id, today]);

  const priors = useMemo(() => (draft ? priorEntries(entries, draft.date) : []), [entries, draft]);
  const prior = priors[0];
  const latest = useMemo(() => sortDesc(entries)[0], [entries]);
  const latestPrior = latest ? priorEntries(entries, latest.date)[0] : undefined;

  if (err) return <><Link href="/" className="back">← Students</Link><div className="warn-box">{err}</div></>;
  if (!student || !settings || !draft) return <p className="muted">Loading…</p>;

  const d = draft;
  const editingPast = date !== today;
  const patch = (fn: (e: Entry) => void) => setDraft((cur) => {
    const c = structuredClone(cur!);
    fn(c);
    saveLocalDraft(c);
    return c;
  });

  function goDate(newDate: string) {
    setDate(newDate);
    const { draft: d1, restored: r1 } = resolveDraft(id, newDate, entries, student!, settings!);
    setDraft(d1);
    setRestored(r1);
    setEndTouched(entries.some((e) => e.date === newDate));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function discardLocalDraft() {
    clearLocalDraft(id, date);
    setDraft(buildDraft(id, date, entries, student!, settings!));
    setRestored(false);
  }

  async function switchMode() {
    const next: Mode = student!.mode === "qaida" ? "quran" : "qaida";
    await updateStudent(id, { mode: next });
    const s2 = { ...student!, mode: next };
    setStudent(s2);
    if (!editingPast) {
      // Re-point today's draft at the new mode; history is untouched.
      const start = defaultStart(prior, next);
      patch((e) => {
        e.quran.start = start;
        e.quran.end = { ...start };
        e.quran.homeworkStatus = null; // last homework was set in the old mode, no longer comparable
      });
      setEndTouched(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const duaCount = settings!.duaList.length;
      const toSave: Entry = structuredClone(d);
      if (!toSave.dua.custom) toSave.dua.duaNameAtEntry = settings!.duaList[toSave.dua.duaIndexAtEntry] ?? null;
      const all = await saveEntry(toSave, entries, duaCount);
      setEntries(all);
      setDraft(toSave);
      clearLocalDraft(id, toSave.date);
      setRestored(false);
      const duaIdx = computeDuaIndex(all, duaCount);
      const surahIdx = computeSurahTrackIndex(all);
      setStudent((cur) => (cur ? { ...cur, duaIndex: duaIdx ?? cur.duaIndex, surahTrackIndex: surahIdx ?? cur.surahTrackIndex } : cur));
      setToast(`Saved for ${student!.name} · ${prettyDate(toSave.date)}`);
      setTimeout(() => setToast(""), 2200);
    } catch (e) {
      console.error(e);
      setToast("Save failed. Check connection.");
      setTimeout(() => setToast(""), 3000);
    }
    setSaving(false);
  }

  async function archive() {
    if (!confirm(`Archive ${student!.name}? You can reactivate them in Settings.`)) return;
    await updateStudent(id, { active: false });
    router.push("/");
  }

  const qStuck = endTouched && quranStuck(d.quran.end, prior);
  const dStuck = duaStuck(d.dua, prior);
  const sStuck = surahStuck(d.surah, prior);
  const tBehind = textbookBehind(priors);
  const duaName = (dua: Entry["dua"]) => duaEntryName(dua, settings.duaList);
  const hwTarget = homeworkTarget(prior, d.quran.start.mode);

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
            <div>📖 {quranRange(prior)}</div>
            {hwTarget && <div>🎯 Qur&apos;an homework: {fmtPos(hwTarget)}</div>}
            <div>📗 {surahEntryName(prior.surah)} · {prior.surah.status === "mastered" ? "Mastered" : "Still working"}</div>
            {prior.surah.homework && <div>🎯 Surah homework: {prior.surah.homework.name}</div>}
            <div>🤲 {duaName(prior.dua)} · {prior.dua.status === "mastered" ? "Mastered" : "Still working"}</div>
            {prior.dua.homework && <div>🎯 Dua homework: {prior.dua.homework.name}</div>}
            <div>📚 Textbook: {textbookLabel(prior.textbook.status)}</div>
            {prior.textbook.homework && <div>🎯 Textbook homework: {prior.textbook.homework}</div>}
          </>
        ) : <div className="muted">No earlier sessions yet.</div>}
      </div>

      <div className="stack">
        {/* Qur'an */}
        <details className="sect" open>
          <summary>Qur&apos;an</summary>
          <div className="body">
            {hwTarget && (
              <div className="summary">
                <b>🎯 Homework was: {fmtPos(hwTarget)}</b>
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
                          if (s === "completed") { e.quran.end = { ...hwTarget }; }
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
                <button className={!d.quran.hesitation ? "on" : ""} style={!d.quran.hesitation ? { background: "var(--green)" } : undefined} onClick={() => patch((e) => { e.quran.hesitation = false; })}>Fluent</button>
                <button className={d.quran.hesitation ? "on" : ""} onClick={() => patch((e) => { e.quran.hesitation = true; })}>Hesitant</button>
              </div>
            </div>

            <div>
              <label className="lbl">Note (optional)</label>
              <textarea value={d.quran.note} onChange={(ev) => patch((e) => { e.quran.note = ev.target.value; })} />
            </div>

            <div>
              <label className="lbl">Homework for next class</label>
              {d.quran.homework ? (
                <div className="stack" style={{ gap: 8 }}>
                  <PosPicker label="Read up to" pos={d.quran.homework} onChange={(p) => patch((e) => { e.quran.homework = p; })} />
                  <button className="ghost small" onClick={() => patch((e) => { e.quran.homework = null; })}>Remove homework</button>
                </div>
              ) : (
                <button className="ghost" onClick={() => patch((e) => { e.quran.homework = { ...e.quran.end }; })}>+ Set homework for next class</button>
              )}
            </div>
          </div>
        </details>

        {/* Surahs */}
        <details className="sect">
          <summary>Surahs</summary>
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
              <button className={d.surah.status === "working" ? "on" : ""} onClick={() => patch((e) => { e.surah.status = "working"; })}>Still working</button>
              <button className={d.surah.status === "mastered" ? "on" : ""} style={d.surah.status === "mastered" ? { background: "var(--green)" } : undefined} onClick={() => patch((e) => { e.surah.status = "mastered"; })}>Mastered</button>
            </div>
            {sStuck && <div className="warn-box">Same surah as last session and still working.</div>}

            <div>
              <label className="lbl">Homework for next class (optional)</label>
              <select
                value={!d.surah.homework ? "none" : d.surah.homework.custom ? "custom" : d.surah.homework.name}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === "none") patch((e) => { e.surah.homework = null; });
                  else if (v === "custom") patch((e) => { e.surah.homework = { name: SURAHS[0].name, custom: true }; });
                  else patch((e) => { e.surah.homework = { name: v, custom: false }; });
                }}
              >
                <option value="none">No homework</option>
                {SURAH_TRACK.map((_, i) => <option key={i} value={surahTrackName(i)}>{surahTrackName(i)}</option>)}
                <option value="custom">Other surah…</option>
              </select>
            </div>
            {d.surah.homework?.custom && (
              <div>
                <label className="lbl">Which surah</label>
                <select
                  value={SURAHS.findIndex((s) => s.name === d.surah.homework?.name)}
                  onChange={(ev) => patch((e) => { e.surah.homework = { name: SURAHS[+ev.target.value].name, custom: true }; })}
                >
                  {SURAHS.map((s, i) => <option key={i} value={i}>{i + 1}. {s.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </details>

        {/* Duas */}
        <details className="sect">
          <summary>Duas</summary>
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
              <button className={d.dua.status === "working" ? "on" : ""} onClick={() => patch((e) => { e.dua.status = "working"; })}>Still working</button>
              <button className={d.dua.status === "mastered" ? "on" : ""} style={d.dua.status === "mastered" ? { background: "var(--green)" } : undefined} onClick={() => patch((e) => { e.dua.status = "mastered"; })}>Mastered</button>
            </div>
            {dStuck && <div className="warn-box">Same dua as last session and still working.</div>}

            <div>
              <label className="lbl">Homework for next class (optional)</label>
              <select
                value={!d.dua.homework ? "none" : d.dua.homework.custom ? "custom" : d.dua.homework.name}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === "none") patch((e) => { e.dua.homework = null; });
                  else if (v === "custom") patch((e) => { e.dua.homework = { name: "", custom: true }; });
                  else patch((e) => { e.dua.homework = { name: v, custom: false }; });
                }}
              >
                <option value="none">No homework</option>
                {settings.duaList.map((n, i) => <option key={i} value={n}>{n}</option>)}
                <option value="custom">Other…</option>
              </select>
            </div>
            {d.dua.homework?.custom && (
              <div>
                <label className="lbl">Which dua</label>
                <input
                  type="text"
                  value={d.dua.homework.name}
                  autoFocus
                  placeholder="e.g. Dua for parents"
                  onChange={(ev) => patch((e) => { e.dua.homework = { name: ev.target.value, custom: true }; })}
                />
              </div>
            )}
          </div>
        </details>

        {/* Textbook */}
        <details className="sect">
          <summary>Textbook · Chapter {d.textbook.chapter ?? settings.chapter}</summary>
          <div className="body">
            <div className="seg">
              {(["done", "partial", "not_done"] as const).map((s) => (
                <button key={s} className={d.textbook.status === s ? "on" : ""} onClick={() => patch((e) => { e.textbook.status = s; })}>{textbookLabel(s)}</button>
              ))}
            </div>
            <textarea placeholder="Note (optional)" value={d.textbook.note} onChange={(ev) => patch((e) => { e.textbook.note = ev.target.value; })} />
            {tBehind && <div className="warn-box">Not done for two sessions running. Falling behind.</div>}

            <div>
              <label className="lbl">Homework for next class (optional)</label>
              <input
                type="text"
                value={d.textbook.homework ?? ""}
                placeholder="e.g. Finish exercise 3, page 14"
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
            {sortDesc(entries).map((e) => (
              <button key={e.date} className={`hist ${e.date === date ? "cur" : ""}`} onClick={() => goDate(e.date)}>
                <b>{prettyDate(e.date)}</b>
                <span>📖 {quranRange(e)}{e.quran.homeworkStatus ? ` · Homework: ${HOMEWORK_STATUS_LABEL[e.quran.homeworkStatus]}` : ""}</span>
                {e.quran.homework && <span>🎯 Set homework: {fmtPos(e.quran.homework)}</span>}
                <span>📗 {surahEntryName(e.surah)} · {e.surah.status === "mastered" ? "Mastered" : "Working"}{e.surah.homework ? ` · Homework: ${e.surah.homework.name}` : ""}</span>
                <span>🤲 {duaName(e.dua)} · {e.dua.status === "mastered" ? "Mastered" : "Working"}{e.dua.homework ? ` · Homework: ${e.dua.homework.name}` : ""}</span>
                <span>📚 {textbookLabel(e.textbook.status)}{e.textbook.homework ? ` · Homework: ${e.textbook.homework}` : ""}</span>
              </button>
            ))}
          </div>
        </details>
      </div>

      <div className="savebar">
        <button className="gold" onClick={() => setShowCard(true)} disabled={!latest}>Parent update</button>
        <button onClick={save} disabled={saving}>{saving ? "Saving…" : editingPast ? "Save this date" : "Save session"}</button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {showCard && latest && (
        <ParentCard name={student.name} entry={latest} prior={latestPrior} duaList={settings.duaList} chapter={settings.chapter} onClose={() => setShowCard(false)} />
      )}
    </>
  );
}
