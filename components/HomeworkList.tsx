"use client";

import { useState } from "react";
import { SURAHS } from "@/lib/quran";
import type { NamedHomework } from "@/lib/types";

/**
 * Surah/dua homework as a list: tap × to drop one, pick from the dropdown to add another.
 * `auto` means nobody has edited the list yet, so it's just the automatic default (the item the
 * student is still working on); the first edit turns it into an explicit list, and "Use automatic"
 * hands control back.
 */
export default function HomeworkList({
  kind, items, auto, options, onChange,
}: {
  kind: "surah" | "dua";
  items: NamedHomework[];
  auto: boolean;
  options: string[];
  onChange: (next: NamedHomework[] | null) => void;
}) {
  const [other, setOther] = useState(false);
  const [text, setText] = useState("");
  const addable = options.filter((o) => !items.some((i) => i.name === o));

  function add(item: NamedHomework) {
    onChange([...items, item]);
    setOther(false);
    setText("");
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="hwchips">
        {items.length ? (
          items.map((h, i) => (
            <span key={`${h.name}-${i}`} className="hwchip">
              {h.name}
              {!auto && (
                <button type="button" aria-label={`Remove ${h.name}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
              )}
            </span>
          ))
        ) : (
          <span className="muted">None</span>
        )}
      </div>
      {auto && items.length > 0 && <div className="muted" style={{ fontSize: "0.8rem" }}>Automatic while still working. Add another to edit the list.</div>}

      <select
        value=""
        aria-label={`Add ${kind}`}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v === "__other") setOther(true);
          else add({ name: v, custom: false });
        }}
      >
        <option value="">+ Add {kind}…</option>
        {addable.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__other">Other…</option>
      </select>

      {other && kind === "surah" && (
        <select
          value=""
          aria-label="Which surah"
          onChange={(e) => e.target.value && add({ name: SURAHS[+e.target.value].name, custom: true })}
        >
          <option value="">Which surah?</option>
          {SURAHS.map((s, i) => <option key={i} value={i}>{i + 1}. {s.name}</option>)}
        </select>
      )}
      {other && kind === "dua" && (
        <div className="row">
          <input className="grow" type="text" value={text} autoFocus placeholder="e.g. Dua for parents" onChange={(e) => setText(e.target.value)} />
          <button type="button" className="small" disabled={!text.trim()} onClick={() => add({ name: text.trim(), custom: true })}>Add</button>
        </div>
      )}

      {!auto && (
        <button type="button" className="linkbtn" onClick={() => onChange(null)}>Use automatic</button>
      )}
    </div>
  );
}
