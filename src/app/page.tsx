import { listSongs, listTags } from "@/lib/db";
import { RepertoireLibrary } from "@/components/RepertoireLibrary";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [songs, tags] = await Promise.all([listSongs(), listTags()]);
  return <RepertoireLibrary initialSongs={songs} initialTags={tags} />;
}
