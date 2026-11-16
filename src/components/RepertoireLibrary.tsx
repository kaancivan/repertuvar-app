"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Guitar,
  LogOut,
  Plus,
  Search,
  Tag as TagIcon,
  X,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import type { SongDTO, TagDTO } from "@/lib/db";
import { formatOffsetBadge, transposeChord } from "@/lib/transpose";

interface RepertoireLibraryProps {
  initialSongs: SongDTO[];
  initialTags: TagDTO[];
}

export function RepertoireLibrary({
  initialSongs,
  initialTags,
}: RepertoireLibraryProps) {
  const router = useRouter();
  const [songs] = useState<SongDTO[]>(initialSongs);
  const [tags, setTags] = useState<TagDTO[]>(initialTags);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("Tümü");
  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return songs.filter((song) => {
      const matchesTag =
        selectedTag === "Tümü" ||
        song.tags.some((t) => t.name.toLowerCase() === selectedTag.toLowerCase());
      if (!matchesTag) return false;

      if (!q) return true;
      return (
        song.title.toLowerCase().includes(q) ||
        song.artist.toLowerCase().includes(q) ||
        song.content.toLowerCase().includes(q) ||
        (song.notes && song.notes.toLowerCase().includes(q))
      );
    });
  }, [songs, selectedTag, searchQuery]);

  async function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    const clean = newTagName.trim();
    if (!clean || creatingTag) return;
    setCreatingTag(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      if (res.ok) {
        const data = (await res.json()) as { tag: TagDTO };
        setTags((prev) =>
          prev.some((t) => t.name.toLowerCase() === data.tag.name.toLowerCase())
            ? prev
            : [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name, "tr"))
        );
        setSelectedTag(data.tag.name);
        setNewTagName("");
        setAddingTag(false);
      }
    } finally {
      setCreatingTag(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#F8FAFC]">
      {/* Sticky Minimal Header */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-400/15 border border-teal-400/30 flex items-center justify-center shrink-0">
              <Guitar className="w-5 h-5 text-[#2DD4BF]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#F8FAFC] truncate">
                Repertuar
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                {songs.length} parça • Gitar & Bas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/add"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2DD4BF] hover:bg-teal-300 active:scale-95 text-[#0F172A] font-semibold text-sm px-3.5 py-2 transition shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Şarkı Ekle</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title="Çıkış Yap"
              aria-label="Çıkış Yap"
              className="p-2 rounded-xl bg-[#1E293B] hover:bg-slate-700/80 border border-slate-700/70 text-slate-300 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Instant Search & Tag Filter Bar */}
        <div className="max-w-4xl mx-auto px-4 pb-3 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Şarkı, sanatçı, söz veya akort notu ara..."
              aria-label="Repertuarda ara"
              className="w-full rounded-xl bg-[#1E293B]/90 border border-slate-700/70 focus:border-[#2DD4BF] focus:outline-none pl-10 pr-9 py-2.5 text-sm text-[#F8FAFC] placeholder:text-slate-400 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Aramayı temizle"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Horizontal Scrollable Tag Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedTag("Tümü")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition border ${
                selectedTag === "Tümü"
                  ? "bg-[#2DD4BF] text-[#0F172A] border-[#2DD4BF] font-semibold"
                  : "bg-[#1E293B] text-slate-300 border-slate-700/70 hover:border-slate-500"
              }`}
            >
              Tümü ({songs.length})
            </button>

            {tags.map((tag) => {
              const active = selectedTag.toLowerCase() === tag.name.toLowerCase();
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTag(tag.name)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition border ${
                    active
                      ? "bg-[#2DD4BF] text-[#0F172A] border-[#2DD4BF] font-semibold"
                      : "bg-[#1E293B] text-slate-300 border-slate-700/70 hover:border-slate-500"
                  }`}
                >
                  <TagIcon className="w-3 h-3 opacity-80" />
                  <span>{tag.name}</span>
                </button>
              );
            })}

            {addingTag ? (
              <form onSubmit={handleCreateTag} className="shrink-0 flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Yeni etiket..."
                  className="w-28 rounded-full bg-[#0F172A] border border-teal-400/70 px-3 py-1 text-xs text-[#F8FAFC] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={creatingTag}
                  className="rounded-full bg-[#2DD4BF] text-[#0F172A] px-2.5 py-1 text-xs font-semibold"
                >
                  Ekle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingTag(false);
                    setNewTagName("");
                  }}
                  className="p-1 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingTag(true)}
                className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium bg-slate-800/60 text-slate-400 hover:text-teal-300 border border-dashed border-slate-700 transition"
              >
                <Plus className="w-3 h-3" />
                <span>Etiket</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Song List */}
      <main className="max-w-4xl mx-auto px-4 py-4 pb-16">
        {filteredSongs.length === 0 ? (
          <div className="rounded-2xl bg-[#1E293B]/50 border border-slate-800 p-8 text-center mt-4">
            <p className="text-slate-300 font-medium">
              {searchQuery || selectedTag !== "Tümü"
                ? "Aramanızla eşleşen şarkı bulunamadı."
                : "Repertuarınız henüz boş."}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery || selectedTag !== "Tümü"
                ? "Farklı bir filtre deneyin veya yeni bir şarkı ekleyin."
                : "Sağ üstten ilk şarkınızı ekleyerek başlayın."}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {(searchQuery || selectedTag !== "Tümü") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedTag("Tümü");
                  }}
                  className="rounded-xl bg-[#1E293B] border border-slate-700 px-4 py-2 text-xs text-slate-200"
                >
                  Filtreleri Sıfırla
                </button>
              )}
              <Link
                href="/add"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#2DD4BF] text-[#0F172A] font-semibold px-4 py-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Şarkı Ekle
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredSongs.map((song) => {
              const effectiveKey =
                song.originalKey && song.transposeOffset !== 0
                  ? transposeChord(song.originalKey, song.transposeOffset)
                  : song.originalKey;

              return (
                <Link
                  key={song.id}
                  href={`/songs/${song.id}`}
                  className="group rounded-2xl bg-[#1E293B]/65 hover:bg-[#1E293B] border border-slate-800 hover:border-teal-400/40 p-4 transition flex flex-col justify-between gap-3 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-[#F8FAFC] group-hover:text-teal-300 transition truncate">
                        {song.title}
                      </h2>
                      <p className="text-sm text-slate-400 truncate">{song.artist}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {song.transposeOffset !== 0 && (
                        <span
                          title="Kayıtlı Transpoze"
                          className="inline-flex items-center gap-1 rounded-lg bg-teal-400/15 border border-teal-400/40 px-2 py-0.5 font-mono text-xs font-bold text-[#2DD4BF]"
                        >
                          {formatOffsetBadge(song.transposeOffset)}
                          {effectiveKey ? ` (${effectiveKey})` : ""}
                        </span>
                      )}
                      {song.transposeOffset === 0 && song.originalKey && (
                        <span className="rounded-lg bg-[#0F172A] border border-slate-700/80 px-2 py-0.5 font-mono text-xs text-slate-300">
                          {song.originalKey}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 transition" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {song.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-md bg-[#0F172A]/90 border border-slate-700/60 px-2 py-0.5 text-[11px] text-slate-300"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>

                    {song.notes && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 max-w-full truncate">
                        <SlidersHorizontal className="w-3 h-3 text-teal-400/80 shrink-0" />
                        <span className="truncate">{song.notes}</span>
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
