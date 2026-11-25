import type {
  DegradationLevel,
  PersonaArm,
  ShopPlacementArm,
  TravelModesConfig,
  TravelProvidersMap,
} from "./types.ts";

export interface FlagDefinition {
  key: string;
  type: "integer" | "boolean" | "string" | "json";
  defaultValue: unknown;
  controls: string;
}

export const FLAG_DEFAULTS = {
  ops_degradation_level: 0 as DegradationLevel,
  ops_sarvam_rpm_budget: 40,
  exp_voice_persona: "formal" as PersonaArm,
  rel_voice_reply: {
    "hi-IN": true,
    "en-IN": true,
    "kn-IN": true,
    "ta-IN": true,
  } as Record<string, boolean>,
  rel_voice_rollout_pct: 100,
  rel_elder_mode_default: false,
  cfg_llm: {
    model: "gemini-3.1-flash-lite",
    prompt_version: "v2.1-grounded",
    temperature: 0.2,
    max_tokens: 450,
  },
  b2b_partner_portal: true,
  b2b_live_headcount: false,
  b2b_csv_export: false,
  b2b_vendor_broadcast: false,
  b2b_multi_wedding: false,
  b2b_limits: {
    free: { monthly_questions: 100 },
    pro: { monthly_questions: 5000 },
  },
  shop_enabled: false,
  shop_featured_slot: true,
  exp_shop_placement: "inline" as ShopPlacementArm,
  travel_enabled: false,
  travel_modes: {
    bus: true,
    train: true,
    flight: true,
  } as TravelModesConfig,
  travel_providers: {
    bus: {
      name: "redBus",
      url_template: "https://www.redbus.in/bus-tickets/{from}-to-{to}?onward={date}",
      homepage: "https://www.redbus.in/",
    },
    train: {
      name: "ixigo (IRCTC Authorised)",
      url_template: "https://www.ixigo.com/search/result/train/{from}/{to}/{date}//1/0/0/0/ALL",
      homepage: "https://www.ixigo.com/trains",
    },
    flight: {
      name: "Skyscanner",
      url_template: "https://www.skyscanner.co.in/transport/flights/{from}/{to}/{date}/",
      homepage: "https://www.skyscanner.co.in/",
    },
  } as TravelProvidersMap,
  travel_featured_vendor: true,
};

export const FLAG_CATALOG_META: FlagDefinition[] = [
  {
    key: "ops_degradation_level",
    type: "integer",
    defaultValue: FLAG_DEFAULTS.ops_degradation_level,
    controls: "Guest experience cascade: 0 Live voice, 1 Text replies (0 TTS), 2 Queued async drain",
  },
  {
    key: "ops_sarvam_rpm_budget",
    type: "integer",
    defaultValue: FLAG_DEFAULTS.ops_sarvam_rpm_budget,
    controls: "Sliding-window upstream RPM budget (clamped between 5 and 55 RPM)",
  },
  {
    key: "exp_voice_persona",
    type: "string",
    defaultValue: FLAG_DEFAULTS.exp_voice_persona,
    controls: "50/50 multivariate A/B assignment per guest ID (formal vs warm)",
  },
  {
    key: "rel_voice_reply",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.rel_voice_reply,
    controls: "Per-language voice synthesis kill switch",
  },
  {
    key: "rel_voice_rollout_pct",
    type: "integer",
    defaultValue: FLAG_DEFAULTS.rel_voice_rollout_pct,
    controls: "Percentage rollout (0-100%) gating which guest IDs receive live voice replies",
  },
  {
    key: "rel_elder_mode_default",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.rel_elder_mode_default,
    controls: "Turns Elder Mode (large text, AAA contrast, 0.85x pace) on by default for elder households",
  },
  {
    key: "cfg_llm",
    type: "json",
    defaultValue: FLAG_DEFAULTS.cfg_llm,
    controls: "Model ID, grounded prompt version, temperature, and max response tokens",
  },
  {
    key: "b2b_partner_portal",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.b2b_partner_portal,
    controls: "Enables the /partner workspace for wedding vendors (caterers, decorators, planners)",
  },
  {
    key: "b2b_live_headcount",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.b2b_live_headcount,
    controls: "Unlocks live confirmed headcount & Jain/veg dietary split per function (Pro trait)",
  },
  {
    key: "b2b_csv_export",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.b2b_csv_export,
    controls: "Unlocks per-function RFC-4180 CSV catering manifest downloads (Pro trait)",
  },
  {
    key: "b2b_vendor_broadcast",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.b2b_vendor_broadcast,
    controls: "Unlocks multilingual vendor broadcasts translated to hi/hinglish/kn/ta/en (Pro trait)",
  },
  {
    key: "b2b_multi_wedding",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.b2b_multi_wedding,
    controls: "Unlocks multi-wedding portfolio view for partner businesses (Pro trait)",
  },
  {
    key: "b2b_limits",
    type: "json",
    defaultValue: FLAG_DEFAULTS.b2b_limits,
    controls: "Monthly guest question quota per partner plan (free vs pro)",
  },
  {
    key: "shop_enabled",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.shop_enabled,
    controls: "Shows dress-code 'Shop the look' outfits to guests (safe default OFF if Flagsmith unreachable)",
  },
  {
    key: "shop_featured_slot",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.shop_featured_slot,
    controls: "Ranks Pro-plan partner boutique products first in Shop the look rows and catalog",
  },
  {
    key: "exp_shop_placement",
    type: "string",
    defaultValue: FLAG_DEFAULTS.exp_shop_placement,
    controls: "50/50 multivariate A/B placement per guest ID (inline under dress codes vs Shop tab), tracking shop clicks per arm",
  },
  {
    key: "travel_enabled",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.travel_enabled,
    controls: "Shows Book Travel & Local Pickup panel per wedding (safe default OFF if Flagsmith unreachable)",
  },
  {
    key: "travel_modes",
    type: "json",
    defaultValue: FLAG_DEFAULTS.travel_modes,
    controls: "Enabled intercity booking modes ({ bus, train, flight }) shown in the Book Travel panel",
  },
  {
    key: "travel_providers",
    type: "json",
    defaultValue: FLAG_DEFAULTS.travel_providers,
    controls: "Remote-config provider names and {from}/{to}/{date} URL templates for Bus (redBus), Train (ixigo/redBus), and Flight (Skyscanner/MakeMyTrip)",
  },
  {
    key: "travel_featured_vendor",
    type: "boolean",
    defaultValue: FLAG_DEFAULTS.travel_featured_vendor,
    controls: "Ranks Pro-plan local travel & cab operators first under Local Pickup",
  },
];
