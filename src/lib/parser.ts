import { isChordLine, isChordToken } from "./transpose";

const INLINE_CHORD_BRACKET_REGEX = /\[([A-G](?:#|b)?[^\]]{0,14})\]/g;

const SECTION_LABEL_REGEX =
  /^\[(?:intro|verse|chorus|nakarat|köprü|bridge|solo|outro|giriş|ara|pre-chorus|interlude|final|riff|main riff)[^\]]*\]$/i;

const NOISE_LINE_PATTERNS = [
  /repertuarim\.com/i,
  /akorlar\.com/i,
  /ultimate-guitar\.com/i,
  /akor\s+ekle/i,
  /yazdır|paylaş|favorilere\s+ekle/i,
  /reklam|advertisement/i,
];

/**
 * Converts a single line containing inline bracketed chords like `[Am]Senden [G]daha`
 * into an aligned `[chordLine, lyricLine]` pair.
 */
function convertBracketLineToTwoLines(line: string): string[] {
  // Preserve pure section headers like `[Nakarat]` or `[Intro]`
  if (SECTION_LABEL_REGEX.test(line.trim())) {
    return [line.trim()];
  }

  let hasValidBracketChord = false;
  INLINE_CHORD_BRACKET_REGEX.lastIndex = 0;
  let probe: RegExpExecArray | null;
  while ((probe = INLINE_CHORD_BRACKET_REGEX.exec(line)) !== null) {
    if (isChordToken(probe[1].trim())) {
      hasValidBracketChord = true;
      break;
    }
  }

  if (!hasValidBracketChord) {
    return [line];
  }

  let chordLine = "";
  let lyricLine = "";
  let lastIndex = 0;

  INLINE_CHORD_BRACKET_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_CHORD_BRACKET_REGEX.exec(line)) !== null) {
    const candidate = match[1].trim();
    const before = line.slice(lastIndex, match.index);
    lyricLine += before;

    if (isChordToken(candidate)) {
      const targetCol = lyricLine.length;
      if (chordLine.length < targetCol) {
        chordLine += " ".repeat(targetCol - chordLine.length);
      } else if (chordLine.length > 0 && !chordLine.endsWith(" ")) {
        chordLine += " ";
        // Shift lyric spacing slightly if consecutive chords overlap zero-length lyric gap
        if (chordLine.length > lyricLine.length) {
          lyricLine += " ".repeat(chordLine.length - lyricLine.length);
        }
      }
      chordLine += candidate;
    } else {
      lyricLine += match[0];
    }

    lastIndex = match.index + match[0].length;
  }

  lyricLine += line.slice(lastIndex);

  if (!lyricLine.trim()) {
    return [chordLine.trimEnd()];
  }

  return [chordLine.trimEnd(), lyricLine.trimEnd()];
}

/**
 * Normalizes pasted or scraped chord+lyric text:
 * - Strips Ultimate Guitar `[ch]` / `[/ch]` and `[tab]` / `[/tab]` tags
 * - Expands tabs to 4 spaces
 * - Converts inline `[Am]Lyrics` notation into column-aligned chord-over-lyric lines
 * - Removes common scraped site footer/ad watermarks while keeping chord spacing intact
 */
export function normalizeSongContent(raw: string): string {
  if (!raw) return "";

  const cleaned = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\[\/?tab\]/gi, "")
    .replace(/\[ch\](.*?)\[\/ch\]/gi, "$1")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, "    ");

  const inputLines = cleaned.split("\n");
  const outputLines: string[] = [];

  for (const rawLine of inputLines) {
    if (NOISE_LINE_PATTERNS.some((pat) => pat.test(rawLine))) {
      continue;
    }

    const trimmedEnd = rawLine.replace(/\s+$/, "");
    const expanded = convertBracketLineToTwoLines(trimmedEnd);
    outputLines.push(...expanded);
  }

  // Collapse runs of more than 2 consecutive blank lines into a single blank line
  const collapsed: string[] = [];
  let blankStreak = 0;
  for (const line of outputLines) {
    if (!line.trim()) {
      blankStreak++;
      if (blankStreak <= 1) collapsed.push("");
    } else {
      blankStreak = 0;
      collapsed.push(line);
    }
  }

  return collapsed.join("\n").trim();
}

/**
 * Infers the original key of a song by scanning the first chord line for its opening chord.
 */
export function detectOriginalKey(content: string): string | null {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (!isChordLine(line)) continue;
    const tokens = line
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/[|()]/g, " ")
      .trim()
      .split(/\s+/);
    for (const tok of tokens) {
      if (isChordToken(tok)) {
        return tok;
      }
    }
  }
  return null;
}
