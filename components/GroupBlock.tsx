"use client";

import { useState, type ReactNode } from "react";
import HomeworkList from "@/components/HomeworkList";
import type { Group, NamedHomework, Student } from "@/lib/types";

interface Props {
  group: Group;
  kind: "surah" | "dua";
  members: Student[];
  everyone: Student[];
  groupNameOf: (studentId: string) => string | null; // the group this student is in for this section
  options: string[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetMember: (studentId: string, inGroup: boolean) => void;
  onApplyHomework: (items: NamedHomework[]) => void;
  children: ReactNode;
}

/**
 * One teaching group in the Surahs or Duas tab: a collapsible block with its students, plus tools to
 * change who is in it and to give the whole group the same homework in one go.
 */
export default function GroupBlock({
  group, kind, members, everyone, groupNameOf, options, onRename, onDelete, onSetMember, onApplyHomework, children,
}: Props) {
  const [open, setOpen] = useState(true);
  const [panel, setPanel] = useState<null | "members" | "homework" | "rename">(null);
  const [name, setName] = useState(group.name);
  const [items, setItems] = useState<NamedHomework[]>([]);
  const toggle = (p: "members" | "homework" | "rename") => {
    setPanel(panel === p ? null : p);
    if (p === "rename") setName(group.name);
    if (p === "homework") setItems([]);
  };
  const n = members.length;

  return (
    <section className="gblock">
      <button type="button" className="plain ghead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ghead-name">{group.name}</span>
        <span className="muted">{n} {n === 1 ? "student" : "students"} <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span></span>
      </button>

      {open && (
        <>
          <div className="gtools">
            <button type="button" className={`small${panel === "homework" ? "" : " ghost"}`} disabled={!n} onClick={() => toggle("homework")}>🌟 Homework</button>
            <button type="button" className={`small${panel === "members" ? "" : " ghost"}`} onClick={() => toggle("members")}>Students</button>
            <button type="button" className={`small${panel === "rename" ? "" : " ghost"}`} onClick={() => toggle("rename")}>Rename</button>
            <button
              type="button"
              className="small ghost"
              onClick={() => { if (window.confirm(`Delete "${group.name}"? Its students become ungrouped; nothing else changes.`)) onDelete(); }}
            >
              Delete
            </button>
          </div>

          {panel === "rename" && (
            <div className="row">
              <input className="grow" type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
              <button type="button" className="small" disabled={!name.trim()} onClick={() => { onRename(name.trim()); setPanel(null); }}>Save</button>
            </div>
          )}

          {panel === "members" && (
            <div className="card stack" style={{ gap: 6 }}>
              {everyone.map((s) => {
                const inGroup = members.some((m) => m.id === s.id);
                const elsewhere = !inGroup ? groupNameOf(s.id) : null;
                return (
                  <div key={s.id} className="gmember">
                    <span>
                      {s.name}
                      {elsewhere && <span className="muted"> · in {elsewhere}</span>}
                    </span>
                    <button type="button" className={`small${inGroup ? "" : " ghost"}`} onClick={() => onSetMember(s.id, !inGroup)}>
                      {inGroup ? "In group ✓" : elsewhere ? "Move here" : "Add"}
                    </button>
                  </div>
                );
              })}
              {!everyone.length && <span className="muted">No students yet.</span>}
            </div>
          )}

          {panel === "homework" && (
            <div className="hw">
              <div className="hw-title">🌟 Homework for {group.name}</div>
              <HomeworkList
                kind={kind}
                items={items}
                auto={false}
                allowAuto={false}
                options={options}
                onChange={(next) => setItems(next ?? [])}
              />
              <div className="muted" style={{ fontSize: "0.8rem" }}>Replaces each student&apos;s current homework. You can still change one student afterwards.</div>
              <button type="button" onClick={() => { onApplyHomework(items); setPanel(null); }}>
                {items.length ? `Give to ${n} ${n === 1 ? "student" : "students"}` : `Clear homework for ${n} ${n === 1 ? "student" : "students"}`}
              </button>
            </div>
          )}

          <div className="stack" style={{ gap: 8 }}>
            {children}
            {!n && <p className="muted" style={{ margin: 0 }}>No students yet. Tap Students to add some.</p>}
          </div>
        </>
      )}
    </section>
  );
}
