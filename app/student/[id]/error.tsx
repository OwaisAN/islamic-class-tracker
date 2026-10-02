"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { clearLocalDraft } from "@/lib/localDraft";
import { todayStr } from "@/lib/logic";

// Catches a render crash on this page specifically. The most likely cause historically has been
// a stale cached draft in local storage from before a data shape changed — "Clear cached draft"
// gives a one-tap fix for that without the teacher needing to know what local storage is.
export default function StudentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { id } = useParams<{ id: string }>();
  const [cleared, setCleared] = useState(false);

  function handleClear() {
    // We don't know which date was open, so clear today's — by far the common case — and
    // let the teacher navigate to a specific past date again if that was the one that broke.
    clearLocalDraft(id, todayStr());
    setCleared(true);
  }

  return (
    <div className="stack" style={{ marginTop: 40 }}>
      <h1>This student&apos;s page hit a problem</h1>
      <p className="muted">
        Nothing you&apos;ve already saved is affected. This is usually caused by a cached draft
        left over from before an update — clearing it below almost always fixes it.
      </p>
      {error.message && <p className="muted" style={{ fontSize: "0.85rem" }}>{error.message}</p>}
      <div className="row">
        <button className="grow" onClick={() => { handleClear(); reset(); }}>
          {cleared ? "Cleared ✓ — try again" : "Clear cached draft & try again"}
        </button>
      </div>
      <div className="row">
        <button className="ghost grow" onClick={reset}>Try again without clearing</button>
        <Link href="/" className="btn ghost grow" style={{ textAlign: "center" }}>Back to students</Link>
      </div>
    </div>
  );
}
