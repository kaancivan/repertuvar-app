import { NextRequest, NextResponse } from "next/server";
import { createTag, deleteTag, listTags } from "@/lib/db";

export async function GET() {
  try {
    const tags = await listTags();
    return NextResponse.json({ tags });
  } catch (err) {
    console.error("GET /api/tags failed:", err);
    return NextResponse.json({ error: "Etiketler yüklenemedi." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim() || "";
    if (!name) {
      return NextResponse.json({ error: "Etiket adı boş olamaz." }, { status: 400 });
    }
    const tag = await createTag(name);
    return NextResponse.json({ tag }, { status: 201 });
  } catch (err) {
    console.error("POST /api/tags failed:", err);
    return NextResponse.json({ error: "Etiket oluşturulamadı." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) {
      return NextResponse.json({ error: "Etiket ID gerekli." }, { status: 400 });
    }
    await deleteTag(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/tags failed:", err);
    return NextResponse.json({ error: "Etiket silinemedi." }, { status: 500 });
  }
}
