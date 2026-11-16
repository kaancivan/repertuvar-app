import { notFound } from "next/navigation";
import { getSongById, listTags } from "@/lib/db";
import { SongViewer } from "@/components/SongViewer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const [song, tags] = await Promise.all([getSongById(decodedId), listTags()]);

  if (!song) {
    notFound();
  }

  return <SongViewer initialSong={song} allTags={tags} />;
}
