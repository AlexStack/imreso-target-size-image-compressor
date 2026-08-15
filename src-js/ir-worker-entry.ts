/**
 * ImageResizer.cc — module Web Worker engine.
 *
 * Runs the whole compress pipeline off the main thread so wp-admin never
 * freezes. The shared ImageResizer.cc engine (src/lib/engine/process.ts) is
 * DOM-coupled (document.createElement('canvas'), new Image()), so it cannot run
 * in a worker as-is. This is a focused, worker-safe reimplementation covering
 * exactly the v1 MVP scope — resize (max-dimension) + format + quality — using
 * OffscreenCanvas and the same @jsquash WASM codecs.
 *
 * Spike A: @jsquash codecs resolve their wasm via
 *   new URL("avif_enc.wasm", import.meta.url)
 * in the single-threaded branch (taken automatically when SharedArrayBuffer is
 * unavailable, i.e. no COOP/COEP — exactly the WordPress case). esbuild's file
 * loader rewrites that URL to point next to this bundle, so the wasm loads with
 * zero server config and works on Safari/iOS.
 */

import { OUTPUT_MIME, sniff } from './format';

/** Output format the encoder branch understands (no 'auto'/'png' here). */
type EncodeFormat = 'avif' | 'webp' | 'jpeg';

interface WorkerOpts {
  /** auto | jpeg | webp | avif (string from PHP settings). */
  format: string;
  /** 1-100. Used when targetBytes is 0/unset. */
  quality: number;
  /** Longest-edge cap in px; 0 = no limit. */
  maxDim: number;
  /** Target output size in bytes; >0 enables the exact-size quality search. */
  targetBytes?: number;
  /** Set on mobile: never emit AVIF (slow/OOM single-threaded). */
  noAvif?: boolean;
}

interface RequestMsg {
  id: number;
  file: File;
  opts: WorkerOpts;
}

interface DoneMsg {
  id: number;
  blob?: Blob;
  meta?: { w: number; h: number; format: string };
  error?: string;
}

const AVIF_SPEED = 8; // 0 slowest/best … 10 fastest. Matches engine default.

/**
 * Directory holding this bundle (build/), where the build step copies the codec
 * .wasm files. Computed once from the entry module's URL. We hand this to each
 * codec's init({ locateFile }) so the emscripten glue fetches the wasm from a
 * known absolute URL instead of its bare `new URL("x.wasm", import.meta.url)`
 * path (which esbuild cannot rewrite for a bare specifier, and which would
 * otherwise resolve next to a split chunk rather than the bundle root).
 */
const WASM_BASE = new URL('.', import.meta.url).href;
const locateFile = (path: string): string => WASM_BASE + path;

// Per-format init promises so each codec wasm instantiates exactly once.
let avifInit: Promise<unknown> | null = null;
let webpInit: Promise<unknown> | null = null;
let jpegInit: Promise<unknown> | null = null;

