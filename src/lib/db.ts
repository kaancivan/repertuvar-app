import { prisma, requireDatabaseConfigured } from "./prisma";

export interface TagDTO {
  id: string;
  name: string;
  songCount?: number;
}

export interface SongDTO {
  id: string;
  title: string;
  artist: string;
  content: string;
  originalKey: string | null;
  transposeOffset: number;
  notes: string | null;
  sourceUrl: string | null;
  tags: TagDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSongInput {
  title: string;
  artist: string;
  content: string;
  originalKey?: string | null;
  transposeOffset?: number;
  notes?: string | null;
  sourceUrl?: string | null;
  tags?: string[];
}

export interface UpdateSongInput {
  title?: string;
  artist?: string;
  content?: string;
  originalKey?: string | null;
  transposeOffset?: number;
  notes?: string | null;
  sourceUrl?: string | null;
  tags?: string[];
}

const INITIAL_SEED_SONGS: CreateSongInput[] = [
  {
    title: "Senden Daha Güzel",
    artist: "Duman",
    originalKey: "Am",
    transposeOffset: 0,
    notes: "Standart Akort (E A D G B E) • Clean Telecaster tonu, nakaratta hafif overdrive",
    tags: ["Akustik", "Elektro", "Setlist 1"],
    content: `[Intro]
Am   G   F   E   (x2)

[Verse 1]
Am                    G
Kimseyi görmedim ben senden daha güzel
F                        E
Kimseyi tanımadım ben senden daha özel
Am                    G
Kimselere de bakmadım aklımdan geçmedi
F                        E
Kimseyi tanımadım ben senden daha güzel

[Nakarat]
Dm          Am
Senden daha güzel
F           E
Senden daha güzel
Dm          Am
Senden daha güzel
F     E     Am
Senden daha güzel

[Solo]
| Am  | G   | F   | E   | (x2)`,
  },
  {
    title: "Bir Derdim Var",
    artist: "Mor ve Ötesi",
    originalKey: "Em",
    transposeOffset: 0,
    notes: "Standart E • Verse arpej, nakaratta güçlü distortion + delay",
    tags: ["Elektro", "Setlist 1"],
    content: `[Intro]
Em   C   G   D   (x2)

[Verse]
Em                 C
Bir derdim var artık tutamam içimde
G                  D
Gitsem nereye kadar kalsam neye yarar
Em                 C
Hiç anlatamadım hiç anlamadılar
G                  D
Herkes neden düşman herkes neden susar

[Nakarat]
Em       C          G         D
Bir derdim var bin dermana değişmem asla
Em       C          G         D
Bir derdim var bin dermana değişmem

[Bridge]
Am                C
Korkularım var benim
G                 D
Yalnızlığım var benim`,
  },
  {
    title: "Nothing Else Matters",
    artist: "Metallica",
    originalKey: "Em",
    transposeOffset: 0,
    notes: "6/8 Ritim • Parmak stili (Fingerpicking) giriş • Clean Jazz Chorus + Reverb",
    tags: ["Akustik", "Elektro"],
    content: `[Intro]
Em   D   C   G   B7   Em

[Verse 1]
Em              D        C
So close, no matter how far
Em                D         C
Couldn't be much more from the heart
Em              D        C
Forever trusting who we are
G        B7          Em
And nothing else matters

[Chorus]
C        A          D
Never cared for what they do
C        A          D
Never cared for what they know
Em
But I know`,
  },
  {
    title: "Hysteria (Bass & Guitar)",
    artist: "Muse",
    originalKey: "Am",
    transposeOffset: 0,
    notes: "Drop D yok (Standart E) • Bas: Big Muff Fuzz + Octave / 16th-note pena veya parmak",
    tags: ["Bas", "Elektro"],
    content: `[Main Riff]
Am   D/F#   G   Am   (x2)

[Verse]
Am                  D/F#
It's bugging me, grating me
G                   Am
And twisting me around
Am                  D/F#
Yeah I'm endlessly caving in
G                   Am
And turning inside out

[Chorus]
C          G         Dm        Am
'Cause I want it now, I want it now
F          C         G         E7
Give me your heart and your soul
C          G         Dm        Am
And I'm breaking out, I'm breaking out
F          E7        Am
Last chance to lose control`,
  },
];

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, 800));
    return withRetry(fn, retries - 1);
  }
}

async function resolveTagIds(tagNames: string[]): Promise<{ id: string }[]> {
  const uniqueNames = Array.from(
    new Set(tagNames.map((t) => t.trim()).filter(Boolean))
  );
  if (uniqueNames.length === 0) return [];

  const records: { id: string }[] = [];
  for (const name of uniqueNames) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    records.push({ id: tag.id });
  }
  return records;
}

function mapPrismaSong(song: {
  id: string;
  title: string;
  artist: string;
  content: string;
  originalKey: string | null;
  transposeOffset: number;
  notes: string | null;
  sourceUrl: string | null;
  tags: { id: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}): SongDTO {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    content: song.content,
    originalKey: song.originalKey,
    transposeOffset: song.transposeOffset,
    notes: song.notes,
    sourceUrl: song.sourceUrl,
    tags: song.tags.map((t) => ({ id: t.id, name: t.name })),
    createdAt: song.createdAt.toISOString(),
    updatedAt: song.updatedAt.toISOString(),
  };
}

