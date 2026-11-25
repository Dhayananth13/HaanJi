import { GoogleGenAI } from "@google/genai";

export interface CapabilitiesStatus {
  live_ai: boolean;
  live_ai_provider: "sarvam" | "gemini" | "none";
  live_ai_reason: string;
  sarvam: boolean;
  sarvam_reason: string;
  gemini: boolean;
  gemini_reason: string;
  flagsmith: boolean;
  flagsmith_reason: string;
  nudgebee: boolean;
  nudgebee_reason: string;
  checked_at: string;
  cache_ttl_seconds: number;
  last_events: {
    sarvam: { summary: string; ts: string | null };
    flagsmith: { summary: string; ts: string | null };
    nudgebee: { summary: string; ts: string | null };
  };
}

class CapabilitiesManager {
  private cached: CapabilitiesStatus | null = null;
  private cachedAtMs = 0;
  private readonly ttlMs = 60_000;
  private lastEvents = {
    sarvam: { summary: "No live AI turns handled yet", ts: null as string | null },
    flagsmith: { summary: "Using contract default flags", ts: null as string | null },
    nudgebee: { summary: "No incident alerts sent yet", ts: null as string | null },
  };

  recordEvent(source: "sarvam" | "flagsmith" | "nudgebee", summary: string): void {
    this.lastEvents[source] = {
      summary,
      ts: new Date().toISOString(),
    };
  }

  invalidateCache(): void {
    this.cached = null;
    this.cachedAtMs = 0;
  }

  private async probeSarvam(): Promise<{ ok: boolean; reason: string }> {
    const key = process.env.SARVAM_API_KEY?.trim();
    if (!key) {
      return { ok: false, reason: "SARVAM_API_KEY not set" };
    }
    try {
      const res = await fetch("https://api.sarvam.ai/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": key,
        },
        body: JSON.stringify({
          input: "Hello",
          source_language_code: "en-IN",
          target_language_code: "hi-IN",
          model: "mayura:v1",
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        return { ok: true, reason: "Sarvam translate check passed" };
      }
      return { ok: false, reason: `Sarvam returned HTTP ${res.status}` };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Sarvam unreachable",
      };
    }
  }

