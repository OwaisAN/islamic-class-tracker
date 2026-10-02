"use client";

import { QAIDA_LINES, QAIDA_PAGES, SURAHS } from "@/lib/quran";
import type { Position } from "@/lib/types";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default function PosPicker({
  label, pos, onChange,
}: { label: string; pos: Position; onChange: (p: Position) => void }) {
  if (!pos) return null; // defensive: a malformed/stale draft shouldn't crash the whole page
  if (pos.mode === "qaida") {
    return (
      <div>
        <label className="lbl">{label}</label>
        <div className="pair">
          <select aria-label={`${label} page`} value={pos.page ?? 1} onChange={(e) => onChange({ ...pos, page: +e.target.value })}>
            {range(QAIDA_PAGES).map((n) => <option key={n} value={n}>Page {n}</option>)}
          </select>
          <select aria-label={`${label} line`} value={pos.line ?? 1} onChange={(e) => onChange({ ...pos, line: +e.target.value })}>
            {range(QAIDA_LINES).map((n) => <option key={n} value={n}>Line {n}</option>)}
          </select>
        </div>
      </div>
    );
  }
  const surah = SURAHS[pos.surah ?? 0] ? pos.surah ?? 0 : 0; // clamp an out-of-range index rather than crash
  const maxAyah = SURAHS[surah].ayahs;
  return (
    <div>
      <label className="lbl">{label}</label>
      <div className="pair">
        <select
          aria-label={`${label} surah`}
          value={surah}
          onChange={(e) => {
            const s = +e.target.value;
            onChange({ ...pos, surah: s, ayah: Math.min(pos.ayah ?? 1, SURAHS[s].ayahs) });
          }}
        >
          {SURAHS.map((s, i) => <option key={i} value={i}>{i + 1}. {s.name}</option>)}
        </select>
        <select aria-label={`${label} ayah`} value={Math.min(pos.ayah ?? 1, maxAyah)} onChange={(e) => onChange({ ...pos, ayah: +e.target.value })}>
          {range(maxAyah).map((n) => <option key={n} value={n}>Ayah {n}</option>)}
        </select>
      </div>
    </div>
  );
}
