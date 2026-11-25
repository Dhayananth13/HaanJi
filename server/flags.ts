import { capabilities } from "./capabilities.ts";
import { SARVAM_RPM_HARD_CAP } from "./config.ts";
import { FLAG_CATALOG_META, FLAG_DEFAULTS, type FlagDefinition } from "./flags_config.ts";
import { metrics } from "./metrics.ts";
import type {
  B2bLimitsConfig,
  BookableTravelMode,
  DegradationLevel,
  FlagAuditEntry,
  PersonaArm,
  ShopPlacementArm,
  TravelModesConfig,
  TravelProviderConfig,
  TravelProvidersMap,
  VendorFeatureFlags,
  VendorFlagsEvaluation,
  VendorTraits,
} from "./types.ts";

export interface FlagsState {
  ops_degradation_level: DegradationLevel;
  sarvam_rpm_budget: number;
  rel_voice_reply: Record<string, boolean>;
  rel_voice_rollout_pct: number;
  rel_elder_mode_default: boolean;
  cfg_llm: {
    model: string;
    prompt_version: string;
    temperature: number;
    max_tokens: number;
  };
  b2b_partner_portal: boolean;
  b2b_live_headcount: boolean;
  b2b_csv_export: boolean;
  b2b_vendor_broadcast: boolean;
  b2b_multi_wedding: boolean;
  b2b_limits: B2bLimitsConfig;
  shop_enabled: boolean;
  shop_featured_slot: boolean;
  travel_enabled_by_wedding: Record<string, boolean>;
  travel_modes: TravelModesConfig;
  travel_providers: TravelProvidersMap;
  travel_featured_vendor: boolean;
  unreachable: boolean;
}

const CONTRACT_DEFAULTS: FlagsState = {
  ops_degradation_level: FLAG_DEFAULTS.ops_degradation_level,
  sarvam_rpm_budget: FLAG_DEFAULTS.ops_sarvam_rpm_budget,
  rel_voice_reply: { ...FLAG_DEFAULTS.rel_voice_reply },
  rel_voice_rollout_pct: FLAG_DEFAULTS.rel_voice_rollout_pct,
  rel_elder_mode_default: FLAG_DEFAULTS.rel_elder_mode_default,
  cfg_llm: { ...FLAG_DEFAULTS.cfg_llm },
  b2b_partner_portal: FLAG_DEFAULTS.b2b_partner_portal,
  b2b_live_headcount: FLAG_DEFAULTS.b2b_live_headcount,
  b2b_csv_export: FLAG_DEFAULTS.b2b_csv_export,
  b2b_vendor_broadcast: FLAG_DEFAULTS.b2b_vendor_broadcast,
  b2b_multi_wedding: FLAG_DEFAULTS.b2b_multi_wedding,
  b2b_limits: structuredClone(FLAG_DEFAULTS.b2b_limits),
  shop_enabled: FLAG_DEFAULTS.shop_enabled,
  shop_featured_slot: FLAG_DEFAULTS.shop_featured_slot,
  travel_enabled_by_wedding: {},
  travel_modes: structuredClone(FLAG_DEFAULTS.travel_modes),
  travel_providers: structuredClone(FLAG_DEFAULTS.travel_providers),
  travel_featured_vendor: FLAG_DEFAULTS.travel_featured_vendor,
  unreachable: false,
};

function parseB2bLimits(raw: unknown, fallback: B2bLimitsConfig): B2bLimitsConfig {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const freeObj = obj.free as { monthly_questions?: unknown } | undefined;
      const proObj = obj.pro as { monthly_questions?: unknown } | undefined;
      const freeLimit =
        typeof freeObj?.monthly_questions === "number"
          ? freeObj.monthly_questions
          : typeof obj.free === "number"
            ? obj.free
            : fallback.free.monthly_questions;
      const proLimit =
        typeof proObj?.monthly_questions === "number"
          ? proObj.monthly_questions
          : typeof obj.pro === "number"
            ? obj.pro
            : fallback.pro.monthly_questions;
      return {
        free: { monthly_questions: Math.max(1, Math.round(freeLimit)) },
        pro: { monthly_questions: Math.max(1, Math.round(proLimit)) },
      };
    }
  } catch {
    // Fall back safely on malformed JSON
  }
  return structuredClone(fallback);
}

function inferProviderHomepage(name: string, fallbackUrl?: string): string {
  const lower = (name || "").toLowerCase();
  if (lower.includes("redbus")) return "https://www.redbus.in/";
  if (lower.includes("ixigo")) return "https://www.ixigo.com/trains";
  if (lower.includes("makemytrip")) return "https://www.makemytrip.com/flights/";
  if (lower.includes("skyscanner")) return "https://www.skyscanner.co.in/";
  return fallbackUrl || "https://www.redbus.in/";
}

function parseTravelModes(raw: unknown, fallback: TravelModesConfig): TravelModesConfig {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        bus: typeof obj.bus === "boolean" ? obj.bus : fallback.bus,
        train: typeof obj.train === "boolean" ? obj.train : fallback.train,
        flight: typeof obj.flight === "boolean" ? obj.flight : fallback.flight,
      };
    }
  } catch {
    // Fall back safely on malformed JSON
  }
  return structuredClone(fallback);
}

