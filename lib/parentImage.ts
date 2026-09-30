import type { ParentBlock } from "./logic";

// Mirrors the color tokens in app/globals.css. Canvas can't read CSS variables,
// so these are kept in sync by hand — update both places together.
const COLORS = {
  bg: "#f7f5f0",
  ink: "#1f2a2b",
  muted: "#6b7778",
  tealDark: "#0a3b3f",
  green: "#2f7d4f",
  greenSoft: "#dfeee4",
  gold: "#b8923a",
  goldSoft: "#f4ead2",
};

const WIDTH = 640;
const PAD = 22;
const BLOCK_PAD = 16;
const ACCENT_W = 6;
const GAP = 12;
const FONT = "Manrope, system-ui, sans-serif";

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(attempt).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Wraps text to fit maxWidth, honoring explicit "\n" line breaks (e.g. the homework bubble's list). */
function wrapMultiline(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return text.split("\n").flatMap((para) => wrapText(ctx, para, maxWidth));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders the parent update as a PNG, sized for sharing into WhatsApp/etc. */
export async function renderParentCardImage(name: string, dateLabel: string, blocks: ParentBlock[]): Promise<Blob> {
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* fall back to default font metrics */ }
  }

  const measure = document.createElement("canvas").getContext("2d")!;
  const innerW = WIDTH - PAD * 2;
  const textW = innerW - BLOCK_PAD * 2 - ACCENT_W;

  const layout = blocks.map((b) => {
    measure.font = `500 15px ${FONT}`;
    const lines = wrapMultiline(measure, b.text, textW);
    const titleH = 22;
    const lineH = 21;
    return { ...b, lines, height: BLOCK_PAD * 2 + titleH + 4 + lines.length * lineH };
  });

  const headerH = 30 + 22 + 16;
  const blocksH = layout.reduce((s, b) => s + b.height, 0) + GAP * Math.max(layout.length - 1, 0);
  const totalH = Math.ceil(PAD + headerH + blocksH + PAD);

  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * dpr;
  canvas.height = totalH * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "top";

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, totalH);

  let y = PAD;
  ctx.fillStyle = COLORS.tealDark;
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText(name, PAD, y);
  y += 30;

  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(dateLabel, PAD, y);
  y += 22 + 16;

  for (const b of layout) {
    const accent = b.tone === "good" ? COLORS.green : COLORS.gold;
    const soft = b.tone === "good" ? COLORS.greenSoft : COLORS.goldSoft;

    roundRect(ctx, PAD, y, innerW, b.height, 10);
    ctx.fillStyle = soft;
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(PAD, y, ACCENT_W, b.height);

    let by = y + BLOCK_PAD;
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(b.title, PAD + BLOCK_PAD + ACCENT_W, by);
    by += 22 + 4;

    ctx.font = `500 15px ${FONT}`;
    for (const line of b.lines) {
      ctx.fillText(line, PAD + BLOCK_PAD + ACCENT_W, by);
      by += 21;
    }

    y += b.height + GAP;
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))), "image/png");
  });
}