self.onmessage = async (e: MessageEvent<RequestMsg>) => {
  const { id, file, opts } = e.data;
  try {
    const result = await compress(file, opts);
    const msg: DoneMsg = { id, blob: result.blob, meta: result.meta };
    (self as unknown as Worker).postMessage(msg);
  } catch (err) {
    const msg: DoneMsg = { id, error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};

/** Decode → (optional) downscale → encode. All in-worker. */
async function compress(
  file: File,
  opts: WorkerOpts,
): Promise<{ blob: Blob; meta: { w: number; h: number; format: string } }> {
  const bitmap = await decode(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, opts.maxDim);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw once on a transparent canvas, then decide the format from the actual
  // pixels (alpha + photographic). This works for every decoded source —
  // JPEG/PNG/WebP/AVIF/BMP/TIFF/HEIC — without trusting the input MIME.
  ctx.drawImage(bitmap, 0, 0, width, height);
  let imageData = ctx.getImageData(0, 0, width, height);
  const alpha = hasAlphaPixels(imageData);
  const format = resolveFormat(opts, imageData, alpha);

  // JPEG can't store alpha → re-render over white before encoding.
  if (format === 'jpeg' && alpha) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    imageData = ctx.getImageData(0, 0, width, height);
  }
  bitmap.close?.();

  // Exact-size mode (when a target is set): binary-search the quality axis for
  // the largest output that still fits the target — identical to the website's
  // engine (searchExactSize). Otherwise encode once at the fixed quality.
  let blob: Blob;
  if (opts.targetBytes && opts.targetBytes > 0) {
    const tried = new Map<number, Blob>();
    const res = await searchExactSize(async (q) => {
      const b = await encode(imageData, format, q);
      tried.set(q, b);
      return b.size;
    }, opts.targetBytes);
    blob = tried.get(res.quality) ?? (await encode(imageData, format, res.quality));
  } else {
    blob = await encode(imageData, format, clamp(opts.quality, 1, 100));
  }
  return { blob, meta: { w: width, h: height, format } };
}

// Quality-search defaults — mirror ENGINE_DEFAULTS.qualitySearch on the website.
const SIZE_MIN = 5;
const SIZE_MAX = 100;
const SIZE_MAX_PASSES = 7;
const SIZE_ACCEPT_RATIO = 0.9;

/**
 * Search the quality axis for the largest output ≤ targetBytes, falling back to
 * the closest attempt. Log-size interpolation once bracketed, early-out within
 * acceptRatio. Faithful port of the website's searchExactSize.
 */
async function searchExactSize(
  encodeAt: (quality: number) => Promise<number>,
  targetBytes: number,
): Promise<{ quality: number; size: number; passes: number }> {
  let lo = SIZE_MIN;
  let hi = SIZE_MAX;
  let passes = 0;
  let best: { quality: number; size: number } | null = null;
  let closest: { quality: number; size: number } | null = null;
  let under: { quality: number; size: number } | null = null;
  let over: { quality: number; size: number } | null = null;

  while (lo <= hi && passes < SIZE_MAX_PASSES) {
    let q: number;
    if (under && over && under.size > 0 && over.size > under.size) {
      const t = Math.log(targetBytes / under.size) / Math.log(over.size / under.size);
      q = Math.min(hi, Math.max(lo, Math.round(under.quality + t * (over.quality - under.quality))));
    } else {
      q = Math.round((lo + hi) / 2);
    }
    const size = await encodeAt(q);
    passes++;
    if (closest === null || Math.abs(size - targetBytes) < Math.abs(closest.size - targetBytes)) {
      closest = { quality: q, size };
    }
    if (size <= targetBytes) {
      best = { quality: q, size };
      if (size >= targetBytes * SIZE_ACCEPT_RATIO) break;
      under = { quality: q, size };
      lo = q + 1;
    } else {
      over = { quality: q, size };
      hi = q - 1;
    }
  }
  const pick = best ?? (closest as { quality: number; size: number });
  return { quality: pick.quality, size: pick.size, passes };
}

/**
 * Decode a File to an ImageBitmap inside the worker. Covers every raster format
 * the site supports that can be decoded WITHOUT the DOM:
 *  - HEIC/HEIF (iPhone): heic-to's worker-safe `bitmap` path (libheif WASM, CSP
 *    build, no unsafe-eval) — a ~2.9 MB lazy chunk fetched only on first HEIC.
 *  - TIFF: utif2 (pure-JS) → ImageData → bitmap — a lazy chunk fetched on first TIFF.
 *  - JPEG/PNG/WebP/AVIF/BMP: native createImageBitmap (works in workers).
 * SVG (vector), animated GIF (would lose frames) and JP2 (no cross-browser
 * worker decode) are filtered out upstream in worker-client's shouldCompress().
 */
async function decode(file: File): Promise<ImageBitmap> {
  const kind = await sniffKind(file);
  if (kind === 'heic') {
    const { heicTo } = await import('heic-to/csp');
    return (await heicTo({ blob: file, type: 'bitmap' })) as ImageBitmap;
  }
  if (kind === 'tiff') {
    const UTIF = (await import('utif2')).default;
    const buf = await file.arrayBuffer();
    const ifds = UTIF.decode(buf);
    UTIF.decodeImage(buf, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const { width, height } = ifds[0] as unknown as { width: number; height: number };
    return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), width, height));
  }
  return createImageBitmap(file);
}