function sanitizeProviderEntry(
  rawEntry: unknown,
  fallback: TravelProviderConfig
): TravelProviderConfig {
  if (!rawEntry || typeof rawEntry !== "object") {
    return { ...fallback };
  }
  const obj = rawEntry as Record<string, unknown>;
  const name =
    typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : fallback.name;
  const rawTemplate =
    typeof obj.url_template === "string" ? obj.url_template.trim() : undefined;
  const safeTemplate =
    rawTemplate !== undefined
      ? rawTemplate === "" || /^https?:\/\//i.test(rawTemplate)
        ? rawTemplate
        : undefined
      : fallback.url_template;
  const rawHomepage =
    typeof obj.homepage === "string" && /^https?:\/\//i.test(obj.homepage.trim())
      ? obj.homepage.trim()
      : undefined;
  return {
    name,
    url_template: safeTemplate,
    homepage: rawHomepage || inferProviderHomepage(name, fallback.homepage),
  };
}

function parseTravelProviders(
  raw: unknown,
  fallback: TravelProvidersMap
): TravelProvidersMap {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        bus: sanitizeProviderEntry(obj.bus, fallback.bus),
        train: sanitizeProviderEntry(obj.train, fallback.train),
        flight: sanitizeProviderEntry(obj.flight, fallback.flight),
      };
    }
  } catch {
    // Fall back safely on malformed JSON
  }
  return structuredClone(fallback);
}

function fnv1aHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface FlagCatalogRow extends FlagDefinition {
  currentValue: unknown;
  lastFetchedAt: string;
}

export class FlagsClient {
  private state: FlagsState = structuredClone(CONTRACT_DEFAULTS);
  private exposures = new Map<string, PersonaArm>();
  private conversions = new Set<string>();
  private abandoned = new Set<string>();
  private armExposures: Record<PersonaArm, number> = { formal: 0, warm: 0 };
  private armAnswers: Record<PersonaArm, number> = { formal: 0, warm: 0 };
  private armConversions: Record<PersonaArm, number> = { formal: 0, warm: 0 };
  private armAbandoned: Record<PersonaArm, number> = { formal: 0, warm: 0 };
  private shopExposures = new Map<string, ShopPlacementArm>();
  private shopArmExposures: Record<ShopPlacementArm, number> = { inline: 0, tab: 0 };
  private shopArmClicks: Record<ShopPlacementArm, number> = { inline: 0, tab: 0 };
  private shopArmUniqueClickers: Record<ShopPlacementArm, Set<string>> = {
    inline: new Set<string>(),
    tab: new Set<string>(),
  };
  private auditLog: FlagAuditEntry[] = [];
  private featureIdCache = new Map<string, number>();
  private lastFetchedAt: string = new Date().toISOString();
  private recentRolloutGuests = new Map<string, { gid: string; included: boolean; bucket: number }>();
  private localDegradeOverride = false;
  private localShopOverride = false;
  private localTravelOverride = false;

  setUnreachable(flag: boolean): void {
    this.state.unreachable = flag;
    capabilities.recordEvent(
      "flagsmith",
      flag
        ? "Flagsmith unreachable simulation ON -> reverted to safe defaults (Level 0)"
        : "Flagsmith connectivity restored"
    );
  }

  isUnreachable(): boolean {
    return this.state.unreachable;
  }

  degradationLevel(): DegradationLevel {
    const lvl: DegradationLevel = this.state.unreachable
      ? 0
      : this.state.ops_degradation_level;
    metrics.setDegradationLevel(lvl);
    return lvl;
  }

  rpmBudget(): number {
    if (this.state.unreachable) return CONTRACT_DEFAULTS.sarvam_rpm_budget;
    return Math.min(Math.max(this.state.sarvam_rpm_budget, 5), SARVAM_RPM_HARD_CAP);
  }

  rawBudget(): number {
    return this.state.unreachable
      ? CONTRACT_DEFAULTS.sarvam_rpm_budget
      : this.state.sarvam_rpm_budget;
  }

  voiceReplyEnabled(languageCode: string): boolean {
    if (this.state.unreachable) return true;
    const exact = this.state.rel_voice_reply[languageCode];
    if (typeof exact === "boolean") return exact;
    const prefix = languageCode.split("-")[0];
    const byPrefix = Object.entries(this.state.rel_voice_reply).find(([k]) =>
      k.startsWith(prefix)
    );
    return byPrefix ? byPrefix[1] : true;
  }

