"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SectionTab from "@/components/SectionTab";
import { addStudent, getRecentEntries, getSettings, getStudents, saveSettings } from "@/lib/data";
import { daysAgoStr, isRec, todayStr } from "@/lib/logic";
import { setRecent, updateRecent, useRecentEntries } from "@/lib/store";
import type { ClassSettings, Mode, Section, Student } from "@/lib/types";

type Tab = "students" | Section;
const TABS: { id: Tab; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "quran", label: "Qur'an" },
  { id: "surah", label: "Surahs" },
  { id: "dua", label: "Duas" },
  { id: "textbook", label: "Textbook" },
];
const PIPS: { id: Section; letter: string; label: string }[] = [
  { id: "quran", letter: "Q", label: "Qur'an or Qaida" },
  { id: "surah", letter: "S", label: "Surahs" },
  { id: "dua", letter: "D", label: "Duas" },
  { id: "textbook", letter: "T", label: "Textbook" },
];
// Enough history for every student's last homework, without reading the whole collection.
const HISTORY_DAYS = 90;

export default function Home() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [chapter, setChapter] = useState(1);
  const [nextChapter, setNextChapter] = useState<number | null>(null);
  const [settings, setSettings] = useState<ClassSettings | null>(null);
  const entries = useRecentEntries();
  const [tab, setTab] = useState<Tab>("students");
  const [toast, setToast] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("qaida");
  const [editCh, setEditCh] = useState(false);
  const [nextChDraft, setNextChDraft] = useState("");

  async function load() {
    try {
      const [s, st] = await Promise.all([getStudents(), getSettings()]);
      setStudents(s);
      setSettings(st);
      setChapter(st.chapter);
      setNextChapter(st.nextChapter);
    } catch (e) {
      setErr("Couldn't reach the database. Check your Firebase settings and connection.");
      console.error(e);
    }
  }

  // History loads separately so the student list appears straight away; it only feeds the
  // recorded markers and the per-section tabs.
  async function loadEntries() {
    try {
      setRecent(await getRecentEntries(daysAgoStr(HISTORY_DAYS)));
    } catch (e) {
      console.error(e);
    }
  }

  // Everything on this screen is re-read whenever it comes back into view — returning from a
  // student's page, switching back to the app, or the browser restoring the page from its cache —
  // so it can never show a stale copy of what was just saved elsewhere.
  const refresh = () => { load(); loadEntries(); };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    refreshRef.current();
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) refreshRef.current(); };
    const onVisible = () => { if (document.visibilityState === "visible") refreshRef.current(); };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  const patchStudent = (id: string, patch: Partial<Student>) =>
    setStudents((prev) => (prev ? prev.map((s) => (s.id === id ? { ...s, ...patch } : s)) : prev));

  const today = todayStr();
  const todayEntry = (id: string) => entries.find((e) => e.studentId === id && e.date === today);

  const list = useMemo(
    () =>
      (students ?? [])
        .filter((s) => s.active && s.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [students, q],
  );

  async function submitAdd() {
    if (!name.trim()) return;
    await addStudent(name, mode);
    setName(""); setAdding(false);
    load();
  }

  async function submitNextChapter() {
    const trimmed = nextChDraft.trim();
    const n = trimmed ? Math.max(1, parseInt(trimmed, 10) || chapter + 1) : null;
    await saveSettings({ nextChapter: n });
    setNextChapter(n); setEditCh(false);
  }

  return (
    <>
      <div className="topbar">
        <h1>Saturday Class</h1>
        <Link href="/settings" className="btn ghost icon" aria-label="Settings" style={{ border: "1px solid var(--teal)", color: "var(--teal)", background: "transparent" }}>⚙</Link>
      </div>

      <div className="chapter">
        <div>
          Class is currently on<br /><b>Chapter {chapter}</b>
          {nextChapter !== null && <div style={{ fontWeight: 600, fontSize: "0.85rem", opacity: 0.9, marginTop: 2 }}>Up next: Chapter {nextChapter}</div>}
        </div>
        <button className="small" onClick={() => { setNextChDraft(nextChapter !== null ? String(nextChapter) : String(chapter + 1)); setEditCh(true); }}>
          {nextChapter !== null ? "Change" : "Set next"}
        </button>
      </div>

      {editCh && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <label className="lbl">Up next (chapter for next class)</label>
          <input type="number" inputMode="numeric" min={1} value={nextChDraft} onChange={(e) => setNextChDraft(e.target.value)} />
          <p className="muted" style={{ margin: 0 }}>
            Safe to set any time during class — today&apos;s students will still be recorded under Chapter {chapter}. This only takes effect the next time class is logged.
          </p>
          <div className="row">
            <button className="grow" onClick={submitNextChapter}>Save</button>
            {nextChapter !== null && (
              <button className="danger" onClick={async () => { await saveSettings({ nextChapter: null }); setNextChapter(null); setEditCh(false); }}>Clear</button>
            )}
            <button className="ghost grow" onClick={() => setEditCh(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tabbtn${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {err && <div className="warn-box">{err}</div>}
      {!err && students === null && <p className="muted">Loading…</p>}

      {tab === "students" && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="grow" type="text" placeholder="Search students…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="gold" onClick={() => setAdding(true)}>+ Add</button>
          </div>

          {adding && (
            <div className="card stack" style={{ marginBottom: 12 }}>
              <label className="lbl">Student name</label>
              <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
              <label className="lbl">Starting mode</label>
              <div className="seg">
                <button className={mode === "qaida" ? "on" : ""} onClick={() => setMode("qaida")}>Qaida</button>
                <button className={mode === "quran" ? "on" : ""} onClick={() => setMode("quran")}>Qur&apos;an</button>
              </div>
              <div className="row">
                <button className="grow" onClick={submitAdd} disabled={!name.trim()}>Add student</button>
                <button className="ghost grow" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          )}

          {students && !list.length && <p className="muted">{q ? "No matching students." : "No students yet. Tap + Add."}</p>}

          <div className="stack" style={{ gap: 8 }}>
            {list.map((s) => (
              <Link key={s.id} href={`/student/${s.id}`} className="student">
                <span>{s.name}</span>
                <span className="student-side">
                  <span className={`pill ${s.mode === "quran" ? "" : "gold"}`}>{s.mode === "qaida" ? "Qaida" : "Qur'an"}</span>
                  <span className="pips" aria-label="Recorded today">
                    {PIPS.map((p) => {
                      const e = todayEntry(s.id);
                      return <span key={p.id} className={`pip${e && isRec(e, p.id) ? " on" : ""}`} title={p.label}>{p.letter}</span>;
                    })}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab !== "students" && students && settings && (
        <SectionTab
          key={tab}
          section={tab}
          students={students.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name))}
          entries={entries}
          settings={settings}
          setEntries={updateRecent}
          patchStudent={patchStudent}
          notify={notify}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
