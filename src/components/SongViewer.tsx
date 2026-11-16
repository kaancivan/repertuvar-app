"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Edit3,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { SongDTO, TagDTO } from "@/lib/db";
import { SheetRenderer } from "./SheetRenderer";
import { formatOffsetBadge, transposeChord } from "@/lib/transpose";
import { normalizeSongContent } from "@/lib/parser";

interface SongViewerProps {
  initialSong: SongDTO;
  allTags: TagDTO[];
}

export function SongViewer({ initialSong, allTags }: SongViewerProps) {
  const router = useRouter();
  const [song, setSong] = useState<SongDTO>(initialSong);
  const [offset, setOffset] = useState<number>(initialSong.transposeOffset);
  const [fontSize, setFontSize] = useState<number>(15);

  // Fullscreen / Hide Bar mode
  const [barHidden, setBarHidden] = useState(false);

  // Auto-Scroll state
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2); // 1x to 5x
  const [userInteracting, setUserInteracting] = useState(false);
  const scrollAccumRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  // Wake Lock status
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Edit / Notes drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(initialSong.title);
  const [editArtist, setEditArtist] = useState(initialSong.artist);
  const [editKey, setEditKey] = useState(initialSong.originalKey || "");
  const [editNotes, setEditNotes] = useState(initialSong.notes || "");
  const [editContent, setEditContent] = useState(initialSong.content);
  const [editTags, setEditTags] = useState<string[]>(initialSong.tags.map((t) => t.name));
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Screen Wake Lock API while song is open
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let unmounted = false;

    async function requestLock() {
      if (unmounted) return;
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLock = await navigator.wakeLock.request("screen");
          if (!unmounted) {
            setWakeLockActive(true);
          }
          wakeLock.addEventListener("release", () => {
            if (!unmounted) setWakeLockActive(false);
          });
        }
      } catch {
        if (!unmounted) setWakeLockActive(false);
      }
    }

    requestLock();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        requestLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unmounted = true;
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLock?.release().catch(() => {});
    };
  }, []);

  // Pause auto-scroll gently on manual touch or wheel interaction, then resume smoothly
  useEffect(() => {
    if (!autoScrolling) return;

    const handleManualInterrupt = () => {
      setUserInteracting(true);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        setUserInteracting(false);
      }, 1400);
    };

    window.addEventListener("touchstart", handleManualInterrupt, { passive: true });
    window.addEventListener("wheel", handleManualInterrupt, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleManualInterrupt);
      window.removeEventListener("wheel", handleManualInterrupt);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [autoScrolling]);

  // Smooth requestAnimationFrame auto-scroll loop
  useEffect(() => {
    if (!autoScrolling || userInteracting) {
      lastFrameRef.current = null;
      return;
    }

    let rafId: number;
    const step = (timestamp: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
      }
      const deltaSeconds = Math.min((timestamp - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = timestamp;

      // Speed curve: 1x ≈ 14px/s up to 5x ≈ 82px/s
      const pxPerSecond = 6 + scrollSpeed * 15;
      scrollAccumRef.current += pxPerSecond * deltaSeconds;

      if (scrollAccumRef.current >= 1) {
        const wholePx = Math.floor(scrollAccumRef.current);
        scrollAccumRef.current -= wholePx;
        window.scrollBy({ top: wholePx, behavior: "instant" as ScrollBehavior });
      }

      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setAutoScrolling(false);
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [autoScrolling, userInteracting, scrollSpeed]);

  const persistTranspose = useCallback(
    async (nextOffset: number) => {
      const clamped = Math.max(-11, Math.min(11, nextOffset));
      setOffset(clamped);
      setSong((prev) => ({ ...prev, transposeOffset: clamped }));

      try {
        await fetch(`/api/songs/${song.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transposeOffset: clamped }),
        });
        setSaveFeedback("Ton kaydedildi");
        setTimeout(() => setSaveFeedback(""), 1400);
      } catch {
        // Ignore transient offline error while keeping local state responsive
      }
    },
    [song.id]
  );

  function handleStepTranspose(delta: number) {
    let next = offset + delta;
    if (next > 11) next = -11;
    if (next < -11) next = 11;
    persistTranspose(next);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (savingEdit) return;
    setSavingEdit(true);

    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          artist: editArtist.trim(),
          originalKey: editKey.trim() || null,
          notes: editNotes.trim() || null,
          content: normalizeSongContent(editContent),
          tags: editTags,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { song: SongDTO };
        setSong(data.song);
        setEditContent(data.song.content);
        setDrawerOpen(false);
        setSaveFeedback("Değişiklikler kaydedildi");
        setTimeout(() => setSaveFeedback(""), 1800);
        router.refresh();
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteSong() {
    if (deleting) return;
    if (!window.confirm(`"${song.title}" şarkısını silmek istediğinize emin misiniz?`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/");
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  const effectiveKey =
    song.originalKey && offset !== 0
      ? transposeChord(song.originalKey, offset)
      : song.originalKey;

  return (
    <div className="min-h-screen bg-[#121212] text-[#F8FAFC]">
      {/* Floating Restore Pill when Bar is Hidden (Fullscreen Playing Mode) */}
      {barHidden && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5">
          {autoScrolling && (
            <button
              type="button"
              onClick={() => setAutoScrolling(false)}
              aria-label="Otomatik kaydırmayı duraklat"
              className="rounded-full bg-[#1E293B]/90 backdrop-blur-md border border-teal-400/40 px-3 py-1.5 text-xs font-medium text-[#2DD4BF] shadow-lg flex items-center gap-1"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>{scrollSpeed}x</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setBarHidden(false)}
            aria-label="Kontrol çubuğunu göster"
            className="rounded-full bg-[#1E293B]/90 hover:bg-[#1E293B] backdrop-blur-md border border-slate-700/80 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg flex items-center gap-1.5 transition"
          >
            <Minimize2 className="w-3.5 h-3.5 text-[#2DD4BF]" />
            <span>Menü</span>
          </button>
        </div>
      )}

      {/* Sticky Collapsible Top Control Bar */}
      {!barHidden && (
        <header className="sticky top-0 z-40 bg-[#0F172A]/95 backdrop-blur-md border-b border-slate-800/90 shadow-md">
          <div className="max-w-4xl mx-auto px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            {/* Left: Back + Song Title */}
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/"
                aria-label="Repertuara Dön"
                className="p-2 rounded-xl bg-[#1E293B] hover:bg-slate-700/80 border border-slate-700/70 text-slate-200 shrink-0 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#F8FAFC] truncate max-w-[140px] sm:max-w-[220px]">
                  {song.title}
                </div>
                <div className="text-[11px] text-slate-400 truncate max-w-[140px] sm:max-w-[220px] flex items-center gap-1.5">
                  <span>{song.artist}</span>
                  {wakeLockActive && (
                    <span
                      title="Ekran Açık Kilidi (Wake Lock) Aktif"
                      className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400"
                    />
                  )}
                  {saveFeedback && (
                    <span className="text-[#2DD4BF] font-medium">• {saveFeedback}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Transpose, Font Size, Auto-Scroll, Edit/Notes, Hide Bar */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Transpose Controls (-1 / offset / +1 + Reset) - NO CAPO */}
              <div className="inline-flex items-center rounded-xl bg-[#1E293B] border border-slate-700/80 p-0.5">
                <button
                  type="button"
                  onClick={() => handleStepTranspose(-1)}
                  aria-label="Yarım ses pesten (-1)"
                  className="px-2.5 py-1.5 text-xs font-mono font-bold text-slate-200 hover:text-[#2DD4BF] active:scale-95 transition"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => persistTranspose(0)}
                  disabled={offset === 0}
                  title={offset !== 0 ? "Orijinal tona sıfırla" : "Orijinal ton"}
                  className={`px-2 py-1 rounded-lg font-mono text-xs font-bold flex items-center gap-1 transition ${
                    offset !== 0
                      ? "bg-teal-400/15 text-[#2DD4BF] hover:bg-teal-400/25"
                      : "text-slate-300"
                  }`}
                >
                  <span>{formatOffsetBadge(offset)}</span>
                  {effectiveKey && (
                    <span className="text-[10px] opacity-80">({effectiveKey})</span>
                  )}
                  {offset !== 0 && <RotateCcw className="w-3 h-3 ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleStepTranspose(1)}
                  aria-label="Yarım ses tizden (+1)"
                  className="px-2.5 py-1.5 text-xs font-mono font-bold text-slate-200 hover:text-[#2DD4BF] active:scale-95 transition"
                >
                  +1
                </button>
              </div>

              {/* Font Size Controls */}
              <div className="inline-flex items-center rounded-xl bg-[#1E293B] border border-slate-700/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.max(11, s - 1))}
                  aria-label="Yazı boyutunu küçült"
                  className="px-2 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.min(24, s + 1))}
                  aria-label="Yazı boyutunu büyüt"
                  className="px-2 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  A+
                </button>
              </div>

              {/* Auto-Scroll Toggle & Speed Slider */}
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E293B] border border-slate-700/80 px-2 py-1">
                <button
                  type="button"
                  onClick={() => setAutoScrolling((prev) => !prev)}
                  aria-label={autoScrolling ? "Otomatik kaydırmayı durdur" : "Otomatik kaydırmayı başlat"}
                  className={`p-1 rounded-lg transition ${
                    autoScrolling
                      ? "bg-[#2DD4BF] text-[#0F172A]"
                      : "text-slate-200 hover:text-[#2DD4BF]"
                  }`}
                >
                  {autoScrolling ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(Number(e.target.value))}
                  aria-label="Otomatik kaydırma hızı"
                  className="w-14 sm:w-16 accent-[#2DD4BF] cursor-pointer"
                />
                <span className="font-mono text-[11px] text-slate-300 w-6 text-right">
                  {scrollSpeed}x
                </span>
              </div>

              {/* Edit / Notes Button */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Notlar ve Düzenle"
                className={`p-2 rounded-xl border transition ${
                  song.notes
                    ? "bg-[#1E293B] border-teal-400/40 text-[#2DD4BF]"
                    : "bg-[#1E293B] border-slate-700/80 text-slate-300 hover:text-white"
                }`}
              >
                <Edit3 className="w-4 h-4" />
              </button>

              {/* Hide Bar / Fullscreen Button */}
              <button
                type="button"
                onClick={() => setBarHidden(true)}
                title="Çubuğu Gizle (Tam Ekran)"
                aria-label="Çubuğu Gizle"
                className="p-2 rounded-xl bg-[#1E293B] hover:bg-slate-700/80 border border-slate-700/80 text-slate-300 hover:text-[#2DD4BF] transition"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Chord & Lyric Sheet */}
      <main className="max-w-4xl mx-auto px-4 pt-5">
        {!barHidden && (song.notes || song.tags.length > 0) && (
          <div className="mb-5 pb-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            {song.notes ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-[#1E293B]/70 border border-slate-700/60 px-3 py-1.5 text-xs text-slate-200">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
                <span>{song.notes}</span>
              </div>
            ) : (
              <div />
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {song.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-md bg-[#1E293B] border border-slate-700/60 px-2 py-0.5 text-[11px] text-slate-300"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <SheetRenderer
          content={song.content}
          transposeOffset={offset}
          fontSizePx={fontSize}
        />
      </main>

      {/* Edit / Notes Drawer Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0F172A] border border-slate-700/80 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F8FAFC]">
                Şarkı Notları & Düzenleme
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Kapat"
                className="p-1.5 rounded-lg bg-[#1E293B] text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Şarkı Adı</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-xl bg-[#1E293B] border border-slate-700 px-3 py-2 text-sm text-[#F8FAFC] focus:border-[#2DD4BF] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Sanatçı</label>
                  <input
                    type="text"
                    required
                    value={editArtist}
                    onChange={(e) => setEditArtist(e.target.value)}
                    className="w-full rounded-xl bg-[#1E293B] border border-slate-700 px-3 py-2 text-sm text-[#F8FAFC] focus:border-[#2DD4BF] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Orijinal Ton</label>
                  <input
                    type="text"
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value)}
                    className="w-full rounded-xl bg-[#1E293B] border border-slate-700 px-3 py-2 text-sm font-mono text-[#2DD4BF] focus:border-[#2DD4BF] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Akort / Ton / Ekipman Notları
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Örn: Drop D, Fuzz + Octave, BPM 96..."
                  className="w-full rounded-xl bg-[#1E293B] border border-slate-700 px-3 py-2 text-sm text-[#F8FAFC] focus:border-[#2DD4BF] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Etiketler</label>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const selected = editTags.includes(tag.name);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setEditTags((prev) =>
                            prev.includes(tag.name)
                              ? prev.filter((t) => t !== tag.name)
                              : [...prev, tag.name]
                          )
                        }
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border transition ${
                          selected
                            ? "bg-[#2DD4BF] text-[#0F172A] border-[#2DD4BF] font-semibold"
                            : "bg-[#1E293B] text-slate-300 border-slate-700"
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                        <span>{tag.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">Akor & Söz Metni</label>
                  <button
                    type="button"
                    onClick={() => setEditContent(normalizeSongContent(editContent))}
                    className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Hizala</span>
                  </button>
                </div>
                <textarea
                  rows={10}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full rounded-xl bg-[#121212] border border-slate-700 p-3 font-mono text-xs leading-relaxed text-[#F8FAFC] focus:border-[#2DD4BF] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2 gap-3">
                <button
                  type="button"
                  onClick={handleDeleteSong}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 px-3.5 py-2.5 text-xs font-medium transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deleting ? "Siliniyor..." : "Şarkıyı Sil"}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-xl bg-[#1E293B] border border-slate-700 px-4 py-2.5 text-xs text-slate-300"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#2DD4BF] hover:bg-teal-300 text-[#0F172A] font-semibold px-4 py-2.5 text-xs transition"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingEdit ? "Kaydediliyor..." : "Kaydet"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
