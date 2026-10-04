import { convertMakerFieldWithImages } from './adapter.mjs';
import { createStoredZip } from './stored-zip.mjs';

const encoder = new TextEncoder();
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_SIDE = 8192;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

/** Check the declared format before asking a browser decoder to read it. */
export function checkRasterSignature(bytes, mime) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > MAX_IMAGE_BYTES
  )
    fail('画像は1 MiB以内にしてください。');
  const startsWith = (signature) =>
    signature.every((byte, index) => bytes[index] === byte);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let valid = false;
  if (mime === 'image/png') {
    valid =
      bytes.length >= 33 &&
      startsWith([137, 80, 78, 71, 13, 10, 26, 10]) &&
      view.getUint32(8) === 13 &&
      bytes[12] === 73 &&
      bytes[13] === 72 &&
      bytes[14] === 68 &&
      bytes[15] === 82;
    if (valid)
      checkDimensions({
        width: view.getUint32(16),
        height: view.getUint32(20),
      });
  } else if (mime === 'image/jpeg') {
    valid = bytes.length >= 4 && startsWith([255, 216, 255]);
  } else if (mime === 'image/webp') {
    valid =
      bytes.length >= 20 &&
      startsWith([82, 73, 70, 70]) &&
      view.getUint32(4, true) === bytes.length - 8 &&
      bytes[8] === 87 &&
      bytes[9] === 69 &&
      bytes[10] === 66 &&
      bytes[11] === 80;
  }
  if (!valid)
    fail(
      '画像の形式と中身が一致しません。PNG・JPEG・WebPの元画像を確認してください。',
    );
}

function checkDimensions({ width, height } = {}) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_SIDE ||
    height > MAX_IMAGE_SIDE ||
    width * height > MAX_IMAGE_PIXELS
  )
    fail(
      '画像の大きさを確認してください。縦横8,192px以内、合計16,777,216画素までです。',
    );
}

/** Decode only a caller-selected in-memory Blob; never load a URL. */
export async function decodeRasterImage(bytes, mime) {
  if (typeof globalThis.createImageBitmap !== 'function')
    fail('このブラウザでは画像を確認できません。画像付きZIPは書き出せません。');
  let bitmap;
  try {
    bitmap = await globalThis.createImageBitmap(
      new Blob([bytes], { type: mime }),
    );
    const dimensions = { width: bitmap.width, height: bitmap.height };
    checkDimensions(dimensions);
    return dimensions;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('画像の大きさ'))
      throw error;
    fail('画像を読み取れませんでした。元画像を確認してください。');
  } finally {
    bitmap?.close();
  }
}

/**
 * Build one complete archive in memory. A decoder override is for non-browser
 * validation/tests only; the UI always uses the browser decoder above.
 */
export async function createMakerPortablePackage(
  bytes,
  options,
  { decodeImage = decodeRasterImage } = {},
) {
  const assets = [];
  const converted = await convertMakerFieldWithImages(
    bytes,
    options,
    async (image) => {
      checkRasterSignature(image.bytes, image.mime);
      const dimensions = await decodeImage(image.bytes, image.mime);
      checkDimensions(dimensions);
      // No re-encoding: the file must retain the exact bytes hashed by the adapter.
      assets.push({ path: image.path, bytes: image.bytes });
      return dimensions;
    },
  );
  const report = {
    ...converted.report,
    portablePackageVersion: 1,
    package: {
      filename: converted.filename.replace(/\.md$/, '.zip'),
      markdown: converted.filename,
      report: 'report.json',
      images: assets.map((asset) => asset.path),
      originalJsonIncluded: false,
      selectedRecords: 1,
    },
  };
  const reportBytes = encoder.encode(`${JSON.stringify(report, null, 2)}\n`);
  const files = [
    { path: converted.filename, bytes: encoder.encode(converted.markdown) },
    ...assets,
    { path: 'report.json', bytes: reportBytes },
  ];
  return {
    filename: report.package.filename,
    markdown: converted.markdown,
    markdownFilename: converted.filename,
    report,
    bytes: createStoredZip(files),
    files,
  };
}