  private async probeGemini(): Promise<{ ok: boolean; reason: string }> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key || key === "MY_GEMINI_API_KEY") {
      return { ok: false, reason: "GEMINI_API_KEY not set" };
    }
    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        apiVersion: "v1beta",
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
      await ai.models.get({ model: "gemini-3.1-flash-lite" });
      return { ok: true, reason: "Gemini AI verified" };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Gemini check failed",
      };
    }
  }

  private async probeFlagsmith(): Promise<{ ok: boolean; reason: string }> {
    const envKey = (process.env.FLAGSMITH_ENV_KEY || process.env.FLAGSMITH_SERVER_KEY || "").trim();
    if (!envKey) {
      return { ok: false, reason: "FLAGSMITH_ENV_KEY not set" };
    }
    try {
      const res = await fetch("https://edge.api.flagsmith.com/api/v1/flags/", {
        method: "GET",
        headers: {
          "X-Environment-Key": envKey,
        },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        return { ok: true, reason: "Flagsmith environment API verified" };
      }
      return { ok: false, reason: `Flagsmith returned HTTP ${res.status}` };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Flagsmith unreachable",
      };
    }
  }

  private isPrivateHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      h === "localhost" ||
      h === "::1" ||
      h.endsWith(".local") ||
      h.endsWith(".internal") ||
      h.endsWith(".cluster.local")
    ) {
      return true;
    }
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (!ipv4) return false;
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  private async probeNudgebee(): Promise<{ ok: boolean; reason: string }> {
    const webhookUrl = process.env.NUDGEBEE_EVENT_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
      return { ok: false, reason: "NUDGEBEE_EVENT_WEBHOOK_URL not set" };
    }
    let parsed: URL;
    try {
      parsed = new URL(webhookUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, reason: "NUDGEBEE_EVENT_WEBHOOK_URL must use http(s)" };
      }
    } catch {
      return { ok: false, reason: "Invalid NUDGEBEE_EVENT_WEBHOOK_URL format" };
    }

    if (this.isPrivateHost(parsed.hostname)) {
      return {
        ok: false,
        reason:
          "NUDGEBEE_EVENT_WEBHOOK_URL uses a private/internal IP not reachable from this hosted app; expose a public HTTPS URL",
      };
    }

    const token = process.env.NUDGEBEE_API_TOKEN?.trim();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const tryProbe = async (
      url: string,
      method: "OPTIONS" | "GET" | "HEAD",
      timeoutMs: number
    ): Promise<{ ok: boolean; status?: number; err?: string }> => {
      try {
        const res = await fetch(url, {
          method,
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        return { ok: res.status < 500, status: res.status };
      } catch (err) {
        return {
          ok: false,
          err: err instanceof Error ? err.message : "Network error",
        };
      }
    };

    // Probe the configured webhook URL (OPTIONS + GET) and origin concurrently
    // so webhook gateways that drop HEAD / respond quickly without blocking.
    const results = await Promise.all([
      tryProbe(webhookUrl, "OPTIONS", 4500),
      tryProbe(webhookUrl, "GET", 4500),
      tryProbe(parsed.origin, "GET", 4500),
    ]);

    const firstOk = results.find((r) => r.ok);
    if (firstOk) {
      return {
        ok: true,
        reason: token
          ? `NudgeBee endpoint reachable (HTTP ${firstOk.status}) & token configured`
          : `NudgeBee webhook endpoint reachable (HTTP ${firstOk.status})`,
      };
    }

    const withStatus = results.find((r) => r.status !== undefined);
    if (withStatus) {
      return { ok: false, reason: `NudgeBee returned HTTP ${withStatus.status}` };
    }

    const lastErr = results.find((r) => r.err)?.err || "NudgeBee unreachable";
    const isTimeout = /timeout|aborted/i.test(lastErr);
    return {
      ok: false,
      reason: isTimeout
        ? "Timed out connecting to NudgeBee webhook (verify URL is publicly reachable)"
        : `NudgeBee webhook unreachable (${lastErr})`,
    };
  }

  async getCapabilities(forceRefresh = false): Promise<CapabilitiesStatus> {
    const now = Date.now();
    if (!forceRefresh && this.cached && now - this.cachedAtMs < this.ttlMs) {
      return {
        ...this.cached,
        last_events: { ...this.lastEvents },
      };
    }

    const [sarvamRes, geminiRes, flagsmithRes, nudgebeeRes] = await Promise.all([
      this.probeSarvam(),
      this.probeGemini(),
      this.probeFlagsmith(),
      this.probeNudgebee(),
    ]);

    const liveAi = sarvamRes.ok || geminiRes.ok;
    const provider: CapabilitiesStatus["live_ai_provider"] = sarvamRes.ok
      ? "sarvam"
      : geminiRes.ok
        ? "gemini"
        : "none";
    const liveReason = sarvamRes.ok
      ? sarvamRes.reason
      : geminiRes.ok
        ? `${geminiRes.reason} (SARVAM_API_KEY not set)`
        : `${sarvamRes.reason}; ${geminiRes.reason}`;

    const result: CapabilitiesStatus = {
      live_ai: liveAi,
      live_ai_provider: provider,
      live_ai_reason: liveReason,
      sarvam: sarvamRes.ok,
      sarvam_reason: sarvamRes.reason,
      gemini: geminiRes.ok,
      gemini_reason: geminiRes.reason,
      flagsmith: flagsmithRes.ok,
      flagsmith_reason: flagsmithRes.reason,
      nudgebee: nudgebeeRes.ok,
      nudgebee_reason: nudgebeeRes.reason,
      checked_at: new Date().toISOString(),
      cache_ttl_seconds: 60,
      last_events: { ...this.lastEvents },
    };

    this.cached = result;
    this.cachedAtMs = now;
    return result;
  }

  async logStartupCapabilities(): Promise<void> {
    const caps = await this.getCapabilities(true);
    console.log(
      `[HaanJi] Sarvam: ${caps.sarvam ? "ON" : `OFF (${caps.sarvam_reason})`}`
    );
    console.log(
      `[HaanJi] Gemini: ${caps.gemini ? "ON" : `OFF (${caps.gemini_reason})`}`
    );
    console.log(
      `[HaanJi] Flagsmith: ${caps.flagsmith ? "ON" : `OFF (${caps.flagsmith_reason})`}`
    );
    console.log(
      `[HaanJi] NudgeBee: ${caps.nudgebee ? "ON" : `OFF (${caps.nudgebee_reason})`}`
    );
  }
}

export const capabilities = new CapabilitiesManager();
