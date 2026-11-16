"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Guitar, Lock, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitPin(submittedPin: string) {
    if (!submittedPin.trim() || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: submittedPin }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Hatalı PIN");
        setPin("");
        setLoading(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const nextPath = params.get("next") || "/";
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch {
      setError("Bağlantı hatası oluştu.");
      setLoading(false);
    }
  }

  function handleKeyPress(digit: string) {
    if (loading) return;
    setError("");
    setPin((prev) => (prev.length < 12 ? prev + digit : prev));
  }

  function handleBackspace() {
    if (loading) return;
    setError("");
    setPin((prev) => prev.slice(0, -1));
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0F172A] via-[#121212] to-[#121212] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#1E293B]/70 border border-slate-700/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-teal-400/15 border border-teal-400/30 flex items-center justify-center mb-3">
            <Guitar className="w-6 h-6 text-[#2DD4BF]" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[#F8FAFC]">
            Kişisel Repertuar
          </h1>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-teal-400" />
            Devam etmek için PIN kodunu girin
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPin(pin);
          }}
          className="space-y-4"
        >
          <div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => {
                setError("");
                setPin(e.target.value);
              }}
              placeholder="PIN veya Şifre"
              aria-label="PIN veya Şifre"
              className="w-full rounded-xl bg-[#0F172A] border border-slate-700 focus:border-[#2DD4BF] focus:outline-none px-4 py-3 text-center text-lg tracking-[0.35em] text-[#F8FAFC] placeholder:tracking-normal placeholder:text-sm placeholder:text-slate-500"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg py-2 px-3 text-center"
            >
              {error}
            </div>
          )}

          {/* Mobile-friendly numeric keypad */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeyPress(digit)}
                className="h-12 rounded-xl bg-[#0F172A]/80 hover:bg-slate-800 active:scale-95 border border-slate-700/60 text-lg font-medium text-[#F8FAFC] transition"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              aria-label="Sil"
              className="h-12 rounded-xl bg-[#0F172A]/80 hover:bg-slate-800 active:scale-95 border border-slate-700/60 flex items-center justify-center text-slate-300 transition"
            >
              <Delete className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleKeyPress("0")}
              className="h-12 rounded-xl bg-[#0F172A]/80 hover:bg-slate-800 active:scale-95 border border-slate-700/60 text-lg font-medium text-[#F8FAFC] transition"
            >
              0
            </button>
            <button
              type="submit"
              disabled={!pin || loading}
              aria-label="Giriş Yap"
              className="h-12 rounded-xl bg-[#2DD4BF] hover:bg-teal-300 disabled:opacity-40 active:scale-95 text-[#0F172A] font-semibold flex items-center justify-center transition"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-[#0F172A] border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
