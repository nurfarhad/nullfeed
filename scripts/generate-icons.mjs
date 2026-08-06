import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const sizes = [16, 32, 48, 128];
const output = new URL("../public/icons/", import.meta.url);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)
  );
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pixel(size, x, y) {
  const scale = size / 128;
  const px = (x + 0.5) / scale;
  const py = (y + 0.5) / scale;
  const cx = 64;
  const cy = 64;
  const radius = 48;
  const stroke = Math.max(7.5, 15 / 2);
  const angle = Math.atan2(py - cy, px - cx);
  const circle =
    Math.abs(Math.hypot(px - cx, py - cy) - radius) <= stroke &&
    !(angle > -0.9 && angle < 0.9);
  const opening =
    distanceToSegment(px, py, 93, 35, 112, 16) <= stroke;

  if (opening) return [22, 163, 106, 255];
  if (circle) return [20, 23, 25, 255];
  return [0, 0, 0, 0];
}

function makePng(size) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = [0];
    for (let x = 0; x < size; x += 1) {
      row.push(...pixel(size, x, y));
    }
    rows.push(Buffer.from(row));
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

await mkdir(output, { recursive: true });
await Promise.all(
  sizes.map((size) =>
    writeFile(new URL(`icon-${size}.png`, output), makePng(size))
  )
);
