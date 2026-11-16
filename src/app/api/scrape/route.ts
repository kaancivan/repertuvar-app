import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { detectOriginalKey, normalizeSongContent } from "@/lib/parser";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function isDisallowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower.startsWith("10.") ||
    lower.startsWith("192.168.") ||
    lower.startsWith("172.16.") ||
    lower.endsWith(".local")
  );
}

function isBotBlockedResponse(status: number, html: string, headers: Headers): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  if (headers.get("cf-mitigated") === "challenge") return true;

  const sample = html.slice(0, 8000).toLowerCase();
  return (
    sample.includes("just a moment...") ||
    sample.includes("cf-browser-verification") ||
    sample.includes("challenge-platform") ||
    sample.includes("attention required! | cloudflare") ||
    sample.includes("enable javascript and cookies to continue") ||
    sample.includes("verify you are human")
  );
}

/**
 * Converts a search query into repertuarim.com's exact `/ara/<slug>/` format
 * (matching `searchUrl()` in repertuarim.com's `functions.js`).
 */
function toRepertuarimSlug(query: string): string {
  const charMap: Record<string, string> = {
    I: "ı",
    İ: "i",
    Ç: "ç",
    Ü: "ü",
    Ö: "ö",
    Ş: "ş",
    Ğ: "ğ",
  };

  return query
    .replace(/[IİÇÜÖŞĞ]/g, (ch) => charMap[ch] ?? ch)
    .replace(/['"?!,;.]+/g, "")
    .replace(/[^a-zA-Z0-9şıöüğçİŞÖĞÜÇ\s_-]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/[_\s-]+/g, "-");
}

function normalizeForMatch(text: string): string {
  const trMap: Record<string, string> = {
    ı: "i",
    İ: "i",
    I: "i",
    ğ: "g",
    Ğ: "g",
    ü: "u",
    Ü: "u",
    ş: "s",
    Ş: "s",
    ö: "o",
    Ö: "o",
    ç: "c",
    Ç: "c",
  };
  return text
    .replace(/[ıİIğĞüÜşŞöÖçÇ]/g, (c) => trMap[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextPreservingLines($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string {
  const cloned = el.clone();
  cloned.find("script, style, ins, .ads, .advertisement, .share, .comments").remove();
  cloned.find("br").replaceWith("\n");
  cloned.find("p, div, li, h2, h3, h4, tr").each((_, node) => {
    const $node = $(node);
    $node.append("\n");
  });
  return cloned.text();
}

function parseTitleAndArtist(rawTitle: string): { title: string; artist: string } {
  const clean = rawTitle
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*-\s*(repertuarim|akorlar|ultimate guitar|tabs|chords).*$/i, "")
    .replace(/\s*-\s*(akor|tab|chords|lyrics)\s*$/i, "")
    .replace(/\b(akor|tab|chords|lyrics)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const separators = [" - ", " – ", " — ", " | "];
  for (const sep of separators) {
    if (clean.includes(sep)) {
      const [first, ...rest] = clean.split(sep);
      return {
        artist: first.trim() || "Bilinmeyen Sanatçı",
        title: rest.join(sep).trim() || clean,
      };
    }
  }

  return { title: clean || "İsimsiz Şarkı", artist: "Bilinmeyen Sanatçı" };
}

function extractUltimateGuitar($: cheerio.CheerioAPI) {
  const storeRaw = $(".js-store").attr("data-content");
  if (!storeRaw) return null;

  try {
    const parsed = JSON.parse(storeRaw);
    const tab = parsed?.store?.page?.data?.tab;
    const wikiContent = parsed?.store?.page?.data?.tab_view?.wiki_tab?.content;
    if (!wikiContent) return null;

    const content = normalizeSongContent(String(wikiContent));
    return {
      title: String(tab?.song_name || "").trim() || "İsimsiz Şarkı",
      artist: String(tab?.artist_name || "").trim() || "Bilinmeyen Sanatçı",
      originalKey: tab?.tonality_name
        ? String(tab.tonality_name).trim()
        : detectOriginalKey(content),
      content,
    };
  } catch {
    return null;
  }
}

function extractRepertuarim($: cheerio.CheerioAPI) {
  $(
    "script, style, nav, header, footer, aside, iframe, .sidebar, .comments, #comments, .related-posts, .ads, .advertisement, .share-buttons, .social-share, .breadcrumb"
  ).remove();

  // On repertuarim.com song pages, <h1> has:
  // <h1><a href=".../akor-tab/duman/" title="Duman akor">Duman</a> - Senden Daha Güzel - Akor</h1>
  const h1El = $("h1").first();
  const h1ArtistLink = h1El.find("a[href*='/akor-tab/'], a").first().text().replace(/\s+/g, " ").trim();

  let artist = h1ArtistLink;
  let title = "";

  if (h1El.length > 0) {
    const h1Clone = h1El.clone();
    h1Clone.find(".icon, [class*='icon']").remove();
    if (h1ArtistLink) {
      h1Clone.find("a").first().remove();
      title = h1Clone
        .text()
        .replace(/^[\s\-–—:]+/, "")
        .replace(/[\s\-–—:]+\b(akor|tab|nota|şarkı sözü)\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    } else {
      const parsed = parseTitleAndArtist(h1Clone.text());
      artist = parsed.artist;
      title = parsed.title;
    }
  }

  if (!title || !artist) {
    const fallbackParsed = parseTitleAndArtist($("title").text().trim());
    if (!artist) artist = fallbackParsed.artist;
    if (!title) title = fallbackParsed.title;
  }

  const preChords = $("pre.chords, pre#key, pre").first();
  const dataKey = preChords.attr("data-key")?.trim() || null;

  const contentSelectors = [
    "pre.chords",
    "pre#key",
    ".akor-content",
    ".akor-body",
    ".song-content",
    ".chord-content",
    ".lyrics-content",
    "pre",
    ".entry-content",
    "article .content",
    "main article",
  ];

  let bestContent = "";
  for (const sel of contentSelectors) {
    const el = $(sel).first();
    if (el.length > 0) {
      const candidate = normalizeSongContent(extractTextPreservingLines($, el));
      if (candidate.split("\n").length >= 4 && candidate.length > bestContent.length) {
        bestContent = candidate;
        break;
      }
    }
  }

  if (!bestContent) return null;

  return {
    title: title || "İsimsiz Şarkı",
    artist: artist || "Bilinmeyen Sanatçı",
    originalKey: dataKey || detectOriginalKey(bestContent),
    content: bestContent,
  };
}

function extractGeneric($: cheerio.CheerioAPI) {
  $(
    "script, style, nav, header, footer, aside, iframe, .sidebar, .comments, #comments, .ads, .advertisement"
  ).remove();

  const h1Clone = $("h1").first().clone();
  h1Clone.find(".icon, [class*='icon']").remove();
  const h1 = h1Clone.text().trim() || $("title").text().trim();
  const { title, artist } = parseTitleAndArtist(h1);

  const candidates = [
    "pre",
    ".chord-sheet",
    ".chords",
    ".tab-content",
    ".lyrics",
    "article",
    "main",
  ];
  let raw = "";
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length > 0) {
      const text = normalizeSongContent(extractTextPreservingLines($, el));
      if (text.length > raw.length && text.split("\n").length >= 3) {
        raw = text;
        if (sel === "pre" || sel.includes("chord")) break;
      }
    }
  }

  if (!raw) return null;
  return {
    title,
    artist,
    originalKey: detectOriginalKey(raw),
    content: raw,
  };
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await res.text();
    return { status: res.status, headers: res.headers, html };
  } finally {
    clearTimeout(timer);
  }
}

async function searchRepertuarim(
  query: string
): Promise<{ blocked: boolean; results: Array<{ title: string; artist: string; url: string }> }> {
  const slug = toRepertuarimSlug(query);
  if (!slug) return { blocked: false, results: [] };

  const searchUrl = `https://www.repertuarim.com/ara/${encodeURIComponent(slug)}/`;
  const { status, headers, html } = await fetchPage(searchUrl);

  if (isBotBlockedResponse(status, html, headers)) {
    return { blocked: true, results: [] };
  }

  const $ = cheerio.load(html);
  const hasSpellingWarning = $(".warning.spelling").length > 0;
  const queryTokens = normalizeForMatch(query)
    .split(" ")
    .filter((w) => w.length >= 2);

  const results: Array<{ title: string; artist: string; url: string }> = [];
  const seen = new Set<string>();

  // Only select links inside the search results list (exclude .search-suggest-list-main)
  $(".page-search .list-list ul li a, .list-list.no-split ul li a").each((_, el) => {
    const $el = $(el);
    const href = ($el.attr("href") || "").trim();
    if (!href || !href.startsWith("http")) return;
    if (!href.includes("/akor/") && !href.includes("/tab/")) return;
    if (seen.has(href)) return;

    // Extract clean text from .title (avoiding <div class="icon color-a">A</div>)
    const titleDiv = $el.find(".title").first();
    let rawLabel = "";
    if (titleDiv.length > 0) {
      rawLabel = titleDiv.text().replace(/\s+/g, " ").trim();
    } else {
      const cloned = $el.clone();
      cloned.find(".icon, [class*='icon']").remove();
      rawLabel = cloned.text().replace(/\s+/g, " ").trim();
    }

    if (!rawLabel || rawLabel.length < 3) return;

    const parsed = parseTitleAndArtist(rawLabel);

    // When repertuarim shows ".warning.spelling", verify at least one query token matches
    if (hasSpellingWarning && queryTokens.length > 0) {
      const hay = normalizeForMatch(`${parsed.artist} ${parsed.title}`);
      const matchesAny = queryTokens.some((tok) => hay.includes(tok));
      if (!matchesAny) return;
    }

    seen.add(href);
    results.push({
      title: parsed.title,
      artist: parsed.artist,
      url: href,
    });
  });

  return { blocked: false, results };
}

async function searchUltimateGuitar(
  query: string
): Promise<Array<{ title: string; artist: string; url: string }>> {
  const ugUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(
    query
  )}`;
  const { status, headers, html } = await fetchPage(ugUrl);
  if (isBotBlockedResponse(status, html, headers)) {
    return [];
  }

  const $ = cheerio.load(html);
  const storeRaw = $(".js-store").attr("data-content");
  if (!storeRaw) return [];

  try {
    const parsed = JSON.parse(storeRaw);
    const rawResults = parsed?.store?.page?.data?.results;
    if (!Array.isArray(rawResults)) return [];

    const results: Array<{ title: string; artist: string; url: string }> = [];
    const seen = new Set<string>();

    for (const item of rawResults) {
      const tabUrl = typeof item?.tab_url === "string" ? item.tab_url : "";
      const type = typeof item?.type === "string" ? item.type : "";
      if (!tabUrl || !tabUrl.startsWith("https://tabs.ultimate-guitar.com/tab/")) continue;
      if (type && type !== "Chords") continue;
      if (seen.has(tabUrl)) continue;
      seen.add(tabUrl);

      const songName = String(item?.song_name || "").trim();
      const artistName = String(item?.artist_name || "").trim();
      if (!songName) continue;

      results.push({
        title: songName,
        artist: artistName || "Bilinmeyen Sanatçı",
        url: tabUrl,
      });

      if (results.length >= 6) break;
    }

    return results;
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      mode?: "url" | "search";
      url?: string;
      query?: string;
    };
    const mode = body.mode || (body.url ? "url" : "search");

    if (mode === "search") {
      const query = body.query?.trim() || "";
      if (!query) {
        return NextResponse.json({ error: "Arama terimi girin." }, { status: 400 });
      }

      const [repSettled, ugSettled] = await Promise.allSettled([
        searchRepertuarim(query),
        searchUltimateGuitar(query),
      ]);

      const repData =
        repSettled.status === "fulfilled"
          ? repSettled.value
          : { blocked: true, results: [] };
      const ugResults = ugSettled.status === "fulfilled" ? ugSettled.value : [];

      const combined = [...repData.results, ...ugResults].slice(0, 15);

      if (combined.length === 0 && repData.blocked) {
        return NextResponse.json({
          blocked: true,
          results: [],
          message:
            "Arama isteği site koruması (Cloudflare) nedeniyle engellendi. Doğrudan URL yapıştırabilir veya Akıllı Yapıştır sekmesini kullanabilirsiniz.",
        });
      }

      return NextResponse.json({
        blocked: false,
        results: combined,
        ...(combined.length === 0
          ? {
              message:
                "Eşleşen şarkı bulunamadı. Doğrudan şarkı linkini yapıştırabilir veya Akıllı Yapıştır sekmesini kullanabilirsiniz.",
            }
          : {}),
      });
    }

    // URL fetch mode
    const rawUrl = body.url?.trim() || "";
    if (!rawUrl) {
      return NextResponse.json({ error: "Lütfen geçerli bir URL girin." }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    } catch {
      return NextResponse.json({ error: "Geçersiz URL formatı." }, { status: 400 });
    }

    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      isDisallowedHost(parsedUrl.hostname)
    ) {
      return NextResponse.json({ error: "Bu URL adresine izin verilmiyor." }, { status: 400 });
    }

    let pageData: { status: number; headers: Headers; html: string };
    try {
      pageData = await fetchPage(parsedUrl.toString());
    } catch {
      return NextResponse.json({
        blocked: true,
        message:
          "Sayfaya bağlanılamadı veya zaman aşımına uğradı. Akıllı Yapıştır (Smart Paste) sekmesine geçildi.",
      });
    }

    if (isBotBlockedResponse(pageData.status, pageData.html, pageData.headers)) {
      return NextResponse.json({
        blocked: true,
        message: `${parsedUrl.hostname} Cloudflare / bot koruması nedeniyle sunucudan çekilemedi. Kopyaladığınız metni Akıllı Yapıştır alanına yapıştırabilirsiniz.`,
      });
    }

    const $ = cheerio.load(pageData.html);
    const host = parsedUrl.hostname.toLowerCase();

    let extracted = null;
    if (host.includes("ultimate-guitar.com")) {
      extracted = extractUltimateGuitar($);
    } else if (host.includes("repertuarim.com")) {
      extracted = extractRepertuarim($);
    } else {
      extracted = extractGeneric($);
    }

    if (!extracted || !extracted.content) {
      return NextResponse.json({
        blocked: true,
        message:
          "Sayfadan temiz akor/söz bloğu ayıklanamadı (dinamik JS veya koruma olabilir). Akıllı Yapıştır sekmesini kullanabilirsiniz.",
      });
    }

    return NextResponse.json({
      blocked: false,
      song: {
        ...extracted,
        sourceUrl: parsedUrl.toString(),
      },
    });
  } catch (err) {
    console.error("POST /api/scrape error:", err);
    return NextResponse.json({
      blocked: true,
      message: "Çekme sırasında hata oluştu. Akıllı Yapıştır sekmesini kullanabilirsiniz.",
    });
  }
}
