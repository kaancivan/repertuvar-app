"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardPaste,
  Eye,
  Globe,
  Link2,
  Plus,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { SheetRenderer } from "@/components/SheetRenderer";
import { detectOriginalKey, normalizeSongContent } from "@/lib/parser";
import type { TagDTO } from "@/lib/db";

type ActiveTab = "scrape" | "paste";

interface SearchResult {
  title: string;
  artist: string;
  url: string;
}

export default function AddSongPage() {
  const router = useRouter();
  const pasteAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("scrape");

  // Scrape / Search states
  const [urlInput, setUrlInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [scraping, setScraping] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scrapeNotice, setScrapeNotice] = useState<{
    type: "warning" | "info" | "success";
    text: string;
    showFallbackButton?: boolean;
  } | null>(null);

  // Song form states
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [originalKey, setOriginalKey] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // Tags
  const [availableTags, setAvailableTags] = useState<TagDTO[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch("/api/tags")
      .then((res) => (res.ok ? res.json() : { tags: [] }))
      .then((data: { tags?: TagDTO[] }) => {
        if (Array.isArray(data.tags)) setAvailableTags(data.tags);
      })
      .catch(() => {});
  }, []);

  function switchToSmartPaste(noticeText?: string) {
    setActiveTab("paste");
    if (noticeText) {
      setScrapeNotice({
        type: "warning",
        text: noticeText,
        showFallbackButton: false,
      });
    }
    setTimeout(() => {
      pasteAreaRef.current?.focus();
    }, 80);
  }

  async function handleFetchUrl(targetUrl: string) {
    const cleanUrl = targetUrl.trim();
    if (!cleanUrl || scraping) return;

    setScraping(true);
    setScrapeNotice(null);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "url", url: cleanUrl }),
      });

      const data = (await res.json()) as {
        blocked?: boolean;
        message?: string;
        error?: string;
        song?: {
          title: string;
          artist: string;
          originalKey?: string | null;
          content: string;
          sourceUrl: string;
        };
      };

      if (!res.ok) {
        setScrapeNotice({
          type: "warning",
          text: data.error || "Link çekilemedi.",
          showFallbackButton: true,
        });
        return;
      }

      if (data.blocked || !data.song) {
        switchToSmartPaste(
          data.message ||
            "Bu site sunucu taraflı çekimi engelledi. Akıllı Yapıştır sekmesine geçildi — kopyaladığınız akorları buraya yapıştırabilirsiniz."
        );
        return;
      }

      setTitle(data.song.title);
      setArtist(data.song.artist);
      setOriginalKey(data.song.originalKey || detectOriginalKey(data.song.content) || "");
      setContent(data.song.content);
      setSourceUrl(data.song.sourceUrl);
      setScrapeNotice({
        type: "success",
        text: "Akor ve sözler temizlendi! Düzenleyip kaydedebilirsiniz.",
      });
      setActiveTab("paste");
      setShowPreview(true);
    } catch {
      switchToSmartPaste(
        "Ağ hatası oluştu. Kopyaladığınız şarkıyı Akıllı Yapıştır alanına yapıştırabilirsiniz."
      );
    } finally {
      setScraping(false);
    }
  }

  async function handleWebSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q || searching) return;

    setSearching(true);
    setScrapeNotice(null);
    setSearchResults([]);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "search", query: q }),
      });
      const data = (await res.json()) as {
        blocked?: boolean;
        results?: SearchResult[];
        message?: string;
        error?: string;
      };

      if (data.blocked) {
        setScrapeNotice({
          type: "warning",
          text: data.message || "Arama bot korumasına takıldı.",
          showFallbackButton: true,
        });
      } else if (data.results && data.results.length > 0) {
        setSearchResults(data.results);
      } else {
        setScrapeNotice({
          type: "info",
          text: data.message || "Sonuç bulunamadı.",
          showFallbackButton: true,
        });
      }
    } catch {
      setScrapeNotice({
        type: "warning",
        text: "Arama sırasında bağlantı hatası oluştu.",
        showFallbackButton: true,
      });
    } finally {
      setSearching(false);
    }
  }

  function handleNormalizeContent() {
    const normalized = normalizeSongContent(content);
    setContent(normalized);
    if (!originalKey.trim()) {
      const detected = detectOriginalKey(normalized);
      if (detected) setOriginalKey(detected);
    }
  }

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  function addCustomTag() {
    const clean = customTagInput.trim();
    if (!clean) return;
    if (!selectedTags.includes(clean)) {
      setSelectedTags((prev) => [...prev, clean]);
    }
    if (!availableTags.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
      setAvailableTags((prev) => [...prev, { id: `local_${clean}`, name: clean }]);
    }
    setCustomTagInput("");
  }

  async function handleSaveSong(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const normalized = normalizeSongContent(content);
    if (!title.trim() || !artist.trim() || !normalized.trim()) {
      setSaveError("Lütfen Şarkı Adı, Sanatçı ve Akor/Söz içeriğini doldurun.");
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          content: normalized,
          originalKey: originalKey.trim() || detectOriginalKey(normalized),
          notes: notes.trim() || null,
          sourceUrl: sourceUrl.trim() || null,
          tags: selectedTags,
        }),
      });

      const data = (await res.json()) as { song?: { id: string }; error?: string };
      if (!res.ok || !data.song) {
        setSaveError(data.error || "Şarkı kaydedilemedi.");
        setSaving(false);
        return;
      }

      router.push(`/songs/${data.song.id}`);
      router.refresh();
    } catch {
      setSaveError("Kaydetme sırasında bağlantı hatası oluştu.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#F8FAFC] pb-16">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="p-2 rounded-xl bg-[#1E293B] hover:bg-slate-700/80 border border-slate-700/70 text-slate-200 transition"
              aria-label="Geri"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-base font-semibold text-[#F8FAFC]">Yeni Şarkı Ekle</h1>
              <p className="text-[11px] text-slate-400">
                Web&apos;den çek veya Akıllı Yapıştır ile formatla
              </p>
            </div>
          </div>
        </div>

        {/* Dual-Source Mode Switcher */}
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#1E293B] border border-slate-700/60">
            <button
              type="button"
              onClick={() => setActiveTab("scrape")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-medium transition ${
                activeTab === "scrape"
                  ? "bg-[#2DD4BF] text-[#0F172A] font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Web Arama & URL</span>
            </button>
            <button
              type="button"
              onClick={() => switchToSmartPaste()}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-medium transition ${
                activeTab === "paste"
                  ? "bg-[#2DD4BF] text-[#0F172A] font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Akıllı Yapıştır & Editör</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-5">
        {scrapeNotice && (
          <div
            className={`rounded-2xl border p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              scrapeNotice.type === "warning"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                : scrapeNotice.type === "success"
                ? "bg-teal-500/10 border-teal-500/30 text-teal-200"
                : "bg-slate-800 border-slate-700 text-slate-200"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {scrapeNotice.type === "warning" ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#2DD4BF] shrink-0 mt-0.5" />
              )}
              <p className="leading-relaxed">{scrapeNotice.text}</p>
            </div>
            {scrapeNotice.showFallbackButton && (
              <button
                type="button"
                onClick={() => switchToSmartPaste()}
                className="shrink-0 rounded-lg bg-[#2DD4BF] text-[#0F172A] font-semibold px-3 py-1.5 text-xs"
              >
                Akıllı Yapıştır&apos;a Geç
              </button>
            )}
          </div>
        )}

        {/* TAB 1: Web Search & URL Fetcher */}
        {activeTab === "scrape" && (
          <div className="space-y-4">
            {/* Direct URL Fetcher */}
            <section className="rounded-2xl bg-[#1E293B]/60 border border-slate-800 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[#F8FAFC]">
                <Link2 className="w-4 h-4 text-[#2DD4BF]" />
                <h2>Doğrudan Linkten Çek</h2>
              </div>
              <p className="text-xs text-slate-400">
                repertuarim.com, ultimate-guitar.com veya herhangi bir akor sayfasının linkini yapıştırın. Reklam ve menüler otomatik temizlenir.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleFetchUrl(urlInput);
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.repertuarim.com/akor/..."
                  className="flex-1 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!urlInput.trim() || scraping}
                  className="rounded-xl bg-[#2DD4BF] hover:bg-teal-300 disabled:opacity-40 text-[#0F172A] font-semibold text-sm px-4 py-2.5 transition shrink-0"
                >
                  {scraping ? "Çekiliyor..." : "Sayfayı Çek"}
                </button>
              </form>
            </section>

            {/* Repertuarim Search */}
            <section className="rounded-2xl bg-[#1E293B]/60 border border-slate-800 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[#F8FAFC]">
                <Search className="w-4 h-4 text-[#2DD4BF]" />
                <h2>Akor Ara (repertuarim.com)</h2>
              </div>
              <form onSubmit={handleWebSearch} className="flex gap-2">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Örn: Duman Senden Daha Güzel"
                  className="flex-1 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!searchInput.trim() || searching}
                  className="rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white font-medium text-sm px-4 py-2.5 transition shrink-0"
                >
                  {searching ? "Aranıyor..." : "Ara"}
                </button>
              </form>

              {searchResults.length > 0 && (
                <div className="space-y-2 pt-2">
                  {searchResults.map((item) => (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => {
                        setUrlInput(item.url);
                        handleFetchUrl(item.url);
                      }}
                      className="w-full text-left rounded-xl bg-[#0F172A]/80 hover:bg-[#0F172A] border border-slate-700/70 hover:border-teal-400/50 p-3 transition flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F8FAFC] truncate">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{item.artist}</div>
                      </div>
                      <span className="text-xs font-semibold text-[#2DD4BF] shrink-0">
                        {scraping ? "..." : "İçe Aktar →"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: Smart Paste & Manual Editor */}
        {activeTab === "paste" && (
          <form onSubmit={handleSaveSong} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs text-slate-400 mb-1">Şarkı Adı *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Senden Daha Güzel"
                  className="w-full rounded-xl bg-[#1E293B] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-3 py-2 text-sm text-[#F8FAFC]"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs text-slate-400 mb-1">Sanatçı *</label>
                <input
                  type="text"
                  required
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Örn: Duman"
                  className="w-full rounded-xl bg-[#1E293B] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-3 py-2 text-sm text-[#F8FAFC]"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs text-slate-400 mb-1">
                  Orijinal Ton (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={originalKey}
                  onChange={(e) => setOriginalKey(e.target.value)}
                  placeholder="Otomatik veya Am"
                  className="w-full rounded-xl bg-[#1E293B] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-3 py-2 text-sm font-mono text-[#2DD4BF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Akort / Ton / Ekipman Notları (Opsiyonel)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Örn: Drop D akort, köprü manyetik, nakaratta chorus..."
                className="w-full rounded-xl bg-[#1E293B] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-3 py-2 text-sm text-[#F8FAFC]"
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="block text-xs text-slate-400">Etiketler / Setlist</label>
              <div className="flex flex-wrap items-center gap-2">
                {availableTags.map((tag) => {
                  const selected = selectedTags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition ${
                        selected
                          ? "bg-[#2DD4BF] text-[#0F172A] border-[#2DD4BF] font-semibold"
                          : "bg-[#1E293B] text-slate-300 border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      {selected && <Check className="w-3 h-3" />}
                      <span>{tag.name}</span>
                    </button>
                  );
                })}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomTag();
                      }
                    }}
                    placeholder="Özel etiket..."
                    className="w-28 rounded-full bg-[#0F172A] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-3 py-1 text-xs text-[#F8FAFC]"
                  />
                  <button
                    type="button"
                    onClick={addCustomTag}
                    className="p-1.5 rounded-full bg-[#1E293B] border border-slate-700 text-teal-400 hover:bg-slate-700"
                    aria-label="Etiket ekle"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Smart Paste Textarea + Live Preview Toggle */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs text-slate-400">
                  Akor & Sözler (Üstte akor veya{" "}
                  <code className="text-teal-400">[Am]Sözler</code> formatı desteklenir)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleNormalizeContent}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#1E293B] hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs text-teal-300 transition"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Formatla & Hizala</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview((p) => !p)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${
                      showPreview
                        ? "bg-teal-400/20 border-teal-400/50 text-[#2DD4BF]"
                        : "bg-[#1E293B] border-slate-700 text-slate-300"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showPreview ? "Editöre Dön" : "Önizle"}</span>
                  </button>
                </div>
              </div>

              {showPreview ? (
                <div className="rounded-2xl bg-[#0F172A] border border-slate-800 p-4 min-h-[320px]">
                  <SheetRenderer
                    content={normalizeSongContent(content)}
                    transposeOffset={0}
                    fontSizePx={14}
                  />
                </div>
              ) : (
                <textarea
                  ref={pasteAreaRef}
                  required
                  rows={14}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text/plain");
                    if (pasted && !content.trim()) {
                      e.preventDefault();
                      const formatted = normalizeSongContent(pasted);
                      setContent(formatted);
                      if (!originalKey.trim()) {
                        const detected = detectOriginalKey(formatted);
                        if (detected) setOriginalKey(detected);
                      }
                    }
                  }}
                  placeholder={`[Verse]\nAm                 G\nKimseyi görmedim ben senden daha güzel\n\nveya satır içi format:\n[Am]Kimseyi görmedim ben [G]senden daha güzel`}
                  className="w-full rounded-2xl bg-[#0F172A] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none p-4 font-mono text-sm leading-relaxed text-[#F8FAFC] placeholder:text-slate-600"
                />
              )}
            </div>

            {saveError && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
                {saveError}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-[#2DD4BF] hover:bg-teal-300 disabled:opacity-50 text-[#0F172A] font-semibold py-3 text-sm transition shadow-lg"
            >
              {saving ? "Kaydediliyor..." : "Repertuara Kaydet"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
