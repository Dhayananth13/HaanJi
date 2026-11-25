export interface WeddingFunctionItem {
  id: string;
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

export interface WeddingContact {
  role: string;
  name: string;
  note: string;
  phone?: string;
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

export interface WeddingCardData {
  wedding: {
    id: string;
    title: string;
    subtitle: string;
    dates: string;
    city: string;
    demo_notice: string;
  };
  functions: WeddingFunctionItem[];
  logistics: {
    parking: string;
    shuttle: string;
    contacts: WeddingContact[];
  };
  faqs: Array<{ q: string; a: string }>;
  travel?: WeddingTravelInfo;
}

export type TravelMode = "bus" | "train" | "flight" | "own";
export type BookableTravelMode = "bus" | "train" | "flight";

export interface TravelProviderConfig {
  name: string;
  url_template?: string;
  homepage?: string;
}

export type TravelProvidersMap = Record<BookableTravelMode, TravelProviderConfig>;
export type TravelModesConfig = Record<BookableTravelMode, boolean>;

export interface TravelServiceItem {
  id: string;
  vendor_id: string;
  wedding_id: string;
  name: string;
  vehicle: string;
  seats: number;
  price_inr: number;
  pickup_points: string[];
  whatsapp_number: string;
  vendor_name: string;
  vendor_plan: VendorPlan;
  is_featured: boolean;
}

export interface TravelApiResponse {
  wedding_id: string;
  wedding_title: string;
  travel_enabled: boolean;
  travel_modes: TravelModesConfig;
  travel_providers: TravelProvidersMap;
  travel_featured_vendor: boolean;
  travel: WeddingTravelInfo | null;
  services: TravelServiceItem[];
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

export interface GuestRsvp {
  gid: string;
  household_code?: string | null;
  household_name?: string | null;
  attending: boolean | null;
  headcount: number | null;
  headcount_range: [number, number] | null;
  functions: string[];
  diet: { veg: number; jain: number; nonveg: number; no_onion_garlic: number };
  travel_mode?: TravelMode | null;
  arrival_date?: string | null;
  arrival_time?: string | null;
  arrival_point?: string | null;
  needs_room: boolean | null;
  confirmed: boolean;
  rsvp_complete: boolean;
  warnings: string[];
}

export interface HouseholdInfo {
  code: string;
  family_name: string;
  preferred_language: string;
  age_band: "standard" | "elder";
}

export interface AnnouncementItem {
  id: string;
  english: string;
  translations: Record<string, string>;
  sender_name?: string;
  sender_type?: "host" | "caterer" | "decorator" | "planner" | "boutique" | "travel";
  audio_base64?: string;
  audio_mime?: string;
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

export interface ShopProductItem {
  id: string;
  vendor_id: string;
  wedding_id: string;
  name: string;
  image: string;
  price_inr: number;
  type: ShopProductType;
  function_ids: string[];
  colour_tags: string[];
  gender: ShopGender;
  buy_url: string;
  whatsapp_number: string;
  delivers_by: string;
  vendor_name: string;
  vendor_plan: VendorPlan;
  is_featured: boolean;
}

export interface ShopApiResponse {
  shop_enabled: boolean;
  shop_featured_slot: boolean;
  placement_arm: ShopPlacementArm;
  wedding_id: string;
  wedding_title: string;
  products: ShopProductItem[];
}

export interface ShopExperimentSummary {
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
}

export interface PartnerVendor {
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

export interface PartnerFeatureFlags {
  b2b_partner_portal: boolean;
  b2b_live_headcount: boolean;
  b2b_csv_export: boolean;
  b2b_vendor_broadcast: boolean;
  b2b_multi_wedding: boolean;
  b2b_limits: {
    free: { monthly_questions: number };
    pro: { monthly_questions: number };
  };
}

export interface PartnerFlagEvaluation {
  identity: string;
  traits: {
    business_type: VendorBusinessType;
    plan: VendorPlan;
  };
  flags: PartnerFeatureFlags;
  monthly_question_limit: number;
  source: string;
  evaluated_at: string;
}

export interface PartnerCatererSummary {
  caterer_line: string;
  unconfirmed_line: string;
  by_function: Record<
    string,
    {
      id: string;
      name: string;
      confirmed_headcount: number;
      unconfirmed_min: number;
      unconfirmed_max: number;
      diet: { veg: number; jain: number; nonveg: number; no_onion_garlic: number };
    }
  >;
  needs_room_count: number;
  total_rsvps: number;
  confirmed_parties: number;
  declined_parties: number;
}

export interface PartnerWeddingItem {
  id: string;
  title: string;
  subtitle: string;
  dates: string;
  city: string;
  status: "active" | "upcoming";
  confirmed_parties: number;
}

export interface PartnerStateResponse {
  vendor: PartnerVendor;
  flag_evaluation: PartnerFlagEvaluation;
  caterer: PartnerCatererSummary | null;
  card: WeddingCardData;
  announcements: AnnouncementItem[];
  weddings: PartnerWeddingItem[];
  shop_featured_slot: boolean;
  products: ShopProductItem[];
  travel_featured_vendor?: boolean;
  travel_services?: TravelServiceItem[];
}

export interface CapabilitiesSummary {
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
  last_events: {
    sarvam: { summary: string; ts: string | null };
    flagsmith: { summary: string; ts: string | null };
    nudgebee: { summary: string; ts: string | null };
  };
}

export interface CardApiState {
  card: WeddingCardData;
  level: 0 | 1 | 2;
  household: HouseholdInfo | null;
  elder_mode_default: boolean;
  voice_rollout_included: boolean;
  voice_rollout_pct: number;
  voice_paused: boolean;
  shop_enabled: boolean;
  shop_featured_slot: boolean;
  shop_placement: ShopPlacementArm;
  travel_enabled: boolean;
  travel_modes: TravelModesConfig;
  travel_providers: TravelProvidersMap;
  travel_featured_vendor: boolean;
  rsvp: GuestRsvp | null;
  announcements: AnnouncementItem[];
  rsvp_cutoff?: string | null;
  rsvp_closed?: boolean;
}
