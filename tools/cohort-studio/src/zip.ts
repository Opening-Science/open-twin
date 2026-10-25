/**
 * WHAT: Reads selected entries from a ZIP/JAR file (stored or deflated, ZIP64 aware) without unpacking it.
 * NOT:  Does not write archives, check signatures or support encryption or multi-disk archives.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The Synthea JAR holds more than 65,535 entries, so the ZIP64 end record is the normal path, not an edge case.
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

type Entry = { name: string; method: number; compressedSize: number; localOffset: number };

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const n = readSync(fd, buf, read, length - read, position + read);
    if (n === 0) break;
    read += n;
  }
  return buf.subarray(0, read);
}

function centralDirectory(fd: number, size: number): { offset: number; count: number } {
  const tailLength = Math.min(size, 65_557);
  const tail = readAt(fd, size - tailLength, tailLength);
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== EOCD_SIG) continue;
    let count = tail.readUInt16LE(i + 10);
    let offset = tail.readUInt32LE(i + 16);
    if (count === 0xffff || offset === 0xffffffff) {
      const loc = i - 20;
      if (loc < 0 || tail.readUInt32LE(loc) !== ZIP64_LOCATOR_SIG) throw new Error('ZIP64 locator not found');
      const z64Offset = Number(tail.readBigUInt64LE(loc + 8));
      const z64 = readAt(fd, z64Offset, 56);
      if (z64.readUInt32LE(0) !== ZIP64_EOCD_SIG) throw new Error('ZIP64 end record not found');
      count = Number(z64.readBigUInt64LE(32));
      offset = Number(z64.readBigUInt64LE(48));
    }
    return { offset, count };
  }
  throw new Error('not a ZIP file (no end of central directory)');
}

function zip64Value(extra: Buffer, wanted: Array<'size' | 'compressed' | 'offset'>): Map<string, number> {
  const out = new Map<string, number>();
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p);
    const len = extra.readUInt16LE(p + 2);
    if (id === 0x0001) {
      let q = p + 4;
      for (const key of wanted) {
        out.set(key, Number(extra.readBigUInt64LE(q)));
        q += 8;
      }
    }
    p += 4 + len;
  }
  return out;
}

function listEntries(fd: number, size: number): Entry[] {
  const { offset, count } = centralDirectory(fd, size);
  const dir = readAt(fd, offset, size - offset);
  const entries: Entry[] = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= dir.length; n++) {
    if (dir.readUInt32LE(p) !== CENTRAL_SIG) throw new Error('corrupt central directory');
    const method = dir.readUInt16LE(p + 10);
    let compressedSize = dir.readUInt32LE(p + 20);
    const uncompressedSize = dir.readUInt32LE(p + 24);
    const nameLength = dir.readUInt16LE(p + 28);
    const extraLength = dir.readUInt16LE(p + 30);
    const commentLength = dir.readUInt16LE(p + 32);
    let localOffset = dir.readUInt32LE(p + 42);
    const name = dir.toString('utf8', p + 46, p + 46 + nameLength);
    const wanted: Array<'size' | 'compressed' | 'offset'> = [];
    if (uncompressedSize === 0xffffffff) wanted.push('size');
    if (compressedSize === 0xffffffff) wanted.push('compressed');
    if (localOffset === 0xffffffff) wanted.push('offset');
    if (wanted.length > 0) {
      const extra = dir.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength);
      const values = zip64Value(extra, wanted);
      compressedSize = values.get('compressed') ?? compressedSize;
      localOffset = values.get('offset') ?? localOffset;
    }
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(fd: number, entry: Entry): Buffer {
  const header = readAt(fd, entry.localOffset, 30);
  if (header.readUInt32LE(0) !== LOCAL_SIG) throw new Error(`corrupt local header for ${entry.name}`);
  const start = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = readAt(fd, start, entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}

/** Returns name → content for every entry whose name passes `filter`. */
export function readZipEntries(path: string, filter: (name: string) => boolean): Map<string, Buffer> {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const out = new Map<string, Buffer>();
    for (const entry of listEntries(fd, size)) {
      if (!entry.name.endsWith('/') && filter(entry.name)) out.set(entry.name, readEntry(fd, entry));
    }
    return out;
  } finally {
    closeSync(fd);
  }
}
