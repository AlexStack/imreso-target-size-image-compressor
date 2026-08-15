/**
 * Magic-byte sniffing for input format routing. Pure, unit-testable.
 *
 * Vendored copy of the website engine's src/lib/engine/format.ts. It lives here
 * so the plugin builds from its own folder alone — wordpress.org requires the
 * shipped, minified JS to have buildable human-readable sources in the package.
 * Keep in sync with the website copy if the sniffer changes.
 */

export type InputKind =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'gif'
  | 'heic'
  | 'tiff'
  | 'jp2'
  | 'bmp'
  | 'ico'
  | 'svg'
  | 'unknown';

export function sniff(bytes: Uint8Array): InputKind {
  const b = bytes;
  if (b.length < 12) return 'unknown';
  // JPEG FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  // PNG 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  // BMP
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  // ICO 00 00 01 00
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'ico';
  // TIFF II*. or MM.*
  if (
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00)
  )
    return 'tiff';
  // JPEG 2000: starts with 00 00 00 0C 6A 50 (jP) or FF 4F FF 51
  if (b[4] === 0x6a && b[5] === 0x50) return 'jp2';
  if (b[0] === 0xff && b[1] === 0x4f && b[2] === 0xff && b[3] === 0x51) return 'jp2';
  // RIFF....WEBP / AVIF & HEIC via ftyp box
  const ascii = (i: number, s: string) => {
    for (let k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false;
    return true;
  };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (brand.startsWith('hei') || brand.startsWith('mif') || brand === 'heic' || brand === 'heix')
      return 'heic';
  }
  // SVG: look for "<svg" or "<?xml" in the first bytes
  const head = String.fromCharCode(...b.slice(0, Math.min(64, b.length))).toLowerCase();
  if (head.includes('<svg') || (head.includes('<?xml') && head.includes('svg'))) return 'svg';
  return 'unknown';
}

const MIME: Record<Exclude<InputKind, 'unknown'>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  heic: 'image/heic',
  tiff: 'image/tiff',
  jp2: 'image/jp2',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

export function kindToMime(kind: InputKind): string {
  return kind === 'unknown' ? 'application/octet-stream' : MIME[kind];
}

export const OUTPUT_MIME: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
};

export const OUTPUT_EXT: Record<string, string> = {
  avif: 'avif',
  webp: 'webp',
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
};
