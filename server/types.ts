export type FunctionId = "mehendi" | "sangeet" | "shaadi" | "reception";

export type DegradationLevel = 0 | 1 | 2;

export type PersonaArm = "formal" | "warm";

export type IntentType =
  | "faq"
  | "rsvp"
  | "mixed"
  | "unanswerable"
  | "off_topic"
  | "injection";

export interface DietBreakdown {
  veg: number;
  jain: number;
  nonveg: number;
  no_onion_garlic: number;
}

export type TravelMode = "bus" | "train" | "flight" | "own";

export interface RsvpPatch {
  attending?: boolean | null;
  headcount?: number | null;
  headcount_range?: [number, number] | null;
  functions?: FunctionId[] | null;
  diet?: Partial<DietBreakdown> | null;
  arrival?: string | null;
  travel_mode?: TravelMode | null;
  arrival_date?: string | null;
  arrival_time?: string | null;
  arrival_point?: string | null;
  needs_room?: boolean | null;
}

export interface GuestRsvp {
  gid: string;
  household_code?: string | null;
  household_name?: string | null;
  attending: boolean | null;
  headcount: number | null;
  headcount_range: [number, number] | null;
  functions: FunctionId[];
  diet: DietBreakdown;
  arrival: string | null;
  travel_mode: TravelMode | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_point: string | null;
  needs_room: boolean | null;
  confirmed: boolean;
  rsvp_complete: boolean;
  warnings: string[];
  updated_at: string;
}

export interface HouseholdRecord {
  code: string;
  family_name: string;
  preferred_language: "en" | "hi" | "hinglish" | "kn" | "ta";
  age_band: "standard" | "elder";
  invited_functions: FunctionId[];
  gid?: string | null;
}

export interface WeddingFunction {
  id: FunctionId;
  name: string;
  name_hi?: string;
  name_kn?: string;
  name_ta?: string;
  date: string;
  time: string;
  venue: string;
  venue_kn?: string;
  venue_ta?: string;
  maps_url?: string;
  dress_code: string;
  menu: Array<{ item: string; tags: string[] }>;
}

export interface WeddingTravelInfo {
  destination_city: string;
  nearest_railway_station: string;
  nearest_railway_code: string;
  nearest_airport: string;
  nearest_airport_code: string;
  main_bus_stand: string;
  suggested_arrival_date: string;
  suggested_arrival_iso?: string;
  suggested_return_date: string;
  suggested_return_iso?: string;
  venue_maps_url: string;
  venue_address?: string;
}

export interface WeddingCard {
  wedding: {
    id: string;
    title: string;
    subtitle: string;
    dates: string;
    city: string;
    demo_notice: string;
  };
  functions: WeddingFunction[];
  logistics: {
    parking: string;
    shuttle: string;
    contacts: Array<{ role: string; name: string; note: string }>;
  };
  faqs: Array<{ q: string; a: string; added_by_host?: boolean }>;
  travel?: WeddingTravelInfo;
}

export interface BrainResult {
  intent: IntentType;
  answer_text: string;
  answer_language: string;
  rsvp_patch: RsvpPatch;
  rsvp_complete: boolean;
  followup_question: string | null;
  unanswered_question: string | null;
  confidence: number;
  matched_function_id?: FunctionId | null;
  grounding_violation?: boolean;
  violation_reason?: string;
}

export interface TurnJobResult {
  job_id: string;
  gid: string;
  status: "pending" | "queued" | "done" | "error";
  level: DegradationLevel;
  persona: PersonaArm;
  transcript: string;
  detected_language: string;
  answer_text: string;
  answer_language: string;
  audio_base64: string | null;
  audio_mime: string | null;
  prerendered_clip: string | null;
  rsvp: GuestRsvp | null;
  rsvp_needs_confirmation: boolean;
  rsvp_warnings: string[];
  matched_function: WeddingFunction | null;
  grounding_violation: boolean;
  language_label?: string;
  voice_paused?: boolean;
  behind_answer?: {
    provider: string;
    stt: string;
    chat: string;
    tts: string;
    language: string;
    tone: PersonaArm;
    level: DegradationLevel;
    offline_fallback: boolean;
  };
  latency_ms: number;
  stages: {
    stt_ms: number;
    brain_ms: number;
    tts_ms: number;
  };
  error?: string;
  created_at: string;
  finished_at?: string;
}

export interface UnansweredQuestion {
  id: string;
  gid: string;
  question: string;
  language: string;
  reason: "unanswerable" | "grounding_violation";
  created_at: string;
  resolved: boolean;
  added_answer?: string;
  answered_after_adding: number;
}

export interface HostAnnouncement {
  id: string;
  english: string;
  translations: Record<string, string>;
  sender_name?: string;
  sender_type?: "host" | VendorBusinessType;
  created_at: string;
}

