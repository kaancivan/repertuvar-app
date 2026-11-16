const SHARP_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_SCALE = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

// Keys that traditionally prefer flats over sharps for clean enharmonic spelling
const FLAT_PREF_INDICES = new Set([1, 3, 5, 8, 10]); // Db, Eb, F, Ab, Bb

const CHORD_TOKEN_REGEX =
  /^([A-G](?:#|b)?)(?:(?:maj|min|dim|aug|sus|add|m|M)(?:\d{1,2})?|\d{1,2}|[+\-°ø])*(?:(?:#|b)(?:5|9|11|13))*(?:\([^)]+\))?(?:\/([A-G](?:#|b)?))?$/;

const SECTION_PREFIX_REGEX =
  /^(?:\[[^\]]+\]|(?:intro|verse|chorus|nakarat|köprü|bridge|solo|outro|giriş|ara|pre-chorus|interlude|ritim)(?:\s*\d*)?\s*:)\s*/i;

const NON_CHORD_MUSICAL_MARKERS = new Set([
  "|",
  "||",
  "/",
  "-",
  "–",
  "...",
  "n.c.",
  "nc",
  "tacet",
]);

const REPEAT_MARKER_REGEX = /^(?:\(?\s*(?:x\d+|\d+x)\s*\)?)$/i;
const TURKISH_OR_SENTENCE_CHAR_REGEX = /[şğıİöüçŞĞÖÜÇ!?;,]/;

export interface SheetSegment {
  text: string;
  isChord: boolean;
}

export interface ParsedSheetLine {
  isChordLine: boolean;
  segments: SheetSegment[];
  raw: string;
}

/**
 * Checks whether an individual whitespace-delimited token (after trimming wrapper bars/parens)
 * is a valid guitar/bass chord symbol.
 */
export function isChordToken(rawToken: string): boolean {
  const token = rawToken.trim();
  if (!token) return false;
  // Reject trailing punctuation like commas or periods inside lyrics ("Am.", "A,", "E!")
  if (/[.,!?;:]$/.test(token)) return false;

  const match = CHORD_TOKEN_REGEX.exec(token);
  if (!match) return false;

  const root = match[1];
  const bass = match[2];
  if (!(root in NOTE_INDEX)) return false;
  if (bass && !(bass in NOTE_INDEX)) return false;

  return true;
}

function splitPreservingWrappers(line: string): Array<{
  text: string;
  startCol: number;
  endCol: number;
  isWrapper: boolean;
}> {
  const tokens: Array<{ text: string; startCol: number; endCol: number; isWrapper: boolean }> = [];
  const regex = /(\S+)/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(line)) !== null) {
    const raw = m[1];
    const baseStart = m.index;

    // Separate leading/trailing bars or parentheses around chords, e.g. "(Am)" or "|Am|"
    let leading = "";
    let core = raw;
    let trailing = "";

    while (core.length > 1 && (core.startsWith("|") || core.startsWith("("))) {
      leading += core[0];
      core = core.slice(1);
    }
    while (
      core.length > 1 &&
      (core.endsWith("|") || (core.endsWith(")") && !core.includes("(")))
    ) {
      trailing = core[core.length - 1] + trailing;
      core = core.slice(0, -1);
    }

    let cursor = baseStart;
    if (leading) {
      tokens.push({
        text: leading,
        startCol: cursor,
        endCol: cursor + leading.length,
        isWrapper: true,
      });
      cursor += leading.length;
    }

    tokens.push({
      text: core,
      startCol: cursor,
      endCol: cursor + core.length,
      isWrapper: false,
    });
    cursor += core.length;

    if (trailing) {
      tokens.push({
        text: trailing,
        startCol: cursor,
        endCol: cursor + trailing.length,
        isWrapper: true,
      });
    }
  }

  return tokens;
}

/**
 * Uses line-level chord-density heuristics to separate true chord lines from lyric lines
 * so words like "A", "Am", or "E" in regular Turkish or English prose are never modified.
 */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Strip optional leading section labels like "[Intro]" or "Nakarat:"
  let remainder = trimmed;
  while (SECTION_PREFIX_REGEX.test(remainder)) {
    const next = remainder.replace(SECTION_PREFIX_REGEX, "").trim();
    if (next === remainder) break;
    remainder = next;
  }

  // Pure section header like "[Nakarat]" has no chords to transpose
  if (!remainder) return false;

  // Remove inline bracketed annotations like "[x2]" before scanning
  remainder = remainder.replace(/\[[^\]]+\]/g, " ").trim();
  if (!remainder) return false;

  // Turkish diacritics or sentence punctuation strongly indicate lyrics, not a chord line
  if (TURKISH_OR_SENTENCE_CHAR_REGEX.test(remainder)) {
    return false;
  }

  const parts = splitPreservingWrappers(remainder);
  let chordCount = 0;
  let totalEvaluated = 0;

  for (const part of parts) {
    if (part.isWrapper) continue;
    const lower = part.text.toLowerCase();
    if (NON_CHORD_MUSICAL_MARKERS.has(lower) || REPEAT_MARKER_REGEX.test(part.text)) {
      continue;
    }
    totalEvaluated++;
    if (isChordToken(part.text)) {
      chordCount++;
    }
  }

  if (chordCount === 0 || totalEvaluated === 0) return false;

  // Single token on a line: allow standard chords like "Am", "F#m7", "G/B",
  // and guard against an ambiguous standalone "A" unless it's uppercase in isolation
  if (totalEvaluated === 1 && chordCount === 1) {
    return true;
  }

  const ratio = chordCount / totalEvaluated;
  return ratio >= 0.65;
}

