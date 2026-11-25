import { loadWeddingCard, VALID_FUNCTION_IDS } from "./config.ts";
import type {
  ArrivalGroupRow,
  ArrivalsSummary,
  DietBreakdown,
  FunctionId,
  GuestRsvp,
  HostAnnouncement,
  HouseholdRecord,
  RsvpPatch,
  ShopGender,
  ShopProduct,
  ShopProductType,
  ShopProductView,
  TravelMode,
  TravelService,
  TravelServiceView,
  UnansweredQuestion,
  VendorBusinessType,
  VendorPlan,
  VendorRecord,
  WeddingCard,
} from "./types.ts";

// IMPORTANT: store.ts MUST NEVER import brain.ts or any LLM/Sarvam client.
// Caterer totals are strictly deterministic arithmetic over validated GuestRsvp records.

const VALID_TRAVEL_MODES: TravelMode[] = ["bus", "train", "flight", "own"];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateRsvpPatch(
  patch: RsvpPatch,
  currentHeadcount: number | null = null
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (patch.headcount !== undefined && patch.headcount !== null) {
    if (!Number.isInteger(patch.headcount) || patch.headcount < 0) {
      errors.push(`Invalid headcount: ${patch.headcount}. Must be a non-negative integer.`);
    }
  }

  if (patch.headcount_range !== undefined && patch.headcount_range !== null) {
    const [low, high] = patch.headcount_range;
    if (low < 0 || high < low) {
      errors.push(`Invalid headcount_range: [${low}, ${high}].`);
    }
  }

  if (patch.functions !== undefined && patch.functions !== null) {
    for (const fnId of patch.functions) {
      if (!VALID_FUNCTION_IDS.includes(fnId)) {
        errors.push(`Unknown function id: ${fnId}`);
      }
    }
  }

  if (patch.diet !== undefined && patch.diet !== null) {
    const vals = Object.values(patch.diet).filter(
      (v): v is number => typeof v === "number"
    );
    if (vals.some((v) => v < 0)) {
      errors.push("Diet counts cannot be negative.");
    }
    const dietSum =
      (patch.diet.veg ?? 0) +
      (patch.diet.jain ?? 0) +
      (patch.diet.nonveg ?? 0) +
      (patch.diet.no_onion_garlic ?? 0);
    const effectiveHeadcount = patch.headcount ?? currentHeadcount;
    if (effectiveHeadcount !== null && effectiveHeadcount > 0 && dietSum > effectiveHeadcount) {
      warnings.push(
        `Diet total (${dietSum}) exceeds headcount (${effectiveHeadcount}); please confirm meal preferences.`
      );
    }
  }

  if (patch.travel_mode !== undefined && patch.travel_mode !== null) {
    if (!VALID_TRAVEL_MODES.includes(patch.travel_mode)) {
      errors.push(
        `Invalid travel_mode: ${patch.travel_mode}. Must be one of ${VALID_TRAVEL_MODES.join(", ")}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function mergeRsvp(
  existing: GuestRsvp | null,
  gid: string,
  patch: RsvpPatch,
  options?: { confirmed?: boolean; householdCode?: string | null; householdName?: string | null }
): { rsvp: GuestRsvp; becameCompleteFirstTime: boolean; warnings: string[] } {
  const base: GuestRsvp = existing ?? {
    gid,
    household_code: options?.householdCode ?? null,
    household_name: options?.householdName ?? null,
    attending: null,
    headcount: null,
    headcount_range: null,
    functions: [],
    diet: { veg: 0, jain: 0, nonveg: 0, no_onion_garlic: 0 },
    arrival: null,
    travel_mode: null,
    arrival_date: null,
    arrival_time: null,
    arrival_point: null,
    needs_room: null,
    confirmed: false,
    rsvp_complete: false,
    warnings: [],
    updated_at: new Date().toISOString(),
  };

  const validation = validateRsvpPatch(patch, base.headcount);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const wasComplete = base.rsvp_complete;

  const nextAttending =
    patch.attending !== undefined && patch.attending !== null
      ? patch.attending
      : base.attending;

  let nextHeadcount = base.headcount;
  let nextRange = base.headcount_range;
  if (patch.headcount !== undefined && patch.headcount !== null) {
    nextHeadcount = patch.headcount;
    nextRange = null;
  } else if (patch.headcount_range !== undefined && patch.headcount_range !== null) {
    nextRange = patch.headcount_range;
  }

  const nextFunctions =
    patch.functions !== undefined && patch.functions !== null
      ? [...patch.functions]
      : base.functions;

  const nextDiet: DietBreakdown = {
    veg: patch.diet?.veg ?? base.diet.veg,
    jain: patch.diet?.jain ?? base.diet.jain,
    nonveg: patch.diet?.nonveg ?? base.diet.nonveg,
    no_onion_garlic: patch.diet?.no_onion_garlic ?? base.diet.no_onion_garlic,
  };

  const nextArrival =
    patch.arrival !== undefined && patch.arrival !== null
      ? patch.arrival
      : base.arrival;
  const nextTravelMode =
    patch.travel_mode !== undefined ? patch.travel_mode : (base.travel_mode ?? null);
  const nextArrivalDate =
    patch.arrival_date !== undefined
      ? patch.arrival_date?.trim() || null
      : (base.arrival_date ?? null);
  const nextArrivalTime =
    patch.arrival_time !== undefined
      ? patch.arrival_time?.trim() || null
      : (base.arrival_time ?? null);
  const nextArrivalPoint =
    patch.arrival_point !== undefined
      ? patch.arrival_point?.trim() || null
      : (base.arrival_point ?? null);
  const nextNeedsRoom =
    patch.needs_room !== undefined && patch.needs_room !== null
      ? patch.needs_room
      : base.needs_room;

  const nextConfirmed =
    options?.confirmed !== undefined ? options.confirmed : base.confirmed;

  const hasRequiredFields =
    nextAttending === false ||
    (nextHeadcount !== null &&
      nextHeadcount > 0 &&
      nextFunctions.length > 0);

  const isComplete = hasRequiredFields && (options?.confirmed === false ? false : true);

  const merged: GuestRsvp = {
    gid,
    household_code: options?.householdCode ?? base.household_code ?? null,
    household_name: options?.householdName ?? base.household_name ?? null,
    attending: nextAttending,
    headcount: nextAttending === false ? 0 : nextHeadcount,
    headcount_range: nextAttending === false ? null : nextRange,
    functions: nextAttending === false ? [] : nextFunctions,
    diet: nextDiet,
    arrival: nextArrival,
    travel_mode: nextAttending === false ? null : nextTravelMode,
    arrival_date: nextAttending === false ? null : nextArrivalDate,
    arrival_time: nextAttending === false ? null : nextArrivalTime,
    arrival_point: nextAttending === false ? null : nextArrivalPoint,
    needs_room: nextNeedsRoom,
    confirmed: nextConfirmed,
    rsvp_complete: isComplete,
    warnings: validation.warnings,
    updated_at: new Date().toISOString(),
  };

  return {
    rsvp: merged,
    becameCompleteFirstTime: !wasComplete && isComplete,
    warnings: validation.warnings,
  };
}

export interface CatererFunctionSummary {
  id: FunctionId;
  name: string;
  confirmed_headcount: number;
  unconfirmed_min: number;
  unconfirmed_max: number;
  diet: DietBreakdown;
}

export interface CatererSummary {
  caterer_line: string;
  unconfirmed_line: string;
  by_function: Record<FunctionId, CatererFunctionSummary>;
  needs_room_count: number;
  total_rsvps: number;
  confirmed_parties: number;
  declined_parties: number;
}

export function computeCatererSummary(rsvps: GuestRsvp[]): CatererSummary {
  const names: Record<FunctionId, string> = {
    mehendi: "Mehendi",
    sangeet: "Sangeet",
    shaadi: "Shaadi",
    reception: "Reception",
  };

  const byFn: Record<FunctionId, CatererFunctionSummary> = {
    mehendi: {
      id: "mehendi",
      name: names.mehendi,
      confirmed_headcount: 0,
      unconfirmed_min: 0,
      unconfirmed_max: 0,
      diet: { veg: 0, jain: 0, nonveg: 0, no_onion_garlic: 0 },
    },
    sangeet: {
      id: "sangeet",
      name: names.sangeet,
      confirmed_headcount: 0,
      unconfirmed_min: 0,
      unconfirmed_max: 0,
      diet: { veg: 0, jain: 0, nonveg: 0, no_onion_garlic: 0 },
    },
    shaadi: {
      id: "shaadi",
      name: names.shaadi,
      confirmed_headcount: 0,
      unconfirmed_min: 0,
      unconfirmed_max: 0,
      diet: { veg: 0, jain: 0, nonveg: 0, no_onion_garlic: 0 },
    },
    reception: {
      id: "reception",
      name: names.reception,
      confirmed_headcount: 0,
      unconfirmed_min: 0,
      unconfirmed_max: 0,
      diet: { veg: 0, jain: 0, nonveg: 0, no_onion_garlic: 0 },
    },
  };

  let needsRoomCount = 0;
  let confirmedParties = 0;
  let declinedParties = 0;
  let totalUnconfirmedMin = 0;
  let totalUnconfirmedMax = 0;

  for (const r of rsvps) {
    if (r.attending === false) {
      declinedParties += 1;
      continue;
    }
    if (r.rsvp_complete) {
      confirmedParties += 1;
    }
    if (r.needs_room) {
      needsRoomCount += 1;
    }

    const targetFns: FunctionId[] = r.functions.length > 0 ? r.functions : [];

    if ((r.confirmed || r.rsvp_complete) && r.headcount !== null && r.headcount > 0) {
      for (const fn of targetFns) {
        byFn[fn].confirmed_headcount += r.headcount;
        byFn[fn].diet.veg += r.diet.veg;
        byFn[fn].diet.jain += r.diet.jain;
        byFn[fn].diet.nonveg += r.diet.nonveg;
        byFn[fn].diet.no_onion_garlic += r.diet.no_onion_garlic;
      }
    } else if (!r.rsvp_complete && r.headcount !== null && r.headcount > 0) {
      totalUnconfirmedMin += r.headcount;
      totalUnconfirmedMax += r.headcount;
      for (const fn of targetFns) {
        byFn[fn].unconfirmed_min += r.headcount;
        byFn[fn].unconfirmed_max += r.headcount;
      }
    } else if (r.headcount_range !== null) {
      const [lo, hi] = r.headcount_range;
      totalUnconfirmedMin += lo;
      totalUnconfirmedMax += hi;
      for (const fn of targetFns) {
        byFn[fn].unconfirmed_min += lo;
        byFn[fn].unconfirmed_max += hi;
      }
    }
  }

  const catererLine = `Tell the caterer: Mehendi ${byFn.mehendi.confirmed_headcount}, Sangeet ${byFn.sangeet.confirmed_headcount}, Shaadi ${byFn.shaadi.confirmed_headcount}, Reception ${byFn.reception.confirmed_headcount}.`;
  const unconfirmedLine =
    totalUnconfirmedMax > 0
      ? `+ ${totalUnconfirmedMin} to ${totalUnconfirmedMax} unconfirmed (range estimates)`
      : "No unconfirmed ranges";

  return {
    caterer_line: catererLine,
    unconfirmed_line: unconfirmedLine,
    by_function: byFn,
    needs_room_count: needsRoomCount,
    total_rsvps: rsvps.length,
    confirmed_parties: confirmedParties,
    declined_parties: declinedParties,
  };
}

export function computeArrivalsSummary(rsvps: GuestRsvp[]): ArrivalsSummary {
  const groupMap = new Map<string, ArrivalGroupRow>();
  let totalArrivingGuests = 0;
  let confirmedArrivingGuests = 0;
  let totalPartiesWithTravel = 0;

  for (const r of rsvps) {
    if (r.attending === false) continue;
    const hasTravelInfo = Boolean(
      r.travel_mode || r.arrival_date || r.arrival_time || r.arrival_point
    );
    if (!hasTravelInfo) continue;

    totalPartiesWithTravel += 1;
    const count = r.headcount ?? r.headcount_range?.[0] ?? 1;
    const dateKey = r.arrival_date?.trim() || "Date TBC";
    const pointKey =
      r.arrival_point?.trim() ||
      (r.travel_mode === "own" ? "Own vehicle (Direct to venue)" : "Arrival point TBC");
    const key = `${dateKey}|||${pointKey}`;

    let group = groupMap.get(key);
    if (!group) {
      group = {
        arrival_date: dateKey,
        arrival_point: pointKey,
        confirmed_guests: 0,
        pending_guests: 0,
        total_guests: 0,
        parties_count: 0,
        modes: [],
        parties: [],
      };
      groupMap.set(key, group);
    }

    if (r.confirmed) {
      group.confirmed_guests += count;
      confirmedArrivingGuests += count;
    } else {
      group.pending_guests += count;
    }
    group.total_guests += count;
    totalArrivingGuests += count;
    group.parties_count += 1;

    if (r.travel_mode && !group.modes.includes(r.travel_mode)) {
      group.modes.push(r.travel_mode);
    }

    group.parties.push({
      gid: r.gid,
      household: r.household_name || r.household_code || r.gid,
      headcount: count,
      travel_mode: r.travel_mode ?? null,
      arrival_time: r.arrival_time ?? null,
      confirmed: r.confirmed,
    });
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const dCmp = a.arrival_date.localeCompare(b.arrival_date);
    if (dCmp !== 0) return dCmp;
    return a.arrival_point.localeCompare(b.arrival_point);
  });

  return {
    total_arriving_guests: totalArrivingGuests,
    confirmed_arriving_guests: confirmedArrivingGuests,
    total_parties_with_travel: totalPartiesWithTravel,
    groups,
  };
}

export class WeddingStore {
  private card: WeddingCard;
  private rsvps = new Map<string, GuestRsvp>();
  private households = new Map<string, HouseholdRecord>();
  private vendors = new Map<string, VendorRecord>();
  private products = new Map<string, ShopProduct>();
  private travelServices = new Map<string, TravelService>();
  private unanswered: UnansweredQuestion[] = [];
  private announcements: HostAnnouncement[] = [];
  private questionsAnsweredCount = 0;
  private languagesHeard = new Set<string>(["hinglish", "en-IN"]);
  private guestsServedDuringSurge = 0;

  constructor() {
    this.card = loadWeddingCard("wedding.yaml");
    this.seedInitialDemoData();
  }

  private seedInitialDemoData(): void {
    const demoHouseholds: HouseholdRecord[] = [
      {
        code: "IYER01",
        family_name: "Iyer Family",
        preferred_language: "ta",
        age_band: "elder",
        invited_functions: ["mehendi", "sangeet", "shaadi", "reception"],
        gid: "seed-iyer-chn-3",
      },
      {
        code: "SHARMA02",
        family_name: "Sharma Family (Delhi)",
        preferred_language: "hi",
        age_band: "standard",
        invited_functions: ["mehendi", "sangeet", "shaadi", "reception"],
        gid: "seed-sharma-blr-1",
      },
      {
        code: "REDDY03",
        family_name: "Reddy Family (Hyderabad)",
        preferred_language: "en",
        age_band: "standard",
        invited_functions: ["sangeet", "shaadi", "reception"],
        gid: "seed-reddy-hyd-2",
      },
      {
        code: "PATEL04",
        family_name: "Patel Family",
        preferred_language: "hinglish",
        age_band: "standard",
        invited_functions: ["sangeet", "shaadi"],
        gid: "seed-patel-range-4",
      },
      {
        code: "RAO05",
        family_name: "Rao Family (Mysuru)",
        preferred_language: "kn",
        age_band: "elder",
        invited_functions: ["shaadi", "reception"],
        gid: null,
      },
    ];
    for (const h of demoHouseholds) {
      this.households.set(h.code, h);
    }

    const seeds: Array<{ gid: string; code: string; name: string; patch: RsvpPatch }> = [
      {
        gid: "seed-sharma-blr-1",
        code: "SHARMA02",
        name: "Sharma Family (Delhi)",
        patch: {
          attending: true,
          headcount: 6,
          functions: ["mehendi", "sangeet", "shaadi", "reception"],
          diet: { veg: 4, jain: 2, nonveg: 0, no_onion_garlic: 0 },
          travel_mode: "flight",
          arrival_date: "27 Nov 2026",
          arrival_time: "04:15 PM",
          arrival_point: "Kempegowda International Airport (BLR)",
          needs_room: true,
        },
      },
      {
        gid: "seed-reddy-hyd-2",
        code: "REDDY03",
        name: "Reddy Family (Hyderabad)",
        patch: {
          attending: true,
          headcount: 4,
          functions: ["sangeet", "shaadi", "reception"],
          diet: { veg: 1, jain: 0, nonveg: 3, no_onion_garlic: 0 },
          travel_mode: "train",
          arrival_date: "28 Nov 2026",
          arrival_time: "07:30 AM",
          arrival_point: "KSR Bengaluru City Junction (SBC)",
          needs_room: true,
        },
      },
      {
        gid: "seed-iyer-chn-3",
        code: "IYER01",
        name: "Iyer Family",
        patch: {
          attending: true,
          headcount: 3,
          functions: ["shaadi", "reception"],
          diet: { veg: 2, jain: 0, nonveg: 0, no_onion_garlic: 1 },
          travel_mode: "train",
          arrival_date: "28 Nov 2026",
          arrival_time: "11:05 AM",
          arrival_point: "KSR Bengaluru City Junction (SBC)",
          needs_room: false,
        },
      },
      {
        gid: "seed-patel-range-4",
        code: "PATEL04",
        name: "Patel Family",
        patch: {
          attending: true,
          headcount_range: [3, 5],
          functions: ["sangeet", "shaadi"],
          diet: { veg: 0, jain: 3, nonveg: 0, no_onion_garlic: 0 },
          travel_mode: "bus",
          arrival_date: "28 Nov 2026",
          arrival_time: "06:45 AM",
          arrival_point: "Kempegowda Bus Station (Majestic)",
          needs_room: true,
        },
      },
    ];
    for (const s of seeds) {
      const { rsvp } = mergeRsvp(null, s.gid, s.patch, {
        confirmed: true,
        householdCode: s.code,
        householdName: s.name,
      });
      this.rsvps.set(s.gid, rsvp);
    }

    const demoVendors: VendorRecord[] = [
      {
        id: "vendor_annapoorna",
        name: "Annapoorna Caterers",
        business_type: "caterer",
        plan: "pro",
        wedding_ids: ["w_demo"],
        contact_name: "Raghavendra Rao",
        city: "Bengaluru",
        tagline: "Pure Veg, Jain & Traditional Banana-Leaf Wedding Catering",
        questions_used_month: 312,
      },
      {
        id: "vendor_marigold",
        name: "Marigold Decor",
        business_type: "decorator",
        plan: "free",
        wedding_ids: ["w_demo"],
        contact_name: "Kavya Deshmukh",
        city: "Bengaluru",
        tagline: "Mandap Florals, Marigold Torans & Courtyard Lighting",
        questions_used_month: 42,
      },
      {
        id: "vendor_shaadicraft",
        name: "ShaadiCraft Planners",
        business_type: "planner",
        plan: "pro",
        wedding_ids: ["w_demo"],
        contact_name: "Siddharth Menon",
        city: "Bengaluru",
        tagline: "End-to-End Heritage Wedding Production & Guest Logistics",
        questions_used_month: 486,
      },
      {
        id: "vendor_zarivastra",
        name: "ZariVastra Atelier",
        business_type: "boutique",
        plan: "pro",
        wedding_ids: ["w_demo"],
        contact_name: "Nandini Kulkarni",
        city: "Bengaluru",
        tagline: "Handloom Kanjeevarams, Festive Anarkalis & Bespoke Bandhgalas",
        questions_used_month: 615,
      },
      {
        id: "vendor_utsav",
        name: "Utsav Loom & Rentals",
        business_type: "boutique",
        plan: "free",
        wedding_ids: ["w_demo"],
        contact_name: "Arjun Shetty",
        city: "Bengaluru",
        tagline: "Curated Wedding Attire Rentals & Express Festive Styling",
        questions_used_month: 68,
      },
      {
        id: "vendor_deccanchauffeurs",
        name: "Deccan Chauffeurs & Tempo Travels",
        business_type: "travel",
        plan: "pro",
        wedding_ids: ["w_demo"],
        contact_name: "Prakash Gowda",
        city: "Bengaluru",
        tagline: "Airport Transfers, Innova Crystas & AC Tempo Travellers for Wedding Families",
        questions_used_month: 294,
      },
      {
        id: "vendor_nammacabs",
        name: "Namma Station & City Cabs",
        business_type: "travel",
        plan: "free",
        wedding_ids: ["w_demo"],
        contact_name: "Deepak Hegde",
        city: "Bengaluru",
        tagline: "Point-to-Point Sedan & MUV Pickups from KSR Bengaluru (SBC) & Majestic",
        questions_used_month: 54,
      },
    ];
    for (const v of demoVendors) {
      this.vendors.set(v.id, v);
    }

    const demoTravelServices: TravelService[] = [
      {
        id: "trv_deccan_innova",
        vendor_id: "vendor_deccanchauffeurs",
        wedding_id: "w_demo",
        name: "BLR Airport Meet & Greet Transfer",
        vehicle: "Toyota Innova Crysta (AC)",
        seats: 6,
        price_inr: 2400,
        pickup_points: [
          "Kempegowda International Airport (BLR)",
          "Taj MG Road",
        ],
        whatsapp_number: "919845077881",
      },
      {
        id: "trv_deccan_tempo",
        vendor_id: "vendor_deccanchauffeurs",
        wedding_id: "w_demo",
        name: "Family Group AC Tempo Traveller",
        vehicle: "Force Urbania / 12-Seater AC Tempo Traveller",
        seats: 12,
        price_inr: 4600,
        pickup_points: [
          "Kempegowda International Airport (BLR)",
          "KSR Bengaluru City Junction (SBC)",
          "Kempegowda Bus Station (Majestic)",
        ],
        whatsapp_number: "919845077881",
      },
      {
        id: "trv_namma_sedan",
        vendor_id: "vendor_nammacabs",
        wedding_id: "w_demo",
        name: "Railway Station & Majestic Direct Cab",
        vehicle: "Maruti Dzire / Honda Amaze AC Sedan",
        seats: 4,
        price_inr: 950,
        pickup_points: [
          "KSR Bengaluru City Junction (SBC)",
          "Kempegowda Bus Station (Majestic)",
        ],
        whatsapp_number: "919845088992",
      },
      {
        id: "trv_namma_ertiga",
        vendor_id: "vendor_nammacabs",
        wedding_id: "w_demo",
        name: "Venue-to-Hotel Evening Shuttle Cab",
        vehicle: "Maruti Ertiga AC (6-Seater)",
        seats: 6,
        price_inr: 1450,
        pickup_points: [
          "KSR Bengaluru City Junction (SBC)",
          "The Tamarind Tree, Kanakapura Road",
          "The Leela Palace",
        ],
        whatsapp_number: "919845088992",
      },
    ];
    for (const svc of demoTravelServices) {
      this.travelServices.set(svc.id, svc);
    }

    const demoProducts: ShopProduct[] = [
      // MEHENDI & HALDI — "Yellow, mustard, or floral festive wear" (28 Nov 2026)
      {
        id: "prod_mehendi_1",
        vendor_id: "vendor_zarivastra",
        wedding_id: "w_demo",
        name: "Mustard Organza Floral Anarkali",
        image: "/assets/shop/mehendi-anarkali.webp",
        price_inr: 7800,
        type: "buy",
        function_ids: ["mehendi"],
        colour_tags: ["mustard", "yellow", "floral"],
        gender: "women",
        buy_url: "https://zarivastra.example.in/looks/mustard-organza-floral-anarkali",
        whatsapp_number: "919845011221",
        delivers_by: "25 Nov 2026",
      },
      {
        id: "prod_mehendi_2",
        vendor_id: "vendor_zarivastra",
        wedding_id: "w_demo",
        name: "Marigold Silk Kurta & Floral Bandi",
        image: "/assets/shop/mehendi-kurta.webp",
        price_inr: 5400,
        type: "buy",
        function_ids: ["mehendi"],
        colour_tags: ["marigold", "yellow", "floral"],
        gender: "men",
        buy_url: "https://zarivastra.example.in/looks/marigold-silk-kurta-bandi",
        whatsapp_number: "919845011221",
        delivers_by: "25 Nov 2026",
      },
      {
        id: "prod_mehendi_3",
        vendor_id: "vendor_utsav",
        wedding_id: "w_demo",
        name: "Haldi Yellow Gota-Patti Lehenga",
        image: "/assets/shop/mehendi-anarkali.webp",
        price_inr: 2600,
        type: "rent",
        function_ids: ["mehendi"],
        colour_tags: ["yellow", "haldi", "gold"],
        gender: "women",
        buy_url: "https://utsavrentals.example.in/rent/haldi-gota-patti-lehenga",
        whatsapp_number: "919845022334",
        delivers_by: "26 Nov 2026",
      },
      {
        id: "prod_mehendi_4",
        vendor_id: "vendor_marigold",
        wedding_id: "w_demo",
        name: "Sunshine Floral Brocade Nehru Jacket",
        image: "/assets/shop/mehendi-kurta.webp",
        price_inr: 1850,
        type: "rent",
        function_ids: ["mehendi"],
        colour_tags: ["mustard", "floral", "festive"],
        gender: "men",
        buy_url: "https://marigolddecor.example.in/capsule/sunshine-floral-nehru-jacket",
        whatsapp_number: "919845033445",
        delivers_by: "26 Nov 2026",
      },

      // SANGEET NIGHT — "Indo-western shimmer or cocktail festive" (28 Nov 2026)
      {
        id: "prod_sangeet_1",
        vendor_id: "vendor_zarivastra",
        wedding_id: "w_demo",
        name: "Champagne Sequin Pre-Draped Saree Gown",
        image: "/assets/shop/sangeet-gown.webp",
        price_inr: 14500,
        type: "buy",
        function_ids: ["sangeet"],
        colour_tags: ["champagne", "shimmer", "gold"],
        gender: "women",
        buy_url: "https://zarivastra.example.in/looks/champagne-sequin-saree-gown",
        whatsapp_number: "919845011221",
        delivers_by: "25 Nov 2026",
      },
      {
        id: "prod_sangeet_2",
        vendor_id: "vendor_shaadicraft",
        wedding_id: "w_demo",
        name: "Midnight Emerald Velvet Asymmetric Bandhgala",
        image: "/assets/shop/sangeet-bandhgala.webp",
        price_inr: 3400,
        type: "rent",
        function_ids: ["sangeet", "reception"],
        colour_tags: ["emerald", "shimmer", "velvet"],
        gender: "men",
        buy_url: "https://shaadicraft.example.in/wardrobe/emerald-velvet-bandhgala",
        whatsapp_number: "919845044556",
        delivers_by: "26 Nov 2026",
      },
      {
        id: "prod_sangeet_3",
        vendor_id: "vendor_utsav",
        wedding_id: "w_demo",
        name: "Rose-Gold Mirrorwork Cape & Saree Set",
        image: "/assets/shop/sangeet-gown.webp",
        price_inr: 3200,
        type: "rent",
        function_ids: ["sangeet"],
        colour_tags: ["rose-gold", "shimmer", "cocktail"],
        gender: "women",
        buy_url: "https://utsavrentals.example.in/rent/rose-gold-mirrorwork-cape",
        whatsapp_number: "919845022334",
        delivers_by: "26 Nov 2026",
      },
      {
        id: "prod_sangeet_4",
        vendor_id: "vendor_utsav",
        wedding_id: "w_demo",
        name: "Teal Shimmer Cocktail Sherwani Jacket",
        image: "/assets/shop/sangeet-bandhgala.webp",
        price_inr: 9600,
        type: "buy",
        function_ids: ["sangeet"],
        colour_tags: ["teal", "gold", "indo-western"],
        gender: "men",
        buy_url: "https://utsavrentals.example.in/buy/teal-shimmer-cocktail-jacket",
        whatsapp_number: "919845022334",
        delivers_by: "26 Nov 2026",
      },

      // MUHURAT & SHAADI — "Traditional silk sarees, Kanjeevaram, or kurta-dhoti" (29 Nov 2026)
      {
        id: "prod_shaadi_1",
        vendor_id: "vendor_zarivastra",
        wedding_id: "w_demo",
        name: "Crimson & Gold Temple Kanjeevaram Saree",
        image: "/assets/shop/shaadi-kanjeevaram.webp",
        price_inr: 22500,
        type: "buy",
        function_ids: ["shaadi"],
        colour_tags: ["crimson", "gold", "kanjeevaram"],
        gender: "women",
        buy_url: "https://zarivastra.example.in/looks/crimson-temple-kanjeevaram",
        whatsapp_number: "919845011221",
        delivers_by: "26 Nov 2026",
      },
      {
        id: "prod_shaadi_2",
        vendor_id: "vendor_zarivastra",
        wedding_id: "w_demo",
        name: "Ivory Raw-Silk Kurta & Kasavu Dhoti Set",
        image: "/assets/shop/shaadi-kurta-dhoti.webp",
        price_inr: 6900,
        type: "buy",
        function_ids: ["shaadi"],
        colour_tags: ["ivory", "gold", "kasavu"],
        gender: "men",
        buy_url: "https://zarivastra.example.in/looks/ivory-silk-kurta-kasavu-dhoti",
        whatsapp_number: "919845011221",
        delivers_by: "26 Nov 2026",
      },
      {
        id: "prod_shaadi_3",
        vendor_id: "vendor_utsav",
        wedding_id: "w_demo",
        name: "Ruby Zari Pure-Silk Saree (4-Day Rental)",
        image: "/assets/shop/shaadi-kanjeevaram.webp",
        price_inr: 3800,
        type: "rent",
        function_ids: ["shaadi"],
        colour_tags: ["ruby", "zari", "silk"],
        gender: "women",
        buy_url: "https://utsavrentals.example.in/rent/ruby-zari-kanjeevaram",
        whatsapp_number: "919845022334",
        delivers_by: "27 Nov 2026",
      },
      {
        id: "prod_shaadi_4",
        vendor_id: "vendor_utsav",
        wedding_id: "w_demo",
        name: "Gold-Tissue Angavastram & Silk Veshti",
        image: "/assets/shop/shaadi-kurta-dhoti.webp",
        price_inr: 2200,
        type: "rent",
        function_ids: ["shaadi"],
        colour_tags: ["ivory", "gold", "traditional"],
        gender: "unisex",
        buy_url: "https://utsavrentals.example.in/rent/gold-tissue-angavastram-set",
        whatsapp_number: "919845022334",
        delivers_by: "27 Nov 2026",
      },

      // GRAND RECEPTION — "Black tie, evening gowns, or formal bandhgala" (29 Nov 2026)
      {
        id: "prod_reception_1",
        vendor_id: "vendor_zarivastra",
        wedding_id: "w_demo",
        name: "Deep Wine Zardozi Pleated Evening Gown",
        image: "/assets/shop/reception-gown.webp",
        price_inr: 18900,
        type: "buy",
        function_ids: ["reception"],
        colour_tags: ["wine", "maroon", "gold"],
        gender: "women",
        buy_url: "https://zarivastra.example.in/looks/deep-wine-zardozi-evening-gown",
        whatsapp_number: "919845011221",
        delivers_by: "26 Nov 2026",
      },
      {
        id: "prod_reception_2",
        vendor_id: "vendor_zarivastra",
        wedding_id: "w_demo",
        name: "Obsidian Velvet Formal Jodhpuri Bandhgala",
        image: "/assets/shop/reception-tuxedo.webp",
        price_inr: 16800,
        type: "buy",
        function_ids: ["reception"],
        colour_tags: ["black", "obsidian", "gold"],
        gender: "men",
        buy_url: "https://zarivastra.example.in/looks/obsidian-velvet-jodhpuri-bandhgala",
        whatsapp_number: "919845011221",
        delivers_by: "26 Nov 2026",
      },
      {
        id: "prod_reception_3",
        vendor_id: "vendor_utsav",
        wedding_id: "w_demo",
        name: "Burgundy Couture Pleated Reception Gown",
        image: "/assets/shop/reception-gown.webp",
        price_inr: 4500,
        type: "rent",
        function_ids: ["reception"],
        colour_tags: ["burgundy", "formal", "evening"],
        gender: "women",
        buy_url: "https://utsavrentals.example.in/rent/burgundy-couture-gown",
        whatsapp_number: "919845022334",
        delivers_by: "27 Nov 2026",
      },
      {
        id: "prod_reception_4",
        vendor_id: "vendor_utsav",
        wedding_id: "w_demo",
        name: "Midnight Black-Tie Velvet Bandhgala Suit",
        image: "/assets/shop/reception-tuxedo.webp",
        price_inr: 4200,
        type: "rent",
        function_ids: ["reception"],
        colour_tags: ["black", "black-tie", "formal"],
        gender: "men",
        buy_url: "https://utsavrentals.example.in/rent/midnight-black-tie-bandhgala",
        whatsapp_number: "919845022334",
        delivers_by: "27 Nov 2026",
      },
    ];
    for (const p of demoProducts) {
      this.products.set(p.id, p);
    }
  }

  getCard(): WeddingCard {
    return this.card;
  }

  getHousehold(code: string): HouseholdRecord | null {
    return this.households.get(code.toUpperCase()) ?? null;
  }

  getAllHouseholds(): Array<HouseholdRecord & { rsvp_status: "confirmed" | "tentative" | "pending"; headcount: number | null }> {
    return Array.from(this.households.values()).map((h) => {
      const r = h.gid ? this.rsvps.get(h.gid) : undefined;
      const status = r
        ? r.rsvp_complete
          ? "confirmed"
          : "tentative"
        : "pending";
      return {
        ...h,
        rsvp_status: status,
        headcount: r?.headcount ?? null,
      };
    });
  }

  linkHouseholdToGid(code: string, gid: string): HouseholdRecord | null {
    const h = this.households.get(code.toUpperCase());
    if (!h) return null;
    h.gid = gid;
    return h;
  }

  getRsvp(gid: string): GuestRsvp | null {
    return this.rsvps.get(gid) ?? null;
  }

  getAllRsvps(): GuestRsvp[] {
    return Array.from(this.rsvps.values());
  }

  applyRsvpPatch(
    gid: string,
    patch: RsvpPatch,
    options?: { confirmed?: boolean; householdCode?: string | null }
  ): { rsvp: GuestRsvp; becameCompleteFirstTime: boolean; warnings: string[] } {
    const existing = this.rsvps.get(gid) ?? null;
    const h = options?.householdCode ? this.getHousehold(options.householdCode) : null;
    const res = mergeRsvp(existing, gid, patch, {
      confirmed: options?.confirmed,
      householdCode: h?.code ?? existing?.household_code,
      householdName: h?.family_name ?? existing?.household_name,
    });
    this.rsvps.set(gid, res.rsvp);
    return res;
  }

  confirmRsvp(gid: string): { rsvp: GuestRsvp; becameCompleteFirstTime: boolean } | null {
    const existing = this.rsvps.get(gid);
    if (!existing) return null;
    const res = mergeRsvp(existing, gid, {}, { confirmed: true });
    this.rsvps.set(gid, res.rsvp);
    return { rsvp: res.rsvp, becameCompleteFirstTime: res.becameCompleteFirstTime };
  }

  getCatererSummary(): CatererSummary {
    return computeCatererSummary(this.getAllRsvps());
  }

  getConfirmedOnlyCatererSummary(): CatererSummary {
    const confirmedOnly = this.getAllRsvps().filter((r) => r.confirmed);
    return computeCatererSummary(confirmedOnly);
  }

  getArrivalsSummary(): ArrivalsSummary {
    return computeArrivalsSummary(this.getAllRsvps());
  }

  getVendors(): VendorRecord[] {
    return Array.from(this.vendors.values()).map((v) => ({
      ...v,
      wedding_ids: [...v.wedding_ids],
    }));
  }

  getVendor(vendorId: string): VendorRecord | null {
    const v = this.vendors.get(vendorId);
    return v ? { ...v, wedding_ids: [...v.wedding_ids] } : null;
  }

  setVendorPlan(vendorId: string, plan: VendorPlan): VendorRecord | null {
    const existing = this.vendors.get(vendorId);
    if (!existing) return null;
    existing.plan = plan;
    return { ...existing, wedding_ids: [...existing.wedding_ids] };
  }

  private toShopProductView(p: ShopProduct, featuredSlotEnabled: boolean): ShopProductView {
    const vendor = this.vendors.get(p.vendor_id);
    const vendorPlan: VendorPlan = vendor?.plan ?? "free";
    return {
      ...p,
      function_ids: [...p.function_ids],
      colour_tags: [...p.colour_tags],
      vendor_name: vendor?.name ?? "Wedding Partner",
      vendor_plan: vendorPlan,
      is_featured: featuredSlotEnabled && vendorPlan === "pro",
    };
  }

  getShopProducts(
    filters?: {
      fn?: FunctionId;
      type?: ShopProductType;
      gender?: ShopGender;
      vendorId?: string;
      weddingId?: string;
    },
    options?: { featuredFirst?: boolean }
  ): ShopProductView[] {
    const featuredFirst = options?.featuredFirst ?? true;
    const all = Array.from(this.products.values())
      .filter((p) => {
        if (filters?.weddingId && p.wedding_id !== filters.weddingId) return false;
        if (filters?.vendorId && p.vendor_id !== filters.vendorId) return false;
        if (filters?.fn && !p.function_ids.includes(filters.fn)) return false;
        if (filters?.type && p.type !== filters.type) return false;
        if (filters?.gender && p.gender !== filters.gender) return false;
        return true;
      })
      .map((p) => this.toShopProductView(p, featuredFirst));

    if (featuredFirst) {
      all.sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        return 0;
      });
    }
    return all;
  }

  getShopProduct(productId: string): ShopProduct | null {
    const p = this.products.get(productId);
    return p
      ? {
          ...p,
          function_ids: [...p.function_ids],
          colour_tags: [...p.colour_tags],
        }
      : null;
  }

  createShopProduct(
    vendorId: string,
    input: Omit<ShopProduct, "id" | "vendor_id" | "wedding_id">
  ): ShopProduct {
    const vendor = this.vendors.get(vendorId);
    if (!vendor) {
      throw new Error("Partner business not found");
    }
    const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanFunctions = input.function_ids.filter((f) => VALID_FUNCTION_IDS.includes(f));
    const product: ShopProduct = {
      id,
      vendor_id: vendorId,
      wedding_id: this.card.wedding.id || "w_demo",
      name: input.name.trim(),
      image: input.image.trim() || "/assets/shop/mehendi-anarkali.webp",
      price_inr: Math.max(0, Math.round(Number(input.price_inr) || 0)),
      type: input.type === "rent" ? "rent" : "buy",
      function_ids: cleanFunctions.length > 0 ? cleanFunctions : ["mehendi"],
      colour_tags: input.colour_tags.map((t) => t.trim()).filter(Boolean),
      gender:
        input.gender === "men" || input.gender === "unisex" ? input.gender : "women",
      buy_url: input.buy_url.trim(),
      whatsapp_number: input.whatsapp_number.replace(/[^\d]/g, ""),
      delivers_by: input.delivers_by.trim() || "26 Nov 2026",
    };
    this.products.set(id, product);
    return {
      ...product,
      function_ids: [...product.function_ids],
      colour_tags: [...product.colour_tags],
    };
  }

  updateShopProduct(
    productId: string,
    vendorId: string,
    patch: Partial<Omit<ShopProduct, "id" | "vendor_id" | "wedding_id">>
  ): ShopProduct | null {
    const existing = this.products.get(productId);
    if (!existing || existing.vendor_id !== vendorId) return null;
    const cleanFunctions = patch.function_ids
      ? patch.function_ids.filter((f) => VALID_FUNCTION_IDS.includes(f))
      : existing.function_ids;
    const updated: ShopProduct = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      image: patch.image !== undefined ? patch.image.trim() : existing.image,
      price_inr:
        patch.price_inr !== undefined
          ? Math.max(0, Math.round(Number(patch.price_inr) || 0))
          : existing.price_inr,
      type:
        patch.type !== undefined
          ? patch.type === "rent"
            ? "rent"
            : "buy"
          : existing.type,
      function_ids: cleanFunctions.length > 0 ? cleanFunctions : existing.function_ids,
      colour_tags:
        patch.colour_tags !== undefined
          ? patch.colour_tags.map((t) => t.trim()).filter(Boolean)
          : existing.colour_tags,
      gender:
        patch.gender !== undefined
          ? patch.gender === "men" || patch.gender === "unisex"
            ? patch.gender
            : "women"
          : existing.gender,
      buy_url: patch.buy_url !== undefined ? patch.buy_url.trim() : existing.buy_url,
      whatsapp_number:
        patch.whatsapp_number !== undefined
          ? patch.whatsapp_number.replace(/[^\d]/g, "")
          : existing.whatsapp_number,
      delivers_by:
        patch.delivers_by !== undefined ? patch.delivers_by.trim() : existing.delivers_by,
    };
    this.products.set(productId, updated);
    return {
      ...updated,
      function_ids: [...updated.function_ids],
      colour_tags: [...updated.colour_tags],
    };
  }

  private toTravelServiceView(
    s: TravelService,
    featuredVendorEnabled: boolean
  ): TravelServiceView {
    const vendor = this.vendors.get(s.vendor_id);
    const vendorPlan: VendorPlan = vendor?.plan ?? "free";
    return {
      ...s,
      pickup_points: [...s.pickup_points],
      vendor_name: vendor?.name ?? "Local Travel Partner",
      vendor_plan: vendorPlan,
      is_featured: featuredVendorEnabled && vendorPlan === "pro",
    };
  }

  getTravelServices(
    filters?: {
      vendorId?: string;
      weddingId?: string;
      pickupPoint?: string;
    },
    options?: { featuredFirst?: boolean }
  ): TravelServiceView[] {
    const featuredFirst = options?.featuredFirst ?? true;
    const pointFilter = (filters?.pickupPoint || "").trim().toLowerCase();
    const all = Array.from(this.travelServices.values())
      .filter((s) => {
        if (filters?.weddingId && s.wedding_id !== filters.weddingId) return false;
        if (filters?.vendorId && s.vendor_id !== filters.vendorId) return false;
        if (
          pointFilter &&
          !s.pickup_points.some((p) => p.toLowerCase().includes(pointFilter))
        ) {
          return false;
        }
        return true;
      })
      .map((s) => this.toTravelServiceView(s, featuredFirst));

    if (featuredFirst) {
      all.sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        return 0;
      });
    }
    return all;
  }

  createTravelService(
    vendorId: string,
    input: Omit<TravelService, "id" | "vendor_id" | "wedding_id">
  ): TravelService {
    const vendor = this.vendors.get(vendorId);
    if (!vendor) {
      throw new Error("Partner business not found");
    }
    const id = `trv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const points = input.pickup_points.map((p) => p.trim()).filter(Boolean);
    const service: TravelService = {
      id,
      vendor_id: vendorId,
      wedding_id: this.card.wedding.id || "w_demo",
      name: input.name.trim(),
      vehicle: input.vehicle.trim(),
      seats: Math.max(1, Math.round(Number(input.seats) || 4)),
      price_inr: Math.max(0, Math.round(Number(input.price_inr) || 0)),
      pickup_points:
        points.length > 0 ? points : ["Kempegowda International Airport (BLR)"],
      whatsapp_number: input.whatsapp_number.replace(/[^\d]/g, ""),
    };
    this.travelServices.set(id, service);
    return {
      ...service,
      pickup_points: [...service.pickup_points],
    };
  }

  updateTravelService(
    serviceId: string,
    vendorId: string,
    patch: Partial<Omit<TravelService, "id" | "vendor_id" | "wedding_id">>
  ): TravelService | null {
    const existing = this.travelServices.get(serviceId);
    if (!existing || existing.vendor_id !== vendorId) return null;
    const nextPoints =
      patch.pickup_points !== undefined
        ? patch.pickup_points.map((p) => p.trim()).filter(Boolean)
        : existing.pickup_points;
    const updated: TravelService = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      vehicle: patch.vehicle !== undefined ? patch.vehicle.trim() : existing.vehicle,
      seats:
        patch.seats !== undefined
          ? Math.max(1, Math.round(Number(patch.seats) || existing.seats))
          : existing.seats,
      price_inr:
        patch.price_inr !== undefined
          ? Math.max(0, Math.round(Number(patch.price_inr) || 0))
          : existing.price_inr,
      pickup_points: nextPoints.length > 0 ? nextPoints : existing.pickup_points,
      whatsapp_number:
        patch.whatsapp_number !== undefined
          ? patch.whatsapp_number.replace(/[^\d]/g, "")
          : existing.whatsapp_number,
    };
    this.travelServices.set(serviceId, updated);
    return {
      ...updated,
      pickup_points: [...updated.pickup_points],
    };
  }

  addUnanswered(
    gid: string,
    question: string,
    language: string,
    reason: "unanswerable" | "grounding_violation"
  ): UnansweredQuestion {
    const entry: UnansweredQuestion = {
      id: `uq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      gid,
      question,
      language,
      reason,
      created_at: new Date().toISOString(),
      resolved: false,
      answered_after_adding: 0,
    };
    this.unanswered.unshift(entry);
    if (this.unanswered.length > 100) this.unanswered.length = 100;
    return entry;
  }

  getUnanswered(): UnansweredQuestion[] {
    return [...this.unanswered];
  }

  resolveUnansweredAndAddToCard(id: string, answer: string): UnansweredQuestion | null {
    const item = this.unanswered.find((u) => u.id === id);
    if (!item) return null;
    item.resolved = true;
    item.added_answer = answer;
    this.card.faqs.push({ q: item.question, a: answer, added_by_host: true });
    return item;
  }

  recordHostFaqHit(questionText: string): void {
    const lower = questionText.toLowerCase();
    for (const uq of this.unanswered) {
      if (!uq.resolved) continue;
      const words = uq.question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => lower.includes(w))) {
        uq.answered_after_adding += 1;
      }
    }
  }

  recordTurnStats(language: string, level: number): void {
    this.questionsAnsweredCount += 1;
    if (language) {
      this.languagesHeard.add(language.toLowerCase().split("-")[0]);
    }
    if (level > 0) {
      this.guestsServedDuringSurge += 1;
    }
  }

  getJudgeCounters() {
    const summary = this.getCatererSummary();
    return {
      questions_answered: this.questionsAnsweredCount,
      confirmed_rsvps: summary.confirmed_parties,
      languages_heard: Array.from(this.languagesHeard),
      guests_served_during_surge: this.guestsServedDuringSurge,
    };
  }

  addAnnouncement(
    english: string,
    translations: Record<string, string>,
    meta?: { sender_name?: string; sender_type?: "host" | VendorBusinessType }
  ): HostAnnouncement {
    const ann: HostAnnouncement = {
      id: `ann_${Date.now()}`,
      english,
      translations,
      sender_name: meta?.sender_name,
      sender_type: meta?.sender_type ?? "host",
      created_at: new Date().toISOString(),
    };
    this.announcements.unshift(ann);
    if (this.announcements.length > 10) this.announcements.length = 10;
    return ann;
  }

  getAnnouncements(): HostAnnouncement[] {
    return [...this.announcements];
  }

  resetDemoState(): void {
    this.card = loadWeddingCard("wedding.yaml");
    this.rsvps.clear();
    this.households.clear();
    this.vendors.clear();
    this.products.clear();
    this.travelServices.clear();
    this.unanswered = [];
    this.announcements = [];
    this.questionsAnsweredCount = 0;
    this.languagesHeard = new Set<string>(["hinglish", "en-IN"]);
    this.guestsServedDuringSurge = 0;
    this.seedInitialDemoData();
  }
}

export const store = new WeddingStore();