export type VendorBusinessType =
  | "caterer"
  | "decorator"
  | "planner"
  | "boutique"
  | "travel";

export type VendorPlan = "free" | "pro";

export type ShopProductType = "buy" | "rent";

export type ShopGender = "women" | "men" | "unisex";

export type ShopPlacementArm = "inline" | "tab";

export type BookableTravelMode = "bus" | "train" | "flight";

export interface TravelProviderConfig {
  name: string;
  url_template?: string;
  homepage?: string;
}

export type TravelProvidersMap = Record<BookableTravelMode, TravelProviderConfig>;

export type TravelModesConfig = Record<BookableTravelMode, boolean>;

export interface TravelService {
  id: string;
  vendor_id: string;
  wedding_id: string;
  name: string;
  vehicle: string;
  seats: number;
  price_inr: number;
  pickup_points: string[];
  whatsapp_number: string;
}

export interface TravelServiceView extends TravelService {
  vendor_name: string;
  vendor_plan: VendorPlan;
  is_featured: boolean;
}

export interface ArrivalGroupRow {
  arrival_date: string;
  arrival_point: string;
  confirmed_guests: number;
  pending_guests: number;
  total_guests: number;
  parties_count: number;
  modes: TravelMode[];
  parties: Array<{
    gid: string;
    household: string;
    headcount: number;
    travel_mode: TravelMode | null;
    arrival_time: string | null;
    confirmed: boolean;
  }>;
}

export interface ArrivalsSummary {
  total_arriving_guests: number;
  confirmed_arriving_guests: number;
  total_parties_with_travel: number;
  groups: ArrivalGroupRow[];
}

export interface ShopProduct {
  id: string;
  vendor_id: string;
  wedding_id: string;
  name: string;
  image: string;
  price_inr: number;
  type: ShopProductType;
  function_ids: FunctionId[];
  colour_tags: string[];
  gender: ShopGender;
  buy_url: string;
  whatsapp_number: string;
  delivers_by: string;
}

export interface ShopProductView extends ShopProduct {
  vendor_name: string;
  vendor_plan: VendorPlan;
  is_featured: boolean;
}

export interface VendorRecord {
  id: string;
  name: string;
  business_type: VendorBusinessType;
  plan: VendorPlan;
  wedding_ids: string[];
  contact_name: string;
  city: string;
  tagline: string;
  questions_used_month: number;
}

export interface VendorTraits {
  business_type: VendorBusinessType;
  plan: VendorPlan;
}

export interface B2bLimitsConfig {
  free: { monthly_questions: number };
  pro: { monthly_questions: number };
}

export interface VendorFeatureFlags {
  b2b_partner_portal: boolean;
  b2b_live_headcount: boolean;
  b2b_csv_export: boolean;
  b2b_vendor_broadcast: boolean;
  b2b_multi_wedding: boolean;
  b2b_limits: B2bLimitsConfig;
}

export interface VendorFlagsEvaluation {
  identity: string;
  traits: VendorTraits;
  flags: VendorFeatureFlags;
  monthly_question_limit: number;
  source: string;
  evaluated_at: string;
}

export interface AlertEvent {
  id: string;
  fingerprint: string;
  status: "firing" | "resolved";
  title: string;
  rule_name: string;
  severity: "high";
  subject: {
    name: string;
    type: string;
    namespace: string;
  };
  labels: Record<string, string>;
  annotations: Record<string, string>;
  timestamp: string;
}

export interface ApprovalWorkflowRun {
  id: string;
  kind: "degrade" | "restore";
  fingerprint: string;
  status: "investigation_ready" | "awaiting_approval" | "approved" | "rejected" | "timed_out";
  rule_name: string;
  created_at: string;
  timeout_minutes: number;
  evidence: {
    pod_status: string;
    cpu_usage: string;
    restarts: number;
    worker_log_excerpt: string;
    recommendation: string;
  };
  proposed_action: {
    level: DegradationLevel;
    rpm_budget: number;
    summary: string;
  };
  decided_by?: string;
  decided_at?: string;
}

export interface FlagAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  reason: string;
  level: DegradationLevel;
  rpm_budget: number;
}

export interface TestCaseResult {
  id: string;
  suite: string;
  name: string;
  passed: boolean;
  duration_ms: number;
  details: string;
  assertion?: string;
}

export interface GoldenCaseResult {
  id: string;
  category: string;
  language: string;
  input: string;
  expected_intent: IntentType;
  actual_intent: IntentType;
  intent_match: boolean;
  rsvp_match: boolean;
  grounding_ok: boolean;
  unanswered_ok: boolean;
  injection_ok: boolean;
  language_ok: boolean;
  answer_text: string;
  latency_ms: number;
  passed: boolean;
  notes: string;
}
