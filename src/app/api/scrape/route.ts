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

function extractTextPreservingLines($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string {
  // Replace <br> and block endings with newlines before reading text
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
    .replace(/\b(akor|tab|chords|lyrics)\b/gi, "")
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
      originalKey: tab?.tonality_name ? String(tab.tonality_name).trim() : detectOriginalKey(content),
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

  const h1Text =
    $("h1.entry-title, h1.song-title, .song-header h1, h1").first().text().trim() ||
    $("title").text().trim();

  const artistMeta =
    $(".artist-name, .song-artist, [itemprop='byArtist'], a[href*='/sanatci/'], a[href*='/artist/']")
      .first()
      .text()
      .trim();

  let { title, artist } = parseTitleAndArtist(h1Text);
  if (artistMeta) {
    artist = artistMeta;
    if (title.toLowerCase().startsWith(artist.toLowerCase())) {
      title = title.slice(artist.length).replace(/^[\s\-–—:]+/, "").trim() || title;
    }
  }

  const contentSelectors = [
    ".akor-content",
    ".akor-body",
    ".song-content",
    ".chord-content",
    ".lyrics-content",
    "pre.chords",
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
    title,
    artist,
    originalKey: detectOriginalKey(bestContent),
    content: bestContent,
  };
}

function extractGeneric($: cheerio.CheerioAPI) {
  $(
    "script, style, nav, header, footer, aside, iframe, .sidebar, .comments, #comments, .ads, .advertisement"
  ).remove();

  const h1 = $("h1").first().text().trim() || $("title").text().trim();
  const { title, artist } = parseTitleAndArtist(h1);

  const candidates = ["pre", ".chord-sheet", ".chords", ".tab-content", ".lyrics", "article", "main"];
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { mode?: "url" | "search"; url?: string; query?: string };
    const mode = body.mode || (body.url ? "url" : "search");

    if (mode === "search") {
      const query = body.query?.trim() || "";
      if (!query) {
        return NextResponse.json({ error: "Arama terimi girin." }, { status: 400 });
      }

      const searchUrl = `https://www.repertuarim.com/?s=${encodeURIComponent(query)}`;
      try {
        const { status, headers, html } = await fetchPage(searchUrl);
        if (isBotBlockedResponse(status, html, headers)) {
          return NextResponse.json({
            blocked: true,
            results: [],
            message:
              "Arama isteği site koruması (Cloudflare) nedeniyle engellendi. Doğrudan URL yapıştırabilir veya Akıllı Yapıştır sekmesini kullanabilirsiniz.",
          });
        }

        const $ = cheerio.load(html);
        const results: Array<{ title: string; artist: string; url: string }> = [];
        const seen = new Set<string>();

        $("article a, .post-title a, .entry-title a, .search-results a, a[href*='repertuarim.com']")
          .each((_, el) => {
            const href = $(el).attr("href") || "";
            const text = $(el).text().replace(/\s+/g, " ").trim();
            if (!href || !text || text.length < 4) return;
            if (
              href.includes("/category/") ||
              href.includes("/tag/") ||
              href.includes("/page/") ||
              href.includes("#")
            ) {
              return;
            }
            if (!href.startsWith("http")) return;
            if (seen.has(href)) return;
            seen.add(href);

            const parsed = parseTitleAndArtist(text);
            results.push({ title: parsed.title, artist: parsed.artist, url: href });
          });

        return NextResponse.json({
          blocked: false,
          results: results.slice(0, 12),
          ...(results.length === 0
            ? {
                message:
                  "Sonuç bulunamadı. Doğrudan şarkı linkini yapıştırabilir veya Akıllı Yapıştır sekmesini kullanabilirsiniz.",
              }
            : {}),
        });
      } catch {
        return NextResponse.json({
          blocked: true,
          results: [],
          message:
            "Siteye şu anda erişilemedi. Akıllı Yapıştır sekmesini kullanarak akorları doğrudan yapıştırabilirsiniz.",
        });
      }
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

    if (!["http:", "https:"].includes(parsedUrl.protocol) || isDisallowedHost(parsedUrl.hostname)) {
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
