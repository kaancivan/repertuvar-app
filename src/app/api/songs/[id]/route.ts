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
    console.error("GET /api/songs/[id] failed:", err);
    return NextResponse.json({ error: "Şarkı yüklenemedi." }, { status: 500 });
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
      transposeOffset?: number;
      notes?: string | null;
      sourceUrl?: string | null;
      tags?: string[];
    };

    const nextContent =
      body.content !== undefined ? normalizeSongContent(body.content) : undefined;
    const nextOffset =
      body.transposeOffset !== undefined
        ? Math.max(-11, Math.min(11, Math.trunc(body.transposeOffset)))
        : undefined;

    const updated = await updateSong(id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.artist !== undefined ? { artist: body.artist } : {}),
      ...(nextContent !== undefined ? { content: nextContent } : {}),
      ...(body.originalKey !== undefined
        ? {
            originalKey:
              body.originalKey?.trim() ||
              (nextContent ? detectOriginalKey(nextContent) : null),
          }
        : {}),
      ...(nextOffset !== undefined ? { transposeOffset: nextOffset } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.sourceUrl !== undefined ? { sourceUrl: body.sourceUrl } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    });

    if (!updated) {
      return NextResponse.json({ error: "Şarkı bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ song: updated });
  } catch (err) {
    console.error("PATCH /api/songs/[id] failed:", err);
    return NextResponse.json({ error: "Güncelleme başarısız." }, { status: 500 });
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
    console.error("DELETE /api/songs/[id] failed:", err);
    return NextResponse.json({ error: "Silme başarısız." }, { status: 500 });
  }
}
