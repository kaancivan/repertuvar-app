import { PrismaClient } from "@prisma/client";

/**
 * Normalizes the PostgreSQL connection string for Prisma + Neon:
 * - Reads DATABASE_URL (or Vercel-Neon integration env vars POSTGRES_PRISMA_URL / POSTGRES_URL / NEON_DATABASE_URL)
 * - Strips accidental surrounding quotes or "DATABASE_URL=" prefix
 * - Appends pgbouncer=true & connect_timeout=15 for Neon "-pooler" endpoints
 * - Removes channel_binding=require on pooled URLs to avoid Linux OpenSSL / PgBouncer issues
 */
export function getNormalizedDatabaseUrl(): string | null {
  const raw =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    "";

  let cleaned = raw.trim();
  if (!cleaned) return null;

  if (cleaned.startsWith("DATABASE_URL=")) {
    cleaned = cleaned.slice("DATABASE_URL=".length).trim();
  }
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (
    !cleaned ||
    cleaned.includes("ep-example-123456") ||
    cleaned.includes("user:password@")
  ) {
    return null;
  }

  if (!cleaned.startsWith("postgres://") && !cleaned.startsWith("postgresql://")) {
    return null;
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname.includes("-pooler.")) {
      if (!parsed.searchParams.has("pgbouncer")) {
        parsed.searchParams.set("pgbouncer", "true");
      }
      if (parsed.searchParams.get("channel_binding") === "require") {
        parsed.searchParams.delete("channel_binding");
      }
    }
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "15");
    }
    return parsed.toString();
  } catch {
    return cleaned;
  }
}

export function requireDatabaseConfigured(): string {
  const url = getNormalizedDatabaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL ortam değişkeni tanımlı değil veya geçersiz. Lütfen Vercel -> Settings -> Environment Variables bölümüne Neon DATABASE_URL değerini ekleyip Redeploy yapın."
    );
  }
  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const normalizedUrl = getNormalizedDatabaseUrl();
  return new PrismaClient({
    ...(normalizedUrl ? { datasources: { db: { url: normalizedUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
