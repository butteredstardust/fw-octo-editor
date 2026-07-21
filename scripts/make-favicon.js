'use strict';

// Dependency-free PNG -> multi-size ICO generator.
// Decodes the source PNG (zlib inflate + unfilter), resamples with
// nearest-neighbour to several sizes, re-encodes each as a PNG, and wraps
// them in a single .ico container.

const fs = require('fs');
const zlib = require('zlib');

const SRC = process.argv[2] || 'C:\\Users\\Admin\\Documents\\Forever Winter\\app_icon.png';
const OUT = process.argv[3] || 'C:\\Users\\Admin\\Documents\\Forever Winter\\webapp\\public\\favicon.ico';
const SIZES = [16, 32, 48, 64, 128, 256];

function readPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  let idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error('requires 8-bit RGBA PNG');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = 4;
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const val = raw[rp++];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let r;
      switch (filter) {
        case 0: r = val; break;
        case 1: r = val + a; break;
        case 2: r = val + b; break;
        case 3: r = val + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          r = val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      out[y * stride + x] = r & 0xff;
    }
  }
  return { width, height, data: out };
}

function resample(src, size) {
  const dst = Buffer.alloc(size * size * 4);
  const sx = src.width / size, sy = src.height / size;
  for (let y = 0; y < size; y++) {
    const syi = Math.min(src.height - 1, Math.floor(y * sy));
    for (let x = 0; x < size; x++) {
      const sxi = Math.min(src.width - 1, Math.floor(x * sx));
      const si = (syi * src.width + sxi) * 4;
      const di = (y * size + x) * 4;
      dst[di] = src.data[si];
      dst[di + 1] = src.data[si + 1];
      dst[di + 2] = src.data[si + 2];
      dst[di + 3] = src.data[si + 3];
    }
  }
  return { width: size, height: size, data: dst };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(img) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  let rp = 0;
  for (let y = 0; y < img.height; y++) {
    raw[rp++] = 0;
    img.data.copy ? img.data.copy(raw, rp, y * stride, y * stride + stride) : raw.set(img.data.subarray(y * stride, y * stride + stride), rp);
    rp += stride;
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function pngToICOEntry(png) {
  // ICO image entry: 1-byte width/height (0 means 256), then the PNG bytes.
  const header = Buffer.alloc(16);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  header[0] = w >= 256 ? 0 : w;
  header[1] = h >= 256 ? 0 : h;
  header[2] = 0; header[3] = 0;
  header.writeUInt16LE(1, 4);   // color planes
  header.writeUInt16LE(32, 6);  // bit count
  header.writeUInt32LE(png.length, 8);
  header.writeUInt32LE(0, 12);  // offset filled later
  return { header, png };
}

function buildICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const headers = [];
  const bodies = [];
  for (const e of entries) {
    e.header.writeUInt32LE(offset, 12);
    headers.push(e.header);
    bodies.push(e.png);
    offset += e.png.length;
  }
  return Buffer.concat([header, ...headers, ...bodies]);
}

const src = readPNG(fs.readFileSync(SRC));
const entries = SIZES.map((s) => pngToICOEntry(encodePNG(resample(src, s))));
fs.writeFileSync(OUT, buildICO(entries));
console.log('Wrote', OUT, 'with sizes', SIZES.join(','), '(', fs.statSync(OUT).size, 'bytes )');
