"use client";

import { useEffect, useRef, useState } from "react";
import { buildParentUpdate, prettyDate } from "@/lib/logic";
import { renderParentCardImage } from "@/lib/parentImage";
import type { Entry } from "@/lib/types";

type ShareCapability = "share" | "copy" | "download";

function detectCapability(file: File | null): ShareCapability {
  if (typeof navigator === "undefined") return "download";
  if (file && "canShare" in navigator && navigator.canShare?.({ files: [file] })) return "share";
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard) return "copy";
  return "download";
}

export default function ParentCard({
  name, entry, prior, duaList, chapter, nextChapter, onClose,
}: {
  name: string; entry: Entry; prior: Entry | undefined; duaList: string[]; chapter: number;
  nextChapter: number | null; onClose: () => void;
}) {
  const { blocks, plain } = buildParentUpdate(name, entry, prior, duaList, chapter, nextChapter);
  const [copiedText, setCopiedText] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgStatus, setImgStatus] = useState<"loading" | "ready" | "error">("loading");
  const [action, setAction] = useState<"idle" | "done" | "error">("idle");
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImgStatus("loading");
    renderParentCardImage(name, `Session of ${prettyDate(entry.date)}`, blocks)
      .then((blob) => {
        if (cancelled) return;
        const file = new File([blob], `${name.replace(/\s+/g, "-")}-${entry.date}.png`, { type: "image/png" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setImgFile(file);
        setImgUrl(url);
        setImgStatus("ready");
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setImgStatus("error");
      });
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // entry.date is a stable stand-in for the entry identity within this card's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.date]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = plain;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  }

  async function handleImageAction() {
    if (!imgFile || !imgUrl) return;
    const capability = detectCapability(imgFile);
    setAction("idle");
    try {
      if (capability === "share") {
        await navigator.share({ files: [imgFile], title: `${name}'s update` });
      } else if (capability === "copy") {
        await navigator.clipboard.write([new ClipboardItem({ [imgFile.type]: imgFile })]);
        setAction("done");
        setTimeout(() => setAction("idle"), 2000);
      } else {
        const a = document.createElement("a");
        a.href = imgUrl;
        a.download = imgFile.name;
        a.click();
      }
    } catch (e) {
      // AbortError just means the user cancelled the share sheet — not a failure.
      if ((e as Error)?.name === "AbortError") return;
      console.error(e);
      setAction("error");
    }
  }

  const capability = detectCapability(imgFile);
  const actionLabel = capability === "share" ? "Share image" : capability === "copy" ? "Copy image" : "Download image";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h2>{name}</h2>
            <div className="muted">Session of {prettyDate(entry.date)}</div>
          </div>
          <button className="ghost small" onClick={onClose}>Close</button>
        </div>

        {imgStatus === "ready" && imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={`${name}'s parent update`} style={{ width: "100%", borderRadius: 12, border: "1px solid var(--line)" }} />
        )}
        {imgStatus === "loading" && <p className="muted" style={{ margin: 0 }}>Preparing image…</p>}
        {imgStatus === "error" && <div className="warn-box">Couldn&apos;t generate the image. The text version below still works.</div>}

        {imgStatus === "ready" && (
          <>
            <button className="gold" onClick={handleImageAction}>
              {action === "done" ? "Copied ✓" : actionLabel}
            </button>
            {action === "error" && <div className="warn-box">Couldn&apos;t do that automatically — long-press the image above to save or share it instead.</div>}
          </>
        )}

        {blocks.map((b) => (
          <div key={b.title} className={`pblock ${b.kind}`}>
            <span className="tone-badge">{b.tone === "good" ? "✅" : "🟠"}</span>
            <h3>{b.title}</h3>
            <p>{b.text}</p>
          </div>
        ))}

        <label className="lbl">WhatsApp text (fallback)</label>
        <pre className="plain">{plain}</pre>
        <button className="ghost" onClick={copyText}>{copiedText ? "Copied ✓" : "Copy text"}</button>

        <p className="muted" style={{ margin: 0 }}>Review before sending. Nothing is sent automatically.</p>
      </div>
    </div>
  );
}
