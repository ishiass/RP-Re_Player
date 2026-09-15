export interface LrcLine {
  at: number;
  text: string;
}

export interface LyricCue {
  at: number;
  top: string;
  bottom?: string;
}

const stamp = /\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;
const enhancedStamp = /^\s*\[([+-]?\d+),([+-]?\d+)\](.*)$/;
const enhancedWordStamp = /\([+-]?\d+,[+-]?\d+(?:,[+-]?\d+)?\)/g;
const han = /[\u3400-\u9fff\uf900-\ufaff]/g;
const kana = /[\u3040-\u30ff]/g;

function cleanText(input: string) {
  return input.replace(enhancedWordStamp, "").trim();
}

function jsonText(input: string) {
  try {
    const data = JSON.parse(input) as { t?: unknown; c?: unknown };
    if (!Number.isFinite(data.t as number) || !Array.isArray(data.c)) return null;
    const text = data.c
      .map((part) => typeof part === "object" && part ? String((part as { tx?: unknown }).tx ?? "") : "")
      .join("")
      .trim();
    if (!text) return null;
    return { at: Number(data.t) / 1000, text };
  } catch {
    return null;
  }
}

export function parseLrc(source: string): LrcLine[] {
  const offset = Number(source.match(/^\s*\[offset:([+-]?\d+)\]\s*$/im)?.[1] || 0) / 1000;
  const result: LrcLine[] = [];

  for (const raw of source.replace(/^\ufeff/, "").split(/\r?\n/)) {
    const metadata = jsonText(raw.trim());
    if (metadata) {
      result.push({ at: Math.max(0, metadata.at + offset), text: metadata.text });
      continue;
    }

    const enhanced = raw.match(enhancedStamp);
    if (enhanced) {
      const at = Number(enhanced[1]) / 1000;
      const text = cleanText(enhanced[3]);
      if (Number.isFinite(at) && text) result.push({ at: Math.max(0, at + offset), text });
      continue;
    }

    const matches = [...raw.matchAll(stamp)];
    const text = cleanText(raw.replace(stamp, ""));
    if (!matches.length || !text) continue;

    for (const match of matches) {
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      const at = Math.max(0, Number(match[1]) * 60 + Number(match[2]) + fraction + offset);
      result.push({ at, text });
    }
  }

  return result
    .sort((a, b) => a.at - b.at)
    .filter((line, index, lines) => !index || line.at !== lines[index - 1].at || line.text !== lines[index - 1].text);
}

function chineseScore(lines: LrcLine[]) {
  const text = lines.map((line) => line.text).join("");
  const hanCount = text.match(han)?.length || 0;
  const kanaCount = text.match(kana)?.length || 0;
  if (!hanCount) return 0;
  return hanCount / Math.max(1, hanCount + kanaCount * 4);
}

function groupSingle(lines: LrcLine[]): LyricCue[] {
  const groups = new Map<number, string[]>();
  for (const line of lines) {
    const key = Math.round(line.at * 1000) / 1000;
    const texts = groups.get(key) || [];
    if (!texts.includes(line.text)) texts.push(line.text);
    groups.set(key, texts);
  }

  return [...groups.entries()].map(([at, texts]) => {
    if (texts.length < 2) return { at, top: texts[0] };
    const chinese = texts.findIndex((text) => (text.match(han)?.length || 0) > 0 && (text.match(kana)?.length || 0) === 0);
    const topIndex = chinese >= 0 ? chinese : 0;
    return { at, top: texts[topIndex], bottom: texts.find((_, index) => index !== topIndex) };
  });
}

function combine(top: LrcLine[], bottom: LrcLine[]): LyricCue[] {
  type IndexedCue = LyricCue & { _index: number };
  const used = new Set<number>();
  const cues: IndexedCue[] = top.map((line, index) => {
    let nearest = -1;
    let distance = 1.25;
    for (let candidate = 0; candidate < bottom.length; candidate += 1) {
      if (used.has(candidate)) continue;
      const current = Math.abs(bottom[candidate].at - line.at);
      if (current < distance) {
        nearest = candidate;
        distance = current;
      }
      if (bottom[candidate].at > line.at + distance) break;
    }
    if (nearest >= 0) used.add(nearest);
    return { at: line.at, top: line.text, bottom: nearest >= 0 ? bottom[nearest].text : undefined, _index: index };
  });

  for (let index = 0; index < bottom.length; index += 1) {
    if (!used.has(index)) cues.push({ at: bottom[index].at, top: "", bottom: bottom[index].text, _index: index });
  }

  return cues
    .sort((a, b) => a.at - b.at || a._index - b._index)
    .map(({ _index, ...cue }) => cue);
}

export function buildLyrics(primarySource: string, otherSource?: string): LyricCue[] {
  const primary = parseLrc(primarySource);
  const other = otherSource ? parseLrc(otherSource) : [];
  if (!other.length) return groupSingle(primary);
  if (!primary.length) return groupSingle(other);

  const primaryChinese = chineseScore(primary);
  const otherChinese = chineseScore(other);
  if (primaryChinese > otherChinese + 0.15) return combine(primary, other);
  if (otherChinese > primaryChinese + 0.15) return combine(other, primary);

  // When language detection is inconclusive, other-language lyrics go above the default track.
  return combine(other, primary);
}
