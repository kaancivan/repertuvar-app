import { NextRequest, NextResponse } from "next/server";
import { createSong, listSongs } from "@/lib/db";
import { detectOriginalKey, normalizeSongContent } from "@/lib/parser";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
    const tag = request.nextUrl.searchParams.get("tag")?.trim() || "";

    let songs = await listSongs();

    if (tag && tag !== "Tümü") {
      songs = songs.filter((s) =>
        s.tags.some((t) => t.name.toLowerCase() === tag.toLowerCase())
      );
    }

    if (q) {
      songs = songs.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q) ||
          (s.notes && s.notes.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ songs });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Bilinmeyen veritabanı hatası";
    console.error("GET /api/songs failed:", err);
    return NextResponse.json(
      { error: `Şarkılar yüklenemedi: ${detail}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      title?: string;
      artist?: string;
      content?: string;
      originalKey?: string | null;
      transposeOffset?: number | string;
      notes?: string | null;
      sourceUrl?: string | null;
      tags?: unknown;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const artist = typeof body.artist === "string" ? body.artist.trim() : "";
    const rawContent = typeof body.content === "string" ? body.content : "";

    if (!title || !artist || !rawContent.trim()) {
      return NextResponse.json(
        { error: "Şarkı adı, sanatçı ve akor/söz içeriği zorunludur." },
        { status: 400 }
      );
    }

    const normalizedContent = normalizeSongContent(rawContent);
    const originalKey =
      (typeof body.originalKey === "string" && body.originalKey.trim()) ||
      detectOriginalKey(normalizedContent);

    const parsedOffset = Number(body.transposeOffset ?? 0);
    const offset = Number.isFinite(parsedOffset)
      ? Math.max(-11, Math.min(11, Math.trunc(parsedOffset)))
      : 0;

    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : [];

    const song = await createSong({
      title,
      artist,
      content: normalizedContent,
      originalKey,
      transposeOffset: offset,
      notes: typeof body.notes === "string" ? body.notes : null,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      tags,
    });

    return NextResponse.json({ song }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Bilinmeyen veritabanı hatası";
    console.error("POST /api/songs failed:", err);
    return NextResponse.json(
      { error: `Şarkı kaydedilemedi: ${detail}` },
      { status: 500 }
    );
  }
}