let seedInProgress: Promise<void> | null = null;

async function ensureInitialSeedIfEmpty(): Promise<void> {
  if (seedInProgress) return seedInProgress;

  seedInProgress = (async () => {
    try {
      const songCount = await prisma.song.count();
      if (songCount > 0) return;

      for (const item of INITIAL_SEED_SONGS) {
        const tagRecords = await resolveTagIds(item.tags ?? []);
        await prisma.song.create({
          data: {
            title: item.title,
            artist: item.artist,
            content: item.content,
            originalKey: item.originalKey ?? null,
            transposeOffset: item.transposeOffset ?? 0,
            notes: item.notes ?? null,
            sourceUrl: null,
            ...(tagRecords.length > 0 ? { tags: { connect: tagRecords } } : {}),
          },
        });
      }
    } catch (err) {
      console.error("Initial seed check failed:", err);
    }
  })();

  try {
    await seedInProgress;
  } finally {
    seedInProgress = null;
  }
}

export async function listSongs(): Promise<SongDTO[]> {
  requireDatabaseConfigured();

  return await withRetry(async () => {
    let songs = await prisma.song.findMany({
      include: { tags: true },
      orderBy: { updatedAt: "desc" },
    });

    if (songs.length === 0) {
      await ensureInitialSeedIfEmpty();
      songs = await prisma.song.findMany({
        include: { tags: true },
        orderBy: { updatedAt: "desc" },
      });
    }

    return songs.map(mapPrismaSong);
  });
}

export async function getSongById(id: string): Promise<SongDTO | null> {
  requireDatabaseConfigured();
  const cleanId = id.trim();
  if (!cleanId) return null;

  return await withRetry(async () => {
    const song = await prisma.song.findUnique({
      where: { id: cleanId },
      include: { tags: true },
    });
    return song ? mapPrismaSong(song) : null;
  });
}

export async function createSong(input: CreateSongInput): Promise<SongDTO> {
  requireDatabaseConfigured();
  const cleanTags = Array.from(
    new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))
  );

  return await withRetry(async () => {
    const tagRecords = await resolveTagIds(cleanTags);
    const song = await prisma.song.create({
      data: {
        title: input.title.trim(),
        artist: input.artist.trim(),
        content: input.content,
        originalKey: input.originalKey?.trim() || null,
        transposeOffset: Number.isFinite(Number(input.transposeOffset))
          ? Math.trunc(Number(input.transposeOffset))
          : 0,
        notes: input.notes?.trim() || null,
        sourceUrl: input.sourceUrl?.trim() || null,
        ...(tagRecords.length > 0
          ? {
              tags: {
                connect: tagRecords,
              },
            }
          : {}),
      },
      include: { tags: true },
    });
    return mapPrismaSong(song);
  });
}

export async function updateSong(
  id: string,
  input: UpdateSongInput
): Promise<SongDTO | null> {
  requireDatabaseConfigured();
  const cleanId = id.trim();
  const cleanTags = input.tags
    ? Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)))
    : undefined;

  return await withRetry(async () => {
    const existing = await prisma.song.findUnique({ where: { id: cleanId } });
    if (!existing) return null;

    const tagRecords =
      cleanTags !== undefined ? await resolveTagIds(cleanTags) : undefined;

    const updated = await prisma.song.update({
      where: { id: cleanId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.artist !== undefined ? { artist: input.artist.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.originalKey !== undefined
          ? { originalKey: input.originalKey?.trim() || null }
          : {}),
        ...(input.transposeOffset !== undefined
          ? {
              transposeOffset: Number.isFinite(Number(input.transposeOffset))
                ? Math.trunc(Number(input.transposeOffset))
                : 0,
            }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.sourceUrl !== undefined
          ? { sourceUrl: input.sourceUrl?.trim() || null }
          : {}),
        ...(tagRecords !== undefined
          ? {
              tags: {
                set: tagRecords,
              },
            }
          : {}),
      },
      include: { tags: true },
    });
    return mapPrismaSong(updated);
  });
}

export async function deleteSong(id: string): Promise<boolean> {
  requireDatabaseConfigured();
  try {
    await withRetry(() => prisma.song.delete({ where: { id: id.trim() } }));
    return true;
  } catch {
    return false;
  }
}

export async function listTags(): Promise<TagDTO[]> {
  requireDatabaseConfigured();
  return await withRetry(async () => {
    const tags = await prisma.tag.findMany({
      include: { _count: { select: { songs: true } } },
      orderBy: { name: "asc" },
    });
    return tags.map((t) => ({ id: t.id, name: t.name, songCount: t._count.songs }));
  });
}

export async function createTag(name: string): Promise<TagDTO> {
  requireDatabaseConfigured();
  const cleanName = name.trim();
  return await withRetry(async () => {
    const tag = await prisma.tag.upsert({
      where: { name: cleanName },
      update: {},
      create: { name: cleanName },
    });
    return { id: tag.id, name: tag.name };
  });
}

export async function deleteTag(id: string): Promise<boolean> {
  requireDatabaseConfigured();
  try {
    await withRetry(() => prisma.tag.delete({ where: { id: id.trim() } }));
    return true;
  } catch {
    return false;
  }
}
