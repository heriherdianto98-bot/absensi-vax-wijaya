/**
 * HERI API client stub — frontend talks only to configured base URL.
 * Secrets must live on VPS, never in this file.
 */
(function () {
  const DEFAULT_BASE = ""; // set later e.g. https://heri.your-vps.example/api/v1
  window.HeriApi = {
    baseUrl: localStorage.getItem("heri_api_base") || DEFAULT_BASE,
    setBase(url) {
      this.baseUrl = url || "";
      localStorage.setItem("heri_api_base", this.baseUrl);
    },
    async health() {
      if (!this.baseUrl) return { ok: false, reason: "API base not configured" };
      const r = await fetch(this.baseUrl.replace(/\/$/, "") + "/health");
      return r.json();
    },
    async queryAi(q) {
      if (!this.baseUrl) {
        // Local fallback — Phase 1
        return window.HERI && HERI.ask ? HERI.ask(q) : { text: "AI lokal tidak siap" };
      }
      const r = await fetch(this.baseUrl.replace(/\/$/, "") + "/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
      });
      return r.json();
    },
  };
})();
