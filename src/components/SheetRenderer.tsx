"use client";

import { useMemo } from "react";
import { parseSheetLines } from "@/lib/transpose";

interface SheetRendererProps {
  content: string;
  transposeOffset: number;
  fontSizePx?: number;
}

const SECTION_HEADER_LINE_REGEX = /^\s*\[[^\]]+\]\s*$/;

export function SheetRenderer({
  content,
  transposeOffset,
  fontSizePx = 15,
}: SheetRendererProps) {
  const parsedLines = useMemo(
    () => parseSheetLines(content, transposeOffset),
    [content, transposeOffset]
  );

  return (
    <div
      className="font-mono leading-[1.6] tracking-normal overflow-x-auto pb-28 select-text"
      style={{ fontSize: `${fontSizePx}px` }}
    >
      <div className="min-w-max">
        {parsedLines.map((line, idx) => {
          if (!line.raw.trim()) {
            return <div key={idx} className="h-4" aria-hidden="true" />;
          }

          if (!line.isChordLine && SECTION_HEADER_LINE_REGEX.test(line.raw)) {
            return (
              <div
                key={idx}
                className="mt-4 mb-1 inline-block rounded bg-slate-800/90 border border-slate-700/70 px-2 py-0.5 text-[0.78em] font-sans font-semibold uppercase tracking-wider text-slate-300"
              >
                {line.raw.trim().replace(/^\[|\]$/g, "")}
              </div>
            );
          }

          if (line.isChordLine) {
            return (
              <div key={idx} className="whitespace-pre leading-[1.45] mt-1">
                {line.segments.map((seg, sIdx) =>
                  seg.isChord ? (
                    <span
                      key={sIdx}
                      className="text-[#2DD4BF] text-teal-400 font-bold"
                    >
                      {seg.text}
                    </span>
                  ) : (
                    <span key={sIdx} className="text-slate-400">
                      {seg.text}
                    </span>
                  )
                )}
              </div>
            );
          }

          return (
            <div key={idx} className="whitespace-pre text-[#F8FAFC] leading-[1.55]">
              {line.raw}
            </div>
          );
        })}
      </div>
    </div>
  );
}
