import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "./prisma";

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

interface LocalStore {
  tags: { id: string; name: string }[];
  songs: Array<{
    id: string;
    title: string;
    artist: string;
    content: string;
    originalKey: string | null;
    transposeOffset: number;
    notes: string | null;
    sourceUrl: string | null;
    tagIds: string[];
    createdAt: string;
    updatedAt: string;
  }>;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "repertoire.json");

function isLiveDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim() || "";
  if (!url) return false;
  if (url.includes("ep-example-123456") || url.includes("user:password@")) {
    return false;
  }
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function createDefaultStore(): LocalStore {
  const now = new Date().toISOString();
  const tagAkustik = { id: "tag_akustik", name: "Akustik" };
  const tagElektro = { id: "tag_elektro", name: "Elektro" };
  const tagBas = { id: "tag_bas", name: "Bas" };
  const tagSetlist = { id: "tag_setlist1", name: "Setlist 1" };

  return {
    tags: [tagAkustik, tagElektro, tagBas, tagSetlist],
    songs: [
      {
        id: "song_senden_daha_guzel",
        title: "Senden Daha Güzel",
        artist: "Duman",
        originalKey: "Am",
        transposeOffset: 0,
        notes: "Standart Akort (E A D G B E) • Clean Telecaster tonu, nakaratta hafif overdrive",
        sourceUrl: null,
        tagIds: [tagAkustik.id, tagElektro.id, tagSetlist.id],
        createdAt: now,
        updatedAt: now,
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
        id: "song_bir_derdim_var",
        title: "Bir Derdim Var",
        artist: "Mor ve Ötesi",
        originalKey: "Em",
        transposeOffset: 0,
        notes: "Standart E • Verse arpej, nakaratta güçlü distortion + delay",
        sourceUrl: null,
        tagIds: [tagElektro.id, tagSetlist.id],
        createdAt: now,
        updatedAt: now,
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
        id: "song_nothing_else_matters",
        title: "Nothing Else Matters",
        artist: "Metallica",
        originalKey: "Em",
        transposeOffset: 0,
        notes: "6/8 Ritim • Parmak stili (Fingerpicking) giriş • Clean Jazz Chorus + Reverb",
        sourceUrl: null,
        tagIds: [tagAkustik.id, tagElektro.id],
        createdAt: now,
        updatedAt: now,
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
        id: "song_hysteria_bass",
        title: "Hysteria (Bass & Guitar)",
        artist: "Muse",
        originalKey: "Am",
        transposeOffset: 0,
        notes: "Drop D yok (Standart E) • Bas: Big Muff Fuzz + Octave / 16th-note pena veya parmak",
        sourceUrl: null,
        tagIds: [tagBas.id, tagElektro.id],
        createdAt: now,
        updatedAt: now,
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
    ],
  };
}

function readLocalStore(): LocalStore {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const initial = createDefaultStore();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw) as LocalStore;
  } catch {
    return createDefaultStore();
  }
}

function writeLocalStore(store: LocalStore): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function mapLocalSong(song: LocalStore["songs"][number], tags: LocalStore["tags"]): SongDTO {
  const songTags = song.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is { id: string; name: string } => Boolean(t));

  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    content: song.content,
    originalKey: song.originalKey,
    transposeOffset: song.transposeOffset,
    notes: song.notes,
    sourceUrl: song.sourceUrl,
    tags: songTags,
    createdAt: song.createdAt,
    updatedAt: song.updatedAt,
  };
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