  setVoiceReplyForLang(languageCode: string, enabled: boolean): void {
    this.state.rel_voice_reply[languageCode] = enabled;
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `rel_voice_reply[${languageCode}] = ${enabled ? "ON" : "OFF"}`
    );
  }

  isGuestInVoiceRollout(gid: string): boolean {
    if (this.state.unreachable) return true;
    const pct = this.state.rel_voice_rollout_pct;
    const bucket = fnv1aHash(`rel_voice_rollout:${gid}`) % 100;
    const included = pct >= 100 ? true : pct <= 0 ? false : bucket < pct;
    if (!gid.startsWith("load-") && gid !== "drawer" && gid !== "scan") {
      this.recentRolloutGuests.set(gid, { gid, included, bucket });
      if (this.recentRolloutGuests.size > 12) {
        const firstKey = this.recentRolloutGuests.keys().next().value;
        if (firstKey) this.recentRolloutGuests.delete(firstKey);
      }
    }
    return included;
  }

  setVoiceRolloutPct(pct: number): number {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    this.state.rel_voice_rollout_pct = clamped;
    this.lastFetchedAt = new Date().toISOString();
    // Re-evaluate tracked sample guests against new percentage
    for (const [gid, entry] of this.recentRolloutGuests.entries()) {
      this.recentRolloutGuests.set(gid, {
        gid,
        bucket: entry.bucket,
        included: clamped >= 100 ? true : clamped <= 0 ? false : entry.bucket < clamped,
      });
    }
    capabilities.recordEvent("flagsmith", `rel_voice_rollout_pct = ${clamped}%`);
    return clamped;
  }

  getVoiceRolloutState(): {
    pct: number;
    guests: Array<{ gid: string; included: boolean; bucket: number }>;
  } {
    const pct = this.state.unreachable ? 100 : this.state.rel_voice_rollout_pct;
    return {
      pct,
      guests: Array.from(this.recentRolloutGuests.values()),
    };
  }

  elderModeDefault(traits?: { age_band?: string }): boolean {
    if (this.state.unreachable) return false;
    if (traits?.age_band === "elder") return true;
    return this.state.rel_elder_mode_default;
  }

  setElderModeDefault(enabled: boolean): void {
    this.state.rel_elder_mode_default = enabled;
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `rel_elder_mode_default = ${enabled ? "TRUE" : "FALSE"}`
    );
  }

  llmConfig(): FlagsState["cfg_llm"] {
    if (this.state.unreachable) return CONTRACT_DEFAULTS.cfg_llm;
    return this.state.cfg_llm;
  }

  shopEnabled(): boolean {
    if (this.state.unreachable) return false;
    return this.state.shop_enabled;
  }

  setShopEnabled(enabled: boolean, actor = "host"): boolean {
    this.state.shop_enabled = Boolean(enabled);
    this.localShopOverride = true;
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `shop_enabled = ${this.state.shop_enabled ? "ON" : "OFF"} (${actor})`
    );
    void this.pushBooleanFlagToFlagsmithAdmin("shop_enabled", this.state.shop_enabled);
    return this.state.shop_enabled;
  }

  shopFeaturedSlotEnabled(): boolean {
    if (this.state.unreachable) return false;
    return this.state.shop_featured_slot;
  }

  setShopFeaturedSlot(enabled: boolean): boolean {
    this.state.shop_featured_slot = Boolean(enabled);
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `shop_featured_slot = ${this.state.shop_featured_slot ? "ON" : "OFF"}`
    );
    return this.state.shop_featured_slot;
  }

  travelEnabled(weddingId = "w_demo"): boolean {
    if (this.state.unreachable) return false;
    return Boolean(this.state.travel_enabled_by_wedding[weddingId] ?? false);
  }

  setTravelEnabled(enabled: boolean, weddingId = "w_demo", actor = "host"): boolean {
    const next = Boolean(enabled);
    this.state.travel_enabled_by_wedding[weddingId] = next;
    this.localTravelOverride = true;
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `travel_enabled[${weddingId}] = ${next ? "ON" : "OFF"} (${actor})`
    );
    void this.pushBooleanFlagToFlagsmithAdmin("travel_enabled", next);
    return next;
  }

  travelModes(): TravelModesConfig {
    if (this.state.unreachable) {
      return structuredClone(CONTRACT_DEFAULTS.travel_modes);
    }
    return structuredClone(this.state.travel_modes);
  }

  setTravelMode(mode: BookableTravelMode, enabled: boolean): TravelModesConfig {
    this.state.travel_modes[mode] = Boolean(enabled);
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `travel_modes.${mode} = ${this.state.travel_modes[mode] ? "ON" : "OFF"}`
    );
    return this.travelModes();
  }

  travelProviders(): TravelProvidersMap {
    if (this.state.unreachable) {
      return structuredClone(CONTRACT_DEFAULTS.travel_providers);
    }
    return structuredClone(this.state.travel_providers);
  }

  setTravelProviders(partial: Partial<TravelProvidersMap>): TravelProvidersMap {
    const merged = parseTravelProviders(
      {
        ...this.state.travel_providers,
        ...partial,
      },
      CONTRACT_DEFAULTS.travel_providers
    );
    this.state.travel_providers = merged;
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `travel_providers updated (bus=${merged.bus.name}, train=${merged.train.name}, flight=${merged.flight.name})`
    );
    return this.travelProviders();
  }

  travelFeaturedVendorEnabled(): boolean {
    if (this.state.unreachable) return false;
    return this.state.travel_featured_vendor;
  }

  setTravelFeaturedVendor(enabled: boolean): boolean {
    this.state.travel_featured_vendor = Boolean(enabled);
    this.lastFetchedAt = new Date().toISOString();
    capabilities.recordEvent(
      "flagsmith",
      `travel_featured_vendor = ${this.state.travel_featured_vendor ? "ON" : "OFF"}`
    );
    return this.state.travel_featured_vendor;
  }

  shopPlacement(gid: string, recordExposure = true): ShopPlacementArm {
    if (this.state.unreachable) {
      return "inline";
    }
    if (!gid || gid.startsWith("load-") || gid === "drawer" || gid === "scan") {
      return "inline";
    }
    const existing = this.shopExposures.get(gid);
    if (existing) {
      return existing;
    }
    const bucket = fnv1aHash(`exp_shop_placement:${gid}`) % 2;
    const arm: ShopPlacementArm = bucket === 0 ? "inline" : "tab";
    if (recordExposure) {
      this.shopExposures.set(gid, arm);
      this.shopArmExposures[arm] += 1;
    }
    return arm;
  }

  trackShopClick(
    gid: string,
    action = "click"
  ): { arm: ShopPlacementArm; arm_clicks: number; total_clicks: number } {
    if (this.state.unreachable || !gid || gid.startsWith("load-")) {
      return {
        arm: "inline",
        arm_clicks: this.shopArmClicks.inline,
        total_clicks: this.shopArmClicks.inline + this.shopArmClicks.tab,
      };
    }
    const arm = this.shopExposures.get(gid) ?? this.shopPlacement(gid, true);
    this.shopArmClicks[arm] += 1;
    this.shopArmUniqueClickers[arm].add(gid);
    capabilities.recordEvent(
      "flagsmith",
      `exp_shop_placement click (${action}) -> arm=${arm} (total=${this.shopArmClicks[arm]})`
    );
    return {
      arm,
      arm_clicks: this.shopArmClicks[arm],
      total_clicks: this.shopArmClicks.inline + this.shopArmClicks.tab,
    };
  }

  getShopExperimentSummary(): {
    arms: Record<
      ShopPlacementArm,
      {
        exposures: number;
        clicks: number;
        unique_clickers: number;
        ctr_pct: number;
      }
    >;
    total_exposures: number;
    total_clicks: number;
    honest_reading: string;
  } {
    const calc = (arm: ShopPlacementArm) => {
      const exposures = this.shopArmExposures[arm];
      const clicks = this.shopArmClicks[arm];
      const uniqueClickers = this.shopArmUniqueClickers[arm].size;
      return {
        exposures,
        clicks,
        unique_clickers: uniqueClickers,
        ctr_pct: exposures > 0 ? Number(((uniqueClickers / exposures) * 100).toFixed(1)) : 0,
      };
    };
    const totalExp = this.shopArmExposures.inline + this.shopArmExposures.tab;
    const totalClicks = this.shopArmClicks.inline + this.shopArmClicks.tab;
    const honestReading =
      totalExp < 100
        ? `Collecting samples (n=${totalExp} guests, ${totalClicks} shop clicks). Reaching 95% confidence typically needs ~300+ exposures per arm.`
        : `Sample size n=${totalExp} collected across inline vs tab placement (${totalClicks} clicks).`;
    return {
      arms: {
        inline: calc("inline"),
        tab: calc("tab"),
      },
      total_exposures: totalExp,
      total_clicks: totalClicks,
      honest_reading: honestReading,
    };
  }

  persona(gid: string, _traits?: Record<string, string>): PersonaArm {
    if (this.state.unreachable) {
      return "formal";
    }
    if (gid.startsWith("load-")) {
      return "formal";
    }
    const existing = this.exposures.get(gid);
    if (existing) {
      return existing;
    }
    const bucket = fnv1aHash(`exp_voice_persona:${gid}`) % 2;
    const arm: PersonaArm = bucket === 0 ? "formal" : "warm";
    this.exposures.set(gid, arm);
    this.armExposures[arm] += 1;
    capabilities.recordEvent(
      "flagsmith",
      `degradation level = ${this.state.ops_degradation_level}, tone = ${arm}`
    );
    return arm;
  }

  trackAnswerServed(gid: string): void {
    if (this.state.unreachable || gid.startsWith("load-")) {
      return;
    }
    const arm = this.exposures.get(gid) ?? this.persona(gid);
    this.armAnswers[arm] += 1;
  }

  trackRsvpCompleted(gid: string): boolean {
    if (this.state.unreachable || gid.startsWith("load-")) {
      return false;
    }
    if (this.conversions.has(gid)) {
      return false;
    }
    const arm = this.exposures.get(gid) ?? this.persona(gid);
    this.conversions.add(gid);
    this.armConversions[arm] += 1;
    metrics.recordRsvpCompleted();
    return true;
  }

  trackRsvpAbandoned(gid: string): boolean {
    if (this.state.unreachable || gid.startsWith("load-")) {
      return false;
    }
    if (this.abandoned.has(gid) || this.conversions.has(gid)) {
      return false;
    }
    const arm = this.exposures.get(gid) ?? this.persona(gid);
    this.abandoned.add(gid);
    this.armAbandoned[arm] += 1;
    return true;
  }

  getExperimentSummary(): {
    arms: Record<
      PersonaArm,
      {
        exposures: number;
        answers: number;
        completions: number;
        abandoned: number;
        conversion_rate_pct: number;
      }
    >;
    total_exposures: number;
    honest_reading: string;
    flagsmith_note: string;
  } {
    const calc = (arm: PersonaArm) => {
      const exp = this.armExposures[arm];
      const conv = this.armConversions[arm];
      return {
        exposures: exp,
        answers: this.armAnswers[arm],
        completions: conv,
        abandoned: this.armAbandoned[arm],
        conversion_rate_pct: exp > 0 ? Number(((conv / exp) * 100).toFixed(1)) : 0,
      };
    };
    const totalExp = this.armExposures.formal + this.armExposures.warm;
    const honestReading =
      totalExp < 100
        ? `Inconclusive at n=${totalExp}. Reaching 95% confidence for a 10% lift typically requires ~380 exposures per arm.`
        : `Sample size n=${totalExp} collected; inspect Flagsmith Bayesian credible interval before rolling out.`;
    return {
      arms: {
        formal: calc("formal"),
        warm: calc("warm"),
      },
      total_exposures: totalExp,
      honest_reading: honestReading,
      flagsmith_note:
        process.env.FLAGSMITH_ENV_KEY || process.env.FLAGSMITH_SERVER_KEY
          ? "Connected to Flagsmith environment."
          : "Local flag evaluation store active; Flagsmith Bayesian engine is the production source of truth when FLAGSMITH_ENV_KEY is configured.",
    };
  }

  async syncFromFlagsmith(): Promise<{
    synced: boolean;
    source: string;
    last_fetched_at: string;
    level: DegradationLevel;
    rpm_budget: number;
  }> {
    if (this.state.unreachable) {
      return {
        synced: false,
        source: "Fallback Defaults (Outage Active)",
        last_fetched_at: this.lastFetchedAt,
        level: 0,
        rpm_budget: CONTRACT_DEFAULTS.sarvam_rpm_budget,
      };
    }

    const envKey = (process.env.FLAGSMITH_ENV_KEY || process.env.FLAGSMITH_SERVER_KEY || "").trim();
    if (!envKey) {
      this.lastFetchedAt = new Date().toISOString();
      capabilities.recordEvent(
        "flagsmith",
        `Local store read: level=${this.state.ops_degradation_level}, rollout=${this.state.rel_voice_rollout_pct}%`
      );
      return {
        synced: false,
        source: "Local Flag Store",
        last_fetched_at: this.lastFetchedAt,
        level: this.degradationLevel(),
        rpm_budget: this.rpmBudget(),
      };
    }

    try {
      const res = await fetch("https://edge.api.flagsmith.com/api/v1/flags/", {
        method: "GET",
        headers: { "X-Environment-Key": envKey },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const items = (await res.json()) as Array<{
        feature?: { id?: number; name?: string };
        enabled?: boolean;
        feature_state_value?: unknown;
      }>;
      for (const item of items) {
        const name = item.feature?.name;
        if (!name) continue;
        if (typeof item.feature?.id === "number") {
          this.featureIdCache.set(name, item.feature.id);
        }
        if (name === "ops_degradation_level" && item.feature_state_value !== null && !this.localDegradeOverride) {
          const n = Number(item.feature_state_value);
          if (n === 0 || n === 1 || n === 2) {
            this.state.ops_degradation_level = n;
            metrics.setDegradationLevel(n);
          }
        } else if (name === "ops_sarvam_rpm_budget" && item.feature_state_value !== null && !this.localDegradeOverride) {
          const n = Number(item.feature_state_value);
          if (Number.isFinite(n) && n >= 5 && n <= 55) {
            this.state.sarvam_rpm_budget = n;
          }
        } else if (name === "rel_elder_mode_default" && typeof item.enabled === "boolean") {
          this.state.rel_elder_mode_default = item.enabled;
        } else if (name === "rel_voice_rollout_pct" && item.feature_state_value !== null) {
          const pct = Number(item.feature_state_value);
          if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
            this.state.rel_voice_rollout_pct = Math.round(pct);
          }
        } else if (name === "b2b_partner_portal" && typeof item.enabled === "boolean") {
          this.state.b2b_partner_portal = item.enabled;
        } else if (name === "b2b_live_headcount" && typeof item.enabled === "boolean") {
          this.state.b2b_live_headcount = item.enabled;
        } else if (name === "b2b_csv_export" && typeof item.enabled === "boolean") {
          this.state.b2b_csv_export = item.enabled;
        } else if (name === "b2b_vendor_broadcast" && typeof item.enabled === "boolean") {
          this.state.b2b_vendor_broadcast = item.enabled;
        } else if (name === "b2b_multi_wedding" && typeof item.enabled === "boolean") {
          this.state.b2b_multi_wedding = item.enabled;
        } else if (name === "b2b_limits" && item.feature_state_value !== null) {
          this.state.b2b_limits = parseB2bLimits(
            item.feature_state_value,
            CONTRACT_DEFAULTS.b2b_limits
          );
        } else if (name === "shop_enabled" && typeof item.enabled === "boolean" && !this.localShopOverride) {
          this.state.shop_enabled = item.enabled;
        } else if (name === "shop_featured_slot" && typeof item.enabled === "boolean") {
          this.state.shop_featured_slot = item.enabled;
        } else if (name === "travel_enabled" && typeof item.enabled === "boolean" && !this.localTravelOverride) {
          this.state.travel_enabled_by_wedding["w_demo"] = item.enabled;
        } else if (name === "travel_modes" && item.feature_state_value !== null) {
          this.state.travel_modes = parseTravelModes(
            item.feature_state_value,
            CONTRACT_DEFAULTS.travel_modes
          );
        } else if (name === "travel_providers" && item.feature_state_value !== null) {
          this.state.travel_providers = parseTravelProviders(
            item.feature_state_value,
            CONTRACT_DEFAULTS.travel_providers
          );
        } else if (name === "travel_featured_vendor" && typeof item.enabled === "boolean") {
          this.state.travel_featured_vendor = item.enabled;
        }
      }
      this.lastFetchedAt = new Date().toISOString();
      capabilities.recordEvent(
        "flagsmith",
        `Synced ${items.length} flags from Flagsmith Cloud (level=${this.state.ops_degradation_level})`
      );
      return {
        synced: true,
        source: "Flagsmith Cloud",
        last_fetched_at: this.lastFetchedAt,
        level: this.degradationLevel(),
        rpm_budget: this.rpmBudget(),
      };
    } catch (err) {
      capabilities.recordEvent(
        "flagsmith",
        `Flagsmith sync fell back to cached flags (${err instanceof Error ? err.message : "error"})`
      );
      return {
        synced: false,
        source: "Cached Flag Store (Remote Fetch Failed)",
        last_fetched_at: this.lastFetchedAt,
        level: this.degradationLevel(),
        rpm_budget: this.rpmBudget(),
      };
    }
  }

  private defaultVendorFlags(traits: VendorTraits): VendorFeatureFlags {
    const isPro = traits.plan === "pro";
    const limits = this.state.unreachable
      ? structuredClone(CONTRACT_DEFAULTS.b2b_limits)
      : structuredClone(this.state.b2b_limits);
    return {
      b2b_partner_portal: this.state.unreachable ? true : this.state.b2b_partner_portal,
      b2b_live_headcount: isPro,
      b2b_csv_export: isPro,
      b2b_vendor_broadcast: isPro,
      b2b_multi_wedding: isPro,
      b2b_limits: limits,
    };
  }

  async flagsForVendor(
    vendorId: string,
    traits: VendorTraits
  ): Promise<VendorFlagsEvaluation> {
    const localFlags = this.defaultVendorFlags(traits);
    const nowIso = new Date().toISOString();

    if (this.state.unreachable) {
      return {
        identity: vendorId,
        traits,
        flags: localFlags,
        monthly_question_limit: localFlags.b2b_limits[traits.plan].monthly_questions,
        source: "Fallback Defaults (Outage Active)",
        evaluated_at: nowIso,
      };
    }

    const envKey = (process.env.FLAGSMITH_ENV_KEY || process.env.FLAGSMITH_SERVER_KEY || "").trim();
    if (!envKey) {
      this.lastFetchedAt = nowIso;
      capabilities.recordEvent(
        "flagsmith",
        `Vendor identity ${vendorId} (${traits.business_type}, plan=${traits.plan}) evaluated via Local Flag Store`
      );
      return {
        identity: vendorId,
        traits,
        flags: localFlags,
        monthly_question_limit: localFlags.b2b_limits[traits.plan].monthly_questions,
        source: "Local Flag Store",
        evaluated_at: nowIso,
      };
    }

    try {
      const res = await fetch("https://edge.api.flagsmith.com/api/v1/identities/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Environment-Key": envKey,
        },
        body: JSON.stringify({
          identifier: vendorId,
          traits: [
            { trait_key: "business_type", trait_value: traits.business_type },
            { trait_key: "plan", trait_value: traits.plan },
          ],
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = (await res.json()) as {
        flags?: Array<{
          feature?: { id?: number; name?: string };
          enabled?: boolean;
          feature_state_value?: unknown;
        }>;
      };
      const merged: VendorFeatureFlags = structuredClone(localFlags);
      let matchedB2bCount = 0;

      for (const item of payload.flags || []) {
        const name = item.feature?.name;
        if (!name) continue;
        if (typeof item.feature?.id === "number") {
          this.featureIdCache.set(name, item.feature.id);
        }
        if (name === "b2b_partner_portal" && typeof item.enabled === "boolean") {
          merged.b2b_partner_portal = item.enabled;
          matchedB2bCount += 1;
        } else if (name === "b2b_live_headcount" && typeof item.enabled === "boolean") {
          merged.b2b_live_headcount = item.enabled;
          matchedB2bCount += 1;
        } else if (name === "b2b_csv_export" && typeof item.enabled === "boolean") {
          merged.b2b_csv_export = item.enabled;
          matchedB2bCount += 1;
        } else if (name === "b2b_vendor_broadcast" && typeof item.enabled === "boolean") {
          merged.b2b_vendor_broadcast = item.enabled;
          matchedB2bCount += 1;
        } else if (name === "b2b_multi_wedding" && typeof item.enabled === "boolean") {
          merged.b2b_multi_wedding = item.enabled;
          matchedB2bCount += 1;
        } else if (name === "b2b_limits" && item.feature_state_value !== null) {
          merged.b2b_limits = parseB2bLimits(item.feature_state_value, merged.b2b_limits);
          matchedB2bCount += 1;
        }
      }

      this.lastFetchedAt = nowIso;
      capabilities.recordEvent(
        "flagsmith",
        `Flagsmith Edge evaluated ${vendorId} (${traits.business_type}, plan=${traits.plan}, ${matchedB2bCount} b2b flags)`
      );
      return {
        identity: vendorId,
        traits,
        flags: merged,
        monthly_question_limit: merged.b2b_limits[traits.plan].monthly_questions,
        source:
          matchedB2bCount > 0
            ? "Flagsmith Cloud (Edge Identities)"
            : "Flagsmith Cloud + Local B2B Defaults",
        evaluated_at: nowIso,
      };
    } catch (err) {
      capabilities.recordEvent(
        "flagsmith",
        `Flagsmith Edge identity fetch fell back to safe defaults (${err instanceof Error ? err.message : "error"})`
      );
      return {
        identity: vendorId,
        traits,
        flags: localFlags,
        monthly_question_limit: localFlags.b2b_limits[traits.plan].monthly_questions,
        source: "Safe Local Defaults (Flagsmith Unreachable)",
        evaluated_at: nowIso,
      };
    }
  }

  getAllFlagValues() {
    return {
      exp_voice_persona: "50/50 multivariate (formal | warm)",
      ops_degradation_level: this.degradationLevel(),
      ops_sarvam_rpm_budget: this.rpmBudget(),
      rel_voice_reply: this.state.rel_voice_reply,
      rel_voice_rollout_pct: this.state.unreachable ? 100 : this.state.rel_voice_rollout_pct,
      cfg_llm: this.llmConfig(),
      rel_elder_mode_default: this.elderModeDefault(),
      b2b_partner_portal: this.state.unreachable ? true : this.state.b2b_partner_portal,
      b2b_live_headcount: this.state.unreachable ? false : this.state.b2b_live_headcount,
      b2b_csv_export: this.state.unreachable ? false : this.state.b2b_csv_export,
      b2b_vendor_broadcast: this.state.unreachable ? false : this.state.b2b_vendor_broadcast,
      b2b_multi_wedding: this.state.unreachable ? false : this.state.b2b_multi_wedding,
      b2b_limits: this.state.unreachable
        ? CONTRACT_DEFAULTS.b2b_limits
        : this.state.b2b_limits,
      shop_enabled: this.shopEnabled(),
      shop_featured_slot: this.shopFeaturedSlotEnabled(),
      exp_shop_placement: "50/50 multivariate (inline | tab)",
      travel_enabled: this.travelEnabled("w_demo"),
      travel_modes: this.travelModes(),
      travel_providers: this.travelProviders(),
      travel_featured_vendor: this.travelFeaturedVendorEnabled(),
      last_fetched_at: this.lastFetchedAt,
      source: this.state.unreachable
        ? "Fallback Defaults (Outage Active)"
        : process.env.FLAGSMITH_ENV_KEY || process.env.FLAGSMITH_SERVER_KEY
          ? "Flagsmith Cloud"
          : "Local Flag Store",
    };
  }

  getFlagsCatalog(): FlagCatalogRow[] {
    const limits = this.state.unreachable
      ? CONTRACT_DEFAULTS.b2b_limits
      : this.state.b2b_limits;
    const shopExpTotal = this.shopArmExposures.inline + this.shopArmExposures.tab;
    const shopClicksTotal = this.shopArmClicks.inline + this.shopArmClicks.tab;
    const currentByKey: Record<string, unknown> = {
      ops_degradation_level: this.degradationLevel(),
      ops_sarvam_rpm_budget: this.rpmBudget(),
      exp_voice_persona: `50/50 split (n=${this.armExposures.formal + this.armExposures.warm})`,
      rel_voice_reply: Object.entries(this.state.rel_voice_reply)
        .filter(([, v]) => v)
        .map(([k]) => k.slice(0, 2))
        .join(",") || "none",
      rel_voice_rollout_pct: `${this.state.unreachable ? 100 : this.state.rel_voice_rollout_pct}%`,
      rel_elder_mode_default: this.elderModeDefault(),
      cfg_llm: `${this.llmConfig().model} (${this.llmConfig().prompt_version})`,
      b2b_partner_portal: this.state.unreachable ? true : this.state.b2b_partner_portal,
      b2b_live_headcount: "segment: plan=pro",
      b2b_csv_export: "segment: plan=pro",
      b2b_vendor_broadcast: "segment: plan=pro",
      b2b_multi_wedding: "segment: plan=pro",
      b2b_limits: limits,
      shop_enabled: this.shopEnabled(),
      shop_featured_slot: this.shopFeaturedSlotEnabled(),
      exp_shop_placement: `50/50 inline/tab (n=${shopExpTotal}, clicks=${shopClicksTotal})`,
      travel_enabled: this.travelEnabled("w_demo"),
      travel_modes: this.travelModes(),
      travel_providers: this.travelProviders(),
      travel_featured_vendor: this.travelFeaturedVendorEnabled(),
    };
    return FLAG_CATALOG_META.map((def) => ({
      ...def,
      currentValue: currentByKey[def.key] ?? def.defaultValue,
      lastFetchedAt: this.lastFetchedAt,
    }));
  }

  adminSetDegradation(
    level: number,
    rpmBudget: number | null,
    actor: string,
    reason: string,
    bypassRangeValidation = false
  ): { level: DegradationLevel; rpm_budget: number; cached_feature_ids: number } {
    if (level !== 0 && level !== 1 && level !== 2) {
      throw new Error(`Invalid degradation level: ${level}. Must be 0, 1, or 2.`);
    }
    if (rpmBudget !== null && !bypassRangeValidation) {
      if (rpmBudget < 5 || rpmBudget > 55) {
        throw new Error(`Invalid rpm_budget: ${rpmBudget}. Must be between 5 and 55.`);
      }
    }
    if (!this.featureIdCache.has("ops_degradation_level")) {
      this.featureIdCache.set("ops_degradation_level", 104821);
      this.featureIdCache.set("ops_sarvam_rpm_budget", 104822);
    }

    this.state.ops_degradation_level = level as DegradationLevel;
    if (rpmBudget !== null) {
      this.state.sarvam_rpm_budget = rpmBudget;
    }
    this.localDegradeOverride =
      actor !== "muhurat_demo_reset" && actor !== "ops_reset";
    this.lastFetchedAt = new Date().toISOString();
    metrics.setDegradationLevel(this.state.ops_degradation_level);

    this.auditLog.unshift({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor,
      reason,
      level: this.state.ops_degradation_level,
      rpm_budget: this.state.sarvam_rpm_budget,
    });
    if (this.auditLog.length > 50) {
      this.auditLog.length = 50;
    }

    capabilities.recordEvent(
      "flagsmith",
      `ops_degradation_level = ${this.state.ops_degradation_level}, rpm_budget = ${this.state.sarvam_rpm_budget} (${actor})`
    );

    if (actor !== "muhurat_demo_reset" && actor !== "ops_reset") {
      void this.pushDegradationToFlagsmithAdmin(
        this.state.ops_degradation_level,
        this.state.sarvam_rpm_budget
      );
    }

    return {
      level: this.state.ops_degradation_level,
      rpm_budget: this.state.sarvam_rpm_budget,
      cached_feature_ids: this.featureIdCache.size,
    };
  }

  private async pushDegradationToFlagsmithAdmin(
    level: DegradationLevel,
    rpmBudget: number
  ): Promise<void> {
    const adminKey = process.env.FLAGSMITH_ADMIN_KEY?.trim();
    const envId = process.env.FLAGSMITH_ENV_ID?.trim();
    if (!adminKey || !envId) return;

    try {
      const listRes = await fetch(
        `https://api.flagsmith.com/api/v1/environments/${encodeURIComponent(envId)}/featurestates/`,
        {
          headers: { Authorization: `Api-Key ${adminKey}` },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (!listRes.ok) return;
      const listJson = (await listRes.json()) as {
        results?: Array<{ id: number; feature?: number; feature_state_value?: unknown }>;
      };
      const results = listJson.results || [];
      const degId = this.featureIdCache.get("ops_degradation_level");
      const rpmId = this.featureIdCache.get("ops_sarvam_rpm_budget");

      for (const fsRow of results) {
        let nextVal: string | null = null;
        if (degId && fsRow.feature === degId) nextVal = String(level);
        if (rpmId && fsRow.feature === rpmId) nextVal = String(rpmBudget);
        if (nextVal !== null) {
          await fetch(
            `https://api.flagsmith.com/api/v1/environments/${encodeURIComponent(envId)}/featurestates/${fsRow.id}/`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Api-Key ${adminKey}`,
              },
              body: JSON.stringify({
                enabled: true,
                feature_state_value: nextVal,
              }),
              signal: AbortSignal.timeout(4000),
            }
          );
        }
      }
      this.localDegradeOverride = false;
      capabilities.recordEvent(
        "flagsmith",
        `Pushed Level ${level} (${rpmBudget} RPM) to Flagsmith Cloud`
      );
    } catch {
      // Keep local override safely if remote Admin API call fails
    }
  }

  private async pushBooleanFlagToFlagsmithAdmin(
    flagName: string,
    enabled: boolean
  ): Promise<void> {
    const adminKey = process.env.FLAGSMITH_ADMIN_KEY?.trim();
    const envId = process.env.FLAGSMITH_ENV_ID?.trim();
    if (!adminKey || !envId) return;

    try {
      const listRes = await fetch(
        `https://api.flagsmith.com/api/v1/environments/${encodeURIComponent(envId)}/featurestates/`,
        {
          headers: { Authorization: `Api-Key ${adminKey}` },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (!listRes.ok) return;
      const listJson = (await listRes.json()) as {
        results?: Array<{ id: number; feature?: number }>;
      };
      const targetFeatureId = this.featureIdCache.get(flagName);
      if (!targetFeatureId) return;
      const fsRow = (listJson.results || []).find((r) => r.feature === targetFeatureId);
      if (!fsRow) return;
      await fetch(
        `https://api.flagsmith.com/api/v1/environments/${encodeURIComponent(envId)}/featurestates/${fsRow.id}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Api-Key ${adminKey}`,
          },
          body: JSON.stringify({ enabled }),
          signal: AbortSignal.timeout(4000),
        }
      );
      this.localShopOverride = false;
    } catch {
      // Keep safe local override if Flagsmith Admin API is unreachable
    }
  }

  getAuditLog(): FlagAuditEntry[] {
    return [...this.auditLog];
  }

  getFeatureCacheSize(): number {
    return this.featureIdCache.size;
  }

  resetForTests(): void {
    this.state = structuredClone(CONTRACT_DEFAULTS);
    this.exposures.clear();
    this.conversions.clear();
    this.abandoned.clear();
    this.armExposures = { formal: 0, warm: 0 };
    this.armAnswers = { formal: 0, warm: 0 };
    this.armConversions = { formal: 0, warm: 0 };
    this.armAbandoned = { formal: 0, warm: 0 };
    this.shopExposures.clear();
    this.shopArmExposures = { inline: 0, tab: 0 };
    this.shopArmClicks = { inline: 0, tab: 0 };
    this.shopArmUniqueClickers = {
      inline: new Set<string>(),
      tab: new Set<string>(),
    };
    this.auditLog = [];
    this.featureIdCache.clear();
    this.recentRolloutGuests.clear();
    this.localDegradeOverride = false;
    this.localShopOverride = false;
    this.localTravelOverride = false;
    this.lastFetchedAt = new Date().toISOString();
    metrics.setDegradationLevel(0);
  }
}

export const flags = new FlagsClient();
