import type { APIContext } from "astro";
import type { PseudoItem } from "./pseudo";

export type EmbeddedAudioCover = {
  data: Uint8Array;
  mimeType: string;
};

const coverWindowBytes = 8 * 1024 * 1024;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const internalPrefixes = ["/api/public/media", "/api/public/download", "/api/public/cover"];
const mp4Containers = new Set(["moov", "udta", "meta", "ilst", "covr"]);

function ascii(data: Uint8Array, start: number, length: number) {
  if (start < 0 || start + length > data.length) return "";
  return String.fromCharCode(...data.subarray(start, start + length));
}

function u24(data: Uint8Array, offset: number) {
  return offset + 3 <= data.length
    ? (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
    : 0;
}

function u32(data: Uint8Array, offset: number) {
  if (offset + 4 > data.length) return 0;
  return data[offset] * 0x1000000 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
}

function synchsafe(data: Uint8Array, offset: number) {
  if (offset + 4 > data.length) return 0;
  return (data[offset] & 0x7f) * 0x200000 + (data[offset + 1] & 0x7f) * 0x4000 +
    (data[offset + 2] & 0x7f) * 0x80 + (data[offset + 3] & 0x7f);
}

function imageMime(data: Uint8Array, hint = "") {
  const normalizedHint = hint.toLowerCase().trim().replace("image/jpg", "image/jpeg");
  const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/bmp"]);
  if (allowed.has(normalizedHint)) return normalizedHint;
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && ascii(data, 0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (data.length >= 6 && (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a")) return "image/gif";
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "image/webp";
  if (data.length >= 12 && ascii(data, 4, 4) === "ftyp" && ["avif", "avis", "heic", "heix"].includes(ascii(data, 8, 4))) return "image/avif";
  if (data.length >= 2 && ascii(data, 0, 2) === "BM") return "image/bmp";
  return undefined;
}

function coverFromBytes(data: Uint8Array, start: number, end: number, hint = ""): EmbeddedAudioCover | null {
  const boundedStart = Math.max(0, start);
  const boundedEnd = Math.min(data.length, end);
  if (boundedEnd <= boundedStart) return null;
  const image = data.slice(boundedStart, boundedEnd);
  const mimeType = imageMime(image, hint);
  return mimeType ? { data: image, mimeType } : null;
}

function descriptionEnd(data: Uint8Array, start: number, end: number, encoding: number) {
  const wide = encoding === 1 || encoding === 2;
  for (let index = start; index < end; index += 1) {
    if (data[index] !== 0) continue;
    if (!wide || (index + 1 < end && data[index + 1] === 0)) return index + (wide ? 2 : 1);
  }
  return end;
}

function parseApic(data: Uint8Array, start: number, end: number): EmbeddedAudioCover | null {
  if (start >= end) return null;
  const encoding = data[start];
  let cursor = start + 1;
  while (cursor < end && data[cursor] !== 0) cursor += 1;
  const mime = ascii(data, start + 1, Math.max(0, cursor - start - 1));
  cursor += 1;
  if (cursor >= end) return null;
  cursor += 1;
  cursor = descriptionEnd(data, cursor, end, encoding);
  return coverFromBytes(data, cursor, end, mime);
}

function parsePic(data: Uint8Array, start: number, end: number): EmbeddedAudioCover | null {
  if (start + 5 > end) return null;
  let cursor = start + 1;
  const format = ascii(data, cursor, 3);
  cursor += 4;
  cursor = descriptionEnd(data, cursor, end, data[start]);
  const hint = format.toLowerCase() === "jpg" ? "image/jpeg" : "image/" + format.toLowerCase();
  return coverFromBytes(data, cursor, end, hint);
}

function extractId3Cover(data: Uint8Array): EmbeddedAudioCover | null {
  if (ascii(data, 0, 3) !== "ID3" || data.length < 10) return null;
  const version = data[3];
  const tagEnd = Math.min(data.length, 10 + synchsafe(data, 6));
  let cursor = 10;
  if (data[5] & 0x40) {
    const extendedSize = version === 4 ? synchsafe(data, cursor) : u32(data, cursor);
    cursor += 4 + extendedSize;
  }

  while (cursor + (version === 2 ? 6 : 10) <= tagEnd) {
    const headerSize = version === 2 ? 6 : 10;
    const frameId = ascii(data, cursor, version === 2 ? 3 : 4);
    if (!frameId || /^\x00+$/.test(frameId)) break;
    const frameSize = version === 2 ? u24(data, cursor + 3) :
      version === 4 ? synchsafe(data, cursor + 4) : u32(data, cursor + 4);
    const frameStart = cursor + headerSize;
    const frameEnd = Math.min(tagEnd, frameStart + frameSize);
    if (frameEnd <= frameStart) break;
    if (frameId === "APIC") {
      const cover = parseApic(data, frameStart, frameEnd);
      if (cover) return cover;
    }
    if (frameId === "PIC") {
      const cover = parsePic(data, frameStart, frameEnd);
      if (cover) return cover;
    }
    cursor = frameStart + frameSize;
  }
  return null;
}

function parseFlacPicture(data: Uint8Array, start: number, end: number): EmbeddedAudioCover | null {
  let cursor = start;
  if (cursor + 4 > end) return null;
  cursor += 4;
  if (cursor + 4 > end) return null;
  const mimeLength = u32(data, cursor);
  cursor += 4 + mimeLength;
  if (cursor + 4 > end) return null;
  const descriptionLength = u32(data, cursor);
  cursor += 4 + descriptionLength;
  if (cursor + 20 > end) return null;
  cursor += 16;
  const imageLength = u32(data, cursor);
  cursor += 4;
  const imageEnd = Math.min(end, cursor + imageLength);
  const mimeStart = start + 4;
  const mimeEnd = Math.min(end, mimeStart + mimeLength);
  return coverFromBytes(data, cursor, imageEnd, ascii(data, mimeStart, mimeEnd - mimeStart));
}

function extractFlacCover(data: Uint8Array): EmbeddedAudioCover | null {
  if (ascii(data, 0, 4) !== "fLaC") return null;
  let cursor = 4;
  while (cursor + 4 <= data.length) {
    const header = data[cursor];
    const type = header & 0x7f;
    const length = u24(data, cursor + 1);
    const blockStart = cursor + 4;
    const blockEnd = blockStart + length;
    if (blockEnd > data.length) return null;
    if (type === 6) {
      const cover = parseFlacPicture(data, blockStart, blockEnd);
      if (cover) return cover;
    }
    cursor = blockEnd;
    if (header & 0x80) break;
  }
  return null;
}

function findBytes(data: Uint8Array, needle: string) {
  const first = needle.charCodeAt(0);
  for (let index = 0; index + needle.length <= data.length; index += 1) {
    if (data[index] !== first) continue;
    let matches = true;
    for (let offset = 1; offset < needle.length; offset += 1) {
      if (data[index + offset] !== needle.charCodeAt(offset)) {
        matches = false;
        break;
      }
    }
    if (matches) return index;
  }
  return -1;
}

function decodeBase64(value: string) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function extractOggCover(data: Uint8Array): EmbeddedAudioCover | null {
  if (ascii(data, 0, 4) !== "OggS" && findBytes(data, "METADATA_BLOCK_PICTURE=") < 0) return null;
  const marker = "METADATA_BLOCK_PICTURE=";
  let cursor = 0;
  while (true) {
    const found = findBytes(data.subarray(cursor), marker);
    if (found < 0) return null;
    const markerStart = cursor + found;
    const valueStart = markerStart + marker.length;
    let valueEnd = valueStart;
    while (valueEnd < data.length && data[valueEnd] !== 0 && data[valueEnd] !== 10 && data[valueEnd] !== 13) valueEnd += 1;
    const picture = decodeBase64(ascii(data, valueStart, valueEnd - valueStart));
    if (picture) {
      const cover = parseFlacPicture(picture, 0, picture.length);
      if (cover) return cover;
    }
    cursor = valueEnd + 1;
    if (cursor >= data.length) return null;
  }
}

function boxSize(data: Uint8Array, offset: number, end: number) {
  if (offset + 8 > end) return null;
  const smallSize = u32(data, offset);
  const type = ascii(data, offset + 4, 4);
  if (!type) return null;
  if (smallSize === 1) {
    if (offset + 16 > end) return null;
    const high = u32(data, offset + 8);
    const low = u32(data, offset + 12);
    if (high > 0 || low > end - offset) return null;
    return { type, header: 16, end: offset + low };
  }
  if (smallSize === 0) return { type, header: 8, end };
  if (smallSize < 8 || smallSize > end - offset) return null;
  return { type, header: 8, end: offset + smallSize };
}

function walkMp4(data: Uint8Array, start: number, end: number, inCover = false, depth = 0): EmbeddedAudioCover | null {
  if (depth > 10) return null;
  let cursor = start;
  while (cursor + 8 <= end) {
    const box = boxSize(data, cursor, end);
    if (!box || box.end <= cursor) break;
    const cover = box.type === "data" && inCover
      ? (() => {
        if (box.header + 8 > box.end - cursor) return null;
        const typeCode = u32(data, cursor + box.header + 4);
        return coverFromBytes(data, cursor + box.header + 8, box.end, typeCode === 13 ? "image/jpeg" : typeCode === 14 ? "image/png" : "");
      })()
      : mp4Containers.has(box.type)
        ? walkMp4(data, cursor + box.header + (box.type === "meta" ? 4 : 0), box.end, inCover || box.type === "covr", depth + 1)
        : null;
    if (cover) return cover;
    cursor = box.end;
  }
  return null;
}

function extractMp4Cover(data: Uint8Array): EmbeddedAudioCover | null {
  const direct = walkMp4(data, 0, data.length);
  if (direct) return direct;
  const marker = "moov";
  let cursor = 0;
  while (true) {
    const found = findBytes(data.subarray(cursor), marker);
    if (found < 4) return null;
    const headerStart = cursor + found - 4;
    const cover = walkMp4(data, headerStart, data.length);
    if (cover) return cover;
    cursor = headerStart + 4;
    if (cursor >= data.length) return null;
  }
}

function extractCover(data: Uint8Array) {
  return extractId3Cover(data) || extractFlacCover(data) || extractMp4Cover(data) || extractOggCover(data);
}

async function readLimited(response: Response, limit: number) {
  if (!response.body) return new Uint8Array((await response.arrayBuffer()).slice(0, limit));
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const result = await reader.read();
      if (result.done) break;
      const value = result.value;
      const remaining = limit - total;
      const chunk = value.slice(0, remaining);
      chunks.push(chunk);
      total += chunk.length;
      if (chunk.length < value.length) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function fetchWindow(context: APIContext, source: URL, range: string) {
  let current = source;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const internal = current.origin === context.url.origin &&
      (current.pathname === context.url.pathname || internalPrefixes.some((prefix) =>
        current.pathname === prefix || current.pathname.startsWith(prefix + "/")));
    if ((current.protocol !== "http:" && current.protocol !== "https:") || internal) return null;

    const headers = new Headers({ accept: "audio/*,application/octet-stream,*/*;q=0.8", range });
    let response: Response;
    try {
      response = await fetch(current, { headers, redirect: "manual" });
    } catch {
      return null;
    }
    const location = response.headers.get("location");
    if (!redirectStatuses.has(response.status) || !location) {
      const contentRange = response.headers.get("content-range")?.match(/\/([0-9]+)$/);
      const contentLength = contentRange ? Number(contentRange[1]) : Number(response.headers.get("content-length") || 0);
      return {
        data: await readLimited(response, coverWindowBytes),
        totalSize: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : undefined
      };
    }
    if (redirect === 5) return null;
    try {
      current = new URL(location, current);
    } catch {
      return null;
    }
  }
  return null;
}

export async function getEmbeddedAudioCover(context: APIContext, item: PseudoItem) {
  if (item.kind !== "audio") return null;
  let source: URL;
  try {
    source = new URL(item.url);
  } catch {
    return null;
  }

  const first = await fetchWindow(context, source, "bytes=0-" + (coverWindowBytes - 1));
  if (!first) return null;
  const firstCover = extractCover(first.data);
  if (firstCover) return firstCover;
  if (first.totalSize && first.totalSize <= coverWindowBytes) return null;

  const suffix = await fetchWindow(context, source, "bytes=-" + coverWindowBytes);
  return suffix ? extractCover(suffix.data) : null;
}