/**
 * Transposes a single note root by `semitones` (-11 to +11) with clean enharmonic spelling.
 */
export function transposeNote(note: string, semitones: number, preferFlats?: boolean): string {
  const idx = NOTE_INDEX[note];
  if (idx === undefined) return note;

  const targetIdx = ((idx + semitones) % 12 + 12) % 12;
  const useFlats =
    preferFlats !== undefined
      ? preferFlats
      : note.includes("b") || FLAT_PREF_INDICES.has(targetIdx);

  return useFlats ? FLAT_SCALE[targetIdx] : SHARP_SCALE[targetIdx];
}

/**
 * Transposes an entire chord symbol (root + quality/extensions + optional slash bass note).
 */
export function transposeChord(chord: string, semitones: number): string {
  const normalizedOffset = ((semitones % 12) + 12) % 12;
  if (normalizedOffset === 0) return chord;

  const match = CHORD_TOKEN_REGEX.exec(chord);
  if (!match) return chord;

  const root = match[1];
  const bass = match[2];

  const rootIdx = NOTE_INDEX[root];
  const targetIdx = ((rootIdx + semitones) % 12 + 12) % 12;
  const preferFlats =
    FLAT_PREF_INDICES.has(targetIdx) || (root.includes("b") && targetIdx !== 6 && targetIdx !== 11);

  const newRoot = transposeNote(root, semitones, preferFlats);

  // Extract suffix between root and optional slash bass
  const suffixEnd = bass ? chord.lastIndexOf("/") : chord.length;
  const suffix = chord.slice(root.length, suffixEnd);

  if (bass) {
    const newBass = transposeNote(bass, semitones, preferFlats);
    return `${newRoot}${suffix}/${newBass}`;
  }

  return `${newRoot}${suffix}`;
}

/**
 * Transposes all chord tokens on a chord line while preserving exact character column positions
 * for subsequent chords so alignment over lyric syllables remains intact.
 */
export function transposeChordLine(line: string, semitones: number): string {
  if (!isChordLine(line)) return line;

  const tokens = splitPreservingWrappers(line);
  if (tokens.length === 0) return line;

  let result = "";
  let inBracketOrPrefix = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : null;

    if (token.text.startsWith("[")) {
      inBracketOrPrefix = !token.text.endsWith("]");
    } else if (inBracketOrPrefix && token.text.endsWith("]")) {
      inBracketOrPrefix = false;
    }

    const isPrefixWord =
      inBracketOrPrefix ||
      token.text.startsWith("[") ||
      token.text.endsWith(":") ||
      REPEAT_MARKER_REGEX.test(token.text);

    const outText =
      !token.isWrapper && !isPrefixWord && isChordToken(token.text)
        ? transposeChord(token.text, semitones)
        : token.text;

    if (prev && prev.endCol === token.startCol) {
      // Zero whitespace originally (e.g., "|Am|" or "(Em)")
      result += outText;
    } else if (result.length === 0) {
      result += " ".repeat(token.startCol) + outText;
    } else {
      const targetStart = Math.max(token.startCol, result.length + 1);
      result += " ".repeat(targetStart - result.length) + outText;
    }
  }

  return result;
}

/**
 * Transposes a multi-line chord+lyric sheet by `semitones` (-11 to +11).
 */
export function transposeContent(content: string, semitones: number): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (semitones === 0) return lines.join("\n");
  return lines.map((line) => transposeChordLine(line, semitones)).join("\n");
}

/**
 * Parses a sheet into typed line segments so chord tokens render in bold turquoise
 * with exact monospace spacing preserved.
 */
export function parseSheetLines(content: string, semitones: number): ParsedSheetLine[] {
  const rawLines = content.replace(/\r\n/g, "\n").split("\n");

  return rawLines.map((rawLine) => {
    const chordLine = isChordLine(rawLine);
    if (!chordLine) {
      return {
        isChordLine: false,
        segments: [{ text: rawLine, isChord: false }],
        raw: rawLine,
      };
    }

    const transposedLine = semitones === 0 ? rawLine : transposeChordLine(rawLine, semitones);
    const tokens = splitPreservingWrappers(transposedLine);
    const segments: SheetSegment[] = [];
    let cursor = 0;
    let inBracket = false;

    for (const token of tokens) {
      if (token.startCol > cursor) {
        segments.push({
          text: transposedLine.slice(cursor, token.startCol),
          isChord: false,
        });
      }

      if (token.text.startsWith("[")) {
        inBracket = !token.text.endsWith("]");
      } else if (inBracket && token.text.endsWith("]")) {
        inBracket = false;
      }

      const isPrefixWord =
        inBracket ||
        token.text.startsWith("[") ||
        token.text.endsWith(":") ||
        REPEAT_MARKER_REGEX.test(token.text);

      const chord = !token.isWrapper && !isPrefixWord && isChordToken(token.text);
      segments.push({ text: token.text, isChord: chord });
      cursor = token.endCol;
    }

    if (cursor < transposedLine.length) {
      segments.push({ text: transposedLine.slice(cursor), isChord: false });
    }

    return {
      isChordLine: true,
      segments,
      raw: transposedLine,
    };
  });
}

export function formatOffsetBadge(offset: number): string {
  if (offset === 0) return "0";
  return offset > 0 ? `+${offset}` : `${offset}`;
}
