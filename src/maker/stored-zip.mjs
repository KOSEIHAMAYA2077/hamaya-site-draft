// Small ZIP writer for one Markdown file, at most two images and one report.
// STORE method only: no compression, encryption, directory entries or ZIP64.
const MAX_FILES = 4;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validPath(path) {
  return (
    typeof path === 'string' &&
    path.length <= 160 &&
    /^[a-z0-9][a-z0-9_./-]*$/.test(path) &&
    path
      .split('/')
      .every(
        (part) =>
          part &&
          part !== '.' &&
          part !== '..' &&
          !part.endsWith('.') &&
          !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  );
}

/** Build a deterministic, standard ZIP from bounded ASCII relative filenames. */
export function createStoredZip(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES)
    throw new Error('ZIPは1〜4ファイルまでです。');
  const seen = new Set();
  let localBytes = 0;
  let centralBytes = 0;
  const entries = files.map((file) => {
    if (!file || !validPath(file.path) || seen.has(file.path))
      throw new Error('ZIPのファイル名が不正か、重複しています。');
    if (
      !(file.bytes instanceof Uint8Array) ||
      file.bytes.length > MAX_FILE_BYTES
    )
      throw new Error('ZIP内の各ファイルは1 MiB以内にしてください。');
    seen.add(file.path);
    const entry = {
      name: encoder.encode(file.path),
      bytes: new Uint8Array(file.bytes),
      offset: localBytes,
      crc: crc32(file.bytes),
    };
    localBytes += 30 + entry.name.length + entry.bytes.length;
    centralBytes += 46 + entry.name.length;
    return entry;
  });
  const total = localBytes + centralBytes + 22;
  if (total > MAX_ARCHIVE_BYTES)
    throw new Error('ZIPは4 MiB以内にしてください。');
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let centralOffset = localBytes;
  for (const entry of entries) {
    const { offset, name, bytes, crc } = entry;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    // DOS date 1980-01-01; no current time, location or browser data is recorded.
    view.setUint16(offset + 12, 33, true);
    view.setUint32(offset + 14, crc, true);
    view.setUint32(offset + 18, bytes.length, true);
    view.setUint32(offset + 22, bytes.length, true);
    view.setUint16(offset + 26, name.length, true);
    output.set(name, offset + 30);
    output.set(bytes, offset + 30 + name.length);

    view.setUint32(centralOffset, 0x02014b50, true);
    view.setUint16(centralOffset + 4, 20, true);
    view.setUint16(centralOffset + 6, 20, true);
    view.setUint16(centralOffset + 14, 33, true);
    view.setUint32(centralOffset + 16, crc, true);
    view.setUint32(centralOffset + 20, bytes.length, true);
    view.setUint32(centralOffset + 24, bytes.length, true);
    view.setUint16(centralOffset + 28, name.length, true);
    view.setUint32(centralOffset + 42, offset, true);
    output.set(name, centralOffset + 46);
    centralOffset += 46 + name.length;
  }
  view.setUint32(centralOffset, 0x06054b50, true);
  view.setUint16(centralOffset + 8, entries.length, true);
  view.setUint16(centralOffset + 10, entries.length, true);
  view.setUint32(centralOffset + 12, centralBytes, true);
  view.setUint32(centralOffset + 16, localBytes, true);
  return output;
}
