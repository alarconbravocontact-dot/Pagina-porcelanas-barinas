import zlib from 'node:zlib';

/** Genera una textura PNG tipo mármol/piedra para productos de demostración (sin dependencias). */
export function marblePng(size: number, base: [number, number, number], vein: [number, number, number], seed: number, style: 'marble' | 'stone' | 'wood' = 'marble'): Buffer {
  const rand = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = rand(xi, yi), b = rand(xi + 1, yi), c = rand(xi, yi + 1), d = rand(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const turb = (x: number, y: number) => {
    let t = 0, f = 1, amp = 1;
    for (let o = 0; o < 5; o++) { t += smooth(x * f, y * f) * amp; f *= 2; amp /= 2; }
    return t / 1.9375;
  };
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      let k: number;
      if (style === 'wood') {
        const r = Math.sin((ny * 18 + turb(nx * 3, ny * 30) * 4) * Math.PI);
        k = (r + 1) / 2 * 0.6;
      } else if (style === 'stone') {
        k = turb(nx * 8, ny * 8) * 0.55;
      } else {
        const v = Math.abs(Math.sin((nx * 3 + ny * 2 + turb(nx * 4, ny * 4) * 3.2) * Math.PI));
        k = Math.pow(1 - v, 6);
      }
      const grain = (rand(x, y) - 0.5) * 10;
      for (let c = 0; c < 3; c++) {
        row[1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(base[c]! * (1 - k) + vein[c]! * k + grain)));
      }
    }
    rows.push(row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
