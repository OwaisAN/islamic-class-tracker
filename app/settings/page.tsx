"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSettings, getStudents, saveSettings, updateStudent } from "@/lib/data";
import type { Student } from "@/lib/types";

export default function Settings() {
  const [duas, setDuas] = useState<string[] | null>(null);
  const [newDua, setNewDua] = useState("");
  const [archived, setArchived] = useState<Student[]>([]);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const [s, students] = await Promise.all([getSettings(), getStudents()]);
      setDuas(s.duaList);
      setArchived(students.filter((x) => !x.active).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setErr("Couldn't reach the database.");
      console.error(e);
    }
  }
  useEffect(() => { load(); }, []);

  async function persist(list: string[]) {
    setDuas(list);
    await saveSettings({ duaList: list });
  }

  async function remove(i: number) {
    if (!duas) return;
    if (!confirm(`Remove "${duas[i]}"? Students' saved dua positions are stored by list position, so later duas shift up by one.`)) return;
    await persist(duas.filter((_, j) => j !== i));
  }

  async function add() {
    if (!duas || !newDua.trim()) return;
    await persist([...duas, newDua.trim()]);
    setNewDua("");
  }

  async function reactivate(id: string) {
    await updateStudent(id, { active: true });
    load();
  }

  return (
    <>
      <div className="topbar">
        <Link href="/" className="back">← Students</Link>
        <h1>Settings</h1>
      </div>
      {err && <div className="warn-box">{err}</div>}

      <div className="card stack" style={{ marginBottom: 14 }}>
        <h2>Dua list (in order)</h2>
        {duas === null && <p className="muted">Loading…</p>}
        {duas?.map((d, i) => (
          <div key={i} className="row">
            <span className="pill">{i + 1}</span>
            <span className="grow">{d}</span>
            <button className="danger small" onClick={() => remove(i)}>Remove</button>
          </div>
        ))}
        <div className="row">
          <input className="grow" type="text" placeholder="New dua name" value={newDua} onChange={(e) => setNewDua(e.target.value)} />
          <button onClick={add} disabled={!newDua.trim()}>Add</button>
        </div>
      </div>

      <div className="card stack">
        <h2>Archived students</h2>
        {!archived.length && <p className="muted">None.</p>}
        {archived.map((s) => (
          <div key={s.id} className="row">
            <span className="grow">{s.name}</span>
            <button className="small" onClick={() => reactivate(s.id)}>Reactivate</button>
          </div>
        ))}
      </div>
    </>
  );
}
