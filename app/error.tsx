"use client";

import Link from "next/link";

// Next.js renders this in place of a page whenever something throws during render — a safety
// net so a bug or unexpected data shape shows a recoverable screen instead of a blank/broken
// page. "Try again" re-renders the same page; "Back to students" is the reliable escape hatch.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="stack" style={{ marginTop: 40 }}>
      <h1>Something went wrong</h1>
      <p className="muted">
        Sorry about that — this screen hit a problem and couldn&apos;t load. Nothing you&apos;ve
        already saved is affected.
      </p>
      {error.message && <p className="muted" style={{ fontSize: "0.85rem" }}>{error.message}</p>}
      <div className="row">
        <button className="grow" onClick={reset}>Try again</button>
        <Link href="/" className="btn ghost grow" style={{ textAlign: "center" }}>Back to students</Link>
      </div>
    </div>
  );
}
