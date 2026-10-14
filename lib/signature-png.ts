/**
 * Rasterises signature strokes into a grayscale PNG (pure TypeScript, no native module).
 * The POD signature is uploaded as an image: the server refuses SVG because it can carry script.
 */

export type Pt = { x: number; y: number };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function chunk(type: string, data: Uint8Array): number[] {
  const typeBytes = Array.from(type).map((c) => c.charCodeAt(0));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** zlib stream using stored (uncompressed) deflate blocks — valid PNG, no compressor needed. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 255;
    out[o++] = (len >>> 8) & 255;
    out[o++] = ~len & 255;
    out[o++] = (~len >>> 8) & 255;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  out.set(u32(adler32(raw)), o);
  return out;
}

export function rasterize(strokes: Pt[][], srcW: number, srcH: number, width = 480, height = 180, pen = 2.2): Uint8Array {
  const pixels = new Uint8Array(width * height).fill(255);
  const sx = width / Math.max(1, srcW);
  const sy = height / Math.max(1, srcH);
  const r = Math.max(1, pen * Math.min(sx, sy));
  const stamp = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) pixels[y * width + x] = 17;
      }
    }
  };
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i++) {
      const a = stroke[i];
      const b = stroke[i + 1] ?? a;
      const steps = Math.max(1, Math.ceil(Math.hypot((b.x - a.x) * sx, (b.y - a.y) * sy) / (r / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        stamp((a.x + (b.x - a.x) * t) * sx, (a.y + (b.y - a.y) * t) * sy);
      }
    }
  }
  return pixels;
}

export function encodePng(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 0, 0, 0, 0]); // 8-bit grayscale
  const bytes = [
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", zlibStored(raw)),
    ...chunk("IEND", new Uint8Array(0)),
  ];
  return Uint8Array.from(bytes);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

/** Strokes → `data:image/png;base64,...`. Returns null when nothing was drawn. */
export function signatureDataUri(strokes: Pt[][], srcW: number, srcH: number): string | null {
  const inked = strokes.reduce((n, s) => n + s.length, 0);
  if (inked < 5) return null;
  const width = 480;
  const height = 180;
  return `data:image/png;base64,${toBase64(encodePng(rasterize(strokes, srcW, srcH, width, height), width, height))}`;
}
