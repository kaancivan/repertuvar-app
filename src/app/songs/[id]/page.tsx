import { notFound } from "next/navigation";
import { getSongById, listTags } from "@/lib/db";
import { SongViewer } from "@/components/SongViewer";

export const dynamic = "force-dynamic";

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [song, tags] = await Promise.all([getSongById(id), listTags()]);

  if (!song) {
    notFound();
  }

  return <SongViewer initialSong={song} allTags={tags} />;
}