/** Resolve the input kind: MIME/extension first (cheap), then magic-byte sniff. */
async function sniffKind(file: File): Promise<string> {
  if (/^image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return 'heic';
  if (/^image\/tiff/i.test(file.type) || /\.tiff?$/i.test(file.name)) return 'tiff';
  try {
    const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    return sniff(header);
  } catch {
    return 'unknown';
  }
}

/** Longest-edge cap, never upscaling. Returns integer dims. */
function fitWithin(w: number, h: number, maxDim: number): { width: number; height: number } {
  if (!maxDim || maxDim <= 0) return { width: w, height: h };
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { width: w, height: h };
  const scale = maxDim / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Resolve the concrete encoder. 'auto' mirrors the engine heuristic:
 * alpha → WebP, photographic → AVIF, else JPEG. On mobile (noAvif) any AVIF
 * choice is downgraded to WebP to avoid slow/OOM single-threaded AVIF encodes.
 */
function resolveFormat(opts: WorkerOpts, imageData: ImageData, hasAlpha: boolean): EncodeFormat {
  let fmt: EncodeFormat;
  if (opts.format === 'jpeg' || opts.format === 'webp' || opts.format === 'avif') {
    fmt = opts.format;
  } else {
    // auto
    fmt = hasAlpha ? 'webp' : isPhotographic(imageData) ? 'avif' : 'jpeg';
  }
  if (fmt === 'avif' && opts.noAvif) fmt = 'webp';
  return fmt;
}

/** Any non-opaque pixel? Sampled stride for speed on large images. */
function hasAlphaPixels(img: ImageData): boolean {
  const d = img.data;
  const stride = Math.max(4, Math.floor(d.length / 4 / 4096) * 4);
  for (let i = 3; i < d.length; i += stride) {
    if (d[i] < 255) return true;
  }
  return false;
}

/**
 * Photographic heuristic: count 4-bit-quantised colours from a 64×64 sample.
 * Many unique colours ⇒ photo ⇒ AVIF. Worker-safe port of auto-format.ts.
 */
function isPhotographic(img: ImageData): boolean {
  const SAMPLE = 64;
  const PHOTO_THRESHOLD = 600;
  const src = new OffscreenCanvas(img.width, img.height);
  const sctx = src.getContext('2d');
  if (!sctx) return true;
  sctx.putImageData(img, 0, 0);
  const small = new OffscreenCanvas(SAMPLE, SAMPLE);
  const dctx = small.getContext('2d');
  if (!dctx) return true;
  dctx.drawImage(src, 0, 0, SAMPLE, SAMPLE);
  const { data } = dctx.getImageData(0, 0, SAMPLE, SAMPLE);
  const colors = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    colors.add(key);
  }
  return colors.size > PHOTO_THRESHOLD;
}

/** Encode ImageData via the matching @jsquash codec (lazy per-format chunk). */
async function encode(img: ImageData, format: EncodeFormat, quality: number): Promise<Blob> {
  if (format === 'jpeg') {
    const mod = await import('@jsquash/jpeg/encode');
    if (!jpegInit) jpegInit = mod.init({ locateFile });
    await jpegInit;
    const buf = await mod.default(img, { quality });
    return new Blob([buf], { type: OUTPUT_MIME.jpeg });
  }
  if (format === 'webp') {
    const mod = await import('@jsquash/webp/encode');
    if (!webpInit) webpInit = mod.init({ locateFile });
    await webpInit;
    const buf = await mod.default(img, { quality });
    return new Blob([buf], { type: OUTPUT_MIME.webp });
  }
  const mod = await import('@jsquash/avif/encode');
  if (!avifInit) avifInit = mod.init({ locateFile });
  await avifInit;
  const buf = await mod.default(img, { quality, speed: AVIF_SPEED });
  return new Blob([buf], { type: OUTPUT_MIME.avif });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n | 0));
}
