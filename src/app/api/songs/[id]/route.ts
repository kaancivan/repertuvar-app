import { NextRequest, NextResponse } from "next/server";
import { deleteSong, getSongById, updateSong } from "@/lib/db";
import { detectOriginalKey, normalizeSongContent } from "@/lib/parser";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const song = await getSongById(id);
    if (!song) {
      return NextResponse.json({ error: "Şarkı bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ song });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("GET /api/songs/[id] failed:", err);
    return NextResponse.json({ error: `Şarkı yüklenemedi: ${detail}` }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const nextContent =
      typeof body.content === "string" ? normalizeSongContent(body.content) : undefined;

    let nextOffset: number | undefined = undefined;
    if (body.transposeOffset !== undefined) {
      const parsed = Number(body.transposeOffset);
      nextOffset = Number.isFinite(parsed)
        ? Math.max(-11, Math.min(11, Math.trunc(parsed)))
        : 0;
    }

    const nextTags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : undefined;

    const updated = await updateSong(id, {
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.artist === "string" ? { artist: body.artist } : {}),
      ...(nextContent !== undefined ? { content: nextContent } : {}),
      ...(body.originalKey !== undefined
        ? {
            originalKey:
              (typeof body.originalKey === "string" && body.originalKey.trim()) ||
              (nextContent ? detectOriginalKey(nextContent) : null),
          }
        : {}),
      ...(nextOffset !== undefined ? { transposeOffset: nextOffset } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.sourceUrl !== undefined ? { sourceUrl: body.sourceUrl } : {}),
      ...(nextTags !== undefined ? { tags: nextTags } : {}),
    });

    if (!updated) {
      return NextResponse.json({ error: "Şarkı bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ song: updated });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("PATCH /api/songs/[id] failed:", err);
    return NextResponse.json({ error: `Güncelleme başarısız: ${detail}` }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteSong(id);
    if (!deleted) {
      return NextResponse.json({ error: "Şarkı bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("DELETE /api/songs/[id] failed:", err);
    return NextResponse.json({ error: `Silme başarısız: ${detail}` }, { status: 500 });
  }
}