export async function listSongs(): Promise<SongDTO[]> {
  if (isLiveDatabaseConfigured()) {
    try {
      const songs = await prisma.song.findMany({
        include: { tags: true },
        orderBy: { updatedAt: "desc" },
      });
      return songs.map(mapPrismaSong);
    } catch (err) {
      console.error("Prisma listSongs error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  return store.songs
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((s) => mapLocalSong(s, store.tags));
}

export async function getSongById(id: string): Promise<SongDTO | null> {
  if (isLiveDatabaseConfigured()) {
    try {
      const song = await prisma.song.findUnique({
        where: { id },
        include: { tags: true },
      });
      return song ? mapPrismaSong(song) : null;
    } catch (err) {
      console.error("Prisma getSongById error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  const found = store.songs.find((s) => s.id === id);
  return found ? mapLocalSong(found, store.tags) : null;
}

export async function createSong(input: CreateSongInput): Promise<SongDTO> {
  const cleanTags = Array.from(
    new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))
  );

  if (isLiveDatabaseConfigured()) {
    try {
      const song = await prisma.song.create({
        data: {
          title: input.title.trim(),
          artist: input.artist.trim(),
          content: input.content,
          originalKey: input.originalKey?.trim() || null,
          transposeOffset: input.transposeOffset ?? 0,
          notes: input.notes?.trim() || null,
          sourceUrl: input.sourceUrl?.trim() || null,
          tags: {
            connectOrCreate: cleanTags.map((name) => ({
              where: { name },
              create: { name },
            })),
          },
        },
        include: { tags: true },
      });
      return mapPrismaSong(song);
    } catch (err) {
      console.error("Prisma createSong error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  const tagIds: string[] = [];
  for (const name of cleanTags) {
    let existing = store.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      existing = { id: `tag_${crypto.randomUUID().slice(0, 8)}`, name };
      store.tags.push(existing);
    }
    tagIds.push(existing.id);
  }

  const now = new Date().toISOString();
  const newSong = {
    id: `song_${crypto.randomUUID().slice(0, 10)}`,
    title: input.title.trim(),
    artist: input.artist.trim(),
    content: input.content,
    originalKey: input.originalKey?.trim() || null,
    transposeOffset: input.transposeOffset ?? 0,
    notes: input.notes?.trim() || null,
    sourceUrl: input.sourceUrl?.trim() || null,
    tagIds,
    createdAt: now,
    updatedAt: now,
  };
  store.songs.unshift(newSong);
  writeLocalStore(store);
  return mapLocalSong(newSong, store.tags);
}

export async function updateSong(id: string, input: UpdateSongInput): Promise<SongDTO | null> {
  const cleanTags = input.tags
    ? Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)))
    : undefined;

  if (isLiveDatabaseConfigured()) {
    try {
      const existing = await prisma.song.findUnique({ where: { id } });
      if (!existing) return null;

      const updated = await prisma.song.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.artist !== undefined ? { artist: input.artist.trim() } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.originalKey !== undefined
            ? { originalKey: input.originalKey?.trim() || null }
            : {}),
          ...(input.transposeOffset !== undefined
            ? { transposeOffset: input.transposeOffset }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          ...(input.sourceUrl !== undefined
            ? { sourceUrl: input.sourceUrl?.trim() || null }
            : {}),
          ...(cleanTags !== undefined
            ? {
                tags: {
                  set: [],
                  connectOrCreate: cleanTags.map((name) => ({
                    where: { name },
                    create: { name },
                  })),
                },
              }
            : {}),
        },
        include: { tags: true },
      });
      return mapPrismaSong(updated);
    } catch (err) {
      console.error("Prisma updateSong error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  const idx = store.songs.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const current = store.songs[idx];
  let nextTagIds = current.tagIds;

  if (cleanTags !== undefined) {
    nextTagIds = [];
    for (const name of cleanTags) {
      let tag = store.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!tag) {
        tag = { id: `tag_${crypto.randomUUID().slice(0, 8)}`, name };
        store.tags.push(tag);
      }
      nextTagIds.push(tag.id);
    }
  }

  const updated = {
    ...current,
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.artist !== undefined ? { artist: input.artist.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.originalKey !== undefined
      ? { originalKey: input.originalKey?.trim() || null }
      : {}),
    ...(input.transposeOffset !== undefined
      ? { transposeOffset: input.transposeOffset }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl?.trim() || null } : {}),
    tagIds: nextTagIds,
    updatedAt: new Date().toISOString(),
  };

  store.songs[idx] = updated;
  writeLocalStore(store);
  return mapLocalSong(updated, store.tags);
}

export async function deleteSong(id: string): Promise<boolean> {
  if (isLiveDatabaseConfigured()) {
    try {
      await prisma.song.delete({ where: { id } });
      return true;
    } catch (err) {
      console.error("Prisma deleteSong error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  const before = store.songs.length;
  store.songs = store.songs.filter((s) => s.id !== id);
  if (store.songs.length === before) return false;
  writeLocalStore(store);
  return true;
}

export async function listTags(): Promise<TagDTO[]> {
  if (isLiveDatabaseConfigured()) {
    try {
      const tags = await prisma.tag.findMany({
        include: { _count: { select: { songs: true } } },
        orderBy: { name: "asc" },
      });
      return tags.map((t) => ({ id: t.id, name: t.name, songCount: t._count.songs }));
    } catch (err) {
      console.error("Prisma listTags error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  return store.tags
    .map((t) => ({
      id: t.id,
      name: t.name,
      songCount: store.songs.filter((s) => s.tagIds.includes(t.id)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export async function createTag(name: string): Promise<TagDTO> {
  const cleanName = name.trim();
  if (isLiveDatabaseConfigured()) {
    try {
      const tag = await prisma.tag.upsert({
        where: { name: cleanName },
        update: {},
        create: { name: cleanName },
      });
      return { id: tag.id, name: tag.name };
    } catch (err) {
      console.error("Prisma createTag error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  const existing = store.tags.find((t) => t.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return existing;

  const created = { id: `tag_${crypto.randomUUID().slice(0, 8)}`, name: cleanName };
  store.tags.push(created);
  writeLocalStore(store);
  return created;
}

export async function deleteTag(id: string): Promise<boolean> {
  if (isLiveDatabaseConfigured()) {
    try {
      await prisma.tag.delete({ where: { id } });
      return true;
    } catch (err) {
      console.error("Prisma deleteTag error, falling back to local store:", err);
    }
  }

  const store = readLocalStore();
  const before = store.tags.length;
  store.tags = store.tags.filter((t) => t.id !== id);
  if (store.tags.length === before) return false;
  store.songs = store.songs.map((s) => ({
    ...s,
    tagIds: s.tagIds.filter((tid) => tid !== id),
  }));
  writeLocalStore(store);
  return true;
}
