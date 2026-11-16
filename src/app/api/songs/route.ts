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
    console.error("GET /api/songs failed:", err);
    return NextResponse.json({ error: "Şarkılar yüklenemedi." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      title?: string;
      artist?: string;
      content?: string;
      originalKey?: string | null;
      transposeOffset?: number;
      notes?: string | null;
      sourceUrl?: string | null;
      tags?: string[];
    };

    const title = body.title?.trim() || "";
    const artist = body.artist?.trim() || "";
    const rawContent = body.content || "";

    if (!title || !artist || !rawContent.trim()) {
      return NextResponse.json(
        { error: "Şarkı adı, sanatçı ve akor/söz içeriği zorunludur." },
        { status: 400 }
      );
    }

    const normalizedContent = normalizeSongContent(rawContent);
    const originalKey = body.originalKey?.trim() || detectOriginalKey(normalizedContent);
    const offset =
      typeof body.transposeOffset === "number"
        ? Math.max(-11, Math.min(11, Math.trunc(body.transposeOffset)))
        : 0;

    const song = await createSong({
      title,
      artist,
      content: normalizedContent,
      originalKey,
      transposeOffset: offset,
      notes: body.notes ?? null,
      sourceUrl: body.sourceUrl ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
    });

    return NextResponse.json({ song }, { status: 201 });
  } catch (err) {
    console.error("POST /api/songs failed:", err);
    return NextResponse.json({ error: "Şarkı kaydedilemedi." }, { status: 500 });
  }
}
