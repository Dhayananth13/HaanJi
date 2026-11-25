import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Cpu,
  Edit3,
  ExternalLink,
  Flag,
  Flower2,
  MapPin,
  Menu,
  Mic,
  Phone,
  Play,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import { DemoChecklist, DemoStepId } from "./components/DemoChecklist";
import { GuestConcierge, GuestDemoEvent } from "./components/GuestConcierge";
import { HostDashboard } from "./components/HostDashboard";
import { JudgeMode } from "./components/JudgeMode";
import { OpsControlPlane } from "./components/OpsControlPlane";
import { PartnerDashboard } from "./components/PartnerDashboard";
import { ShopCatalogView, ShopProductRow } from "./components/ShopTheLook";
import { TestWorkbench } from "./components/TestWorkbench";
import { BookTravelPanel, GettingThereCard } from "./components/TravelPanel";
import { WeddingCardDrawer } from "./components/WeddingCardDrawer";
import {
  AnnouncementItem,
  CapabilitiesSummary,
  CardApiState,
  GuestRsvp,
  HouseholdInfo,
  ShopApiResponse,
  ShopPlacementArm,
  ShopProductItem,
  TravelApiResponse,
  TravelMode,
  TravelModesConfig,
  TravelProvidersMap,
  TravelServiceItem,
  WeddingCardData,
} from "./types/haanji";
import { downloadFunctionIcs } from "./utils/calendar";

type WorkspaceView = "landing" | "shop" | "host" | "partner" | "ops" | "judge" | "tests";

const INITIAL_DEMO_DONE: Record<DemoStepId, boolean> = {
  hinglish: false,
  kannada: false,
  tamil: false,
  rsvp_confirmed: false,
  elder_mode: false,
  ops_rush_done: false,
  ops_flags_checked: false,
};

const SECTION_IDS = ["home", "schedule", "ask", "rsvp", "venues", "travel", "faqs", "contacts"] as const;

const SCHEDULE_IMAGES: Record<string, { src: string; alt: string }> = {
  mehendi: {
    src: "/assets/landing/schedule-mehendi.webp",
    alt: "Hands adorned with mehendi above brass turmeric bowls and marigold garlands on a sunlit lawn",
  },
  sangeet: {
    src: "/assets/landing/schedule-sangeet.webp",
    alt: "Palace courtyard at night with glowing fairy lights, brass dhol drums, and dancing silhouettes",
  },
  shaadi: {
    src: "/assets/landing/schedule-shaadi.webp",
    alt: "Morning wedding mandap with sacred agni fire, Kanjeevaram silk drapes, banana leaves, and brass kalash",
  },
  reception: {
    src: "/assets/landing/schedule-reception.webp",
    alt: "Illuminated royal glass pavilion at night with crystal chandeliers and floral reception stage",
  },
};

function getVenueIllustration(venueName: string): {
  webp: string;
  fallback: string;
  alt: string;
} {
  if (venueName.toLowerCase().includes("leela")) {
    return {
      webp: "/assets/landing/leela-palace-venue.webp",
      fallback: "/assets/landing/leela-palace-venue.webp",
      alt: "Hand-painted illustration of The Leela Palace glass pavilion and palace lawns glowing at night",
    };
  }
  return {
    webp: "/assets/landing/sharma-reddy-venue.webp",
    fallback: "/assets/landing/sharma-reddy-venue.jpg",
    alt: "Hand-painted illustration of The Tamarind Tree garden mandap pavilion in Bengaluru",
  };
}

function getOrCreateGid(): string {
  const existingLs = localStorage.getItem("haanji_gid");
  if (existingLs) {
    document.cookie = `haanji_gid=${encodeURIComponent(existingLs)}; path=/; max-age=31536000; SameSite=Lax`;
    return existingLs;
  }
  const cookieMatch = document.cookie.match(/(?:^|; )haanji_gid=([^;]+)/);
  if (cookieMatch) {
    const val = decodeURIComponent(cookieMatch[1]);
    localStorage.setItem("haanji_gid", val);
    return val;
  }
  const fresh =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `gid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem("haanji_gid", fresh);
  document.cookie = `haanji_gid=${encodeURIComponent(fresh)}; path=/; max-age=31536000; SameSite=Lax`;
  return fresh;
}

function bcpForAnnouncement(langKey: string): string {
  if (langKey === "kn") return "kn-IN";
  if (langKey === "ta") return "ta-IN";
  if (langKey === "hi" || langKey === "hinglish") return "hi-IN";
  return "en-IN";
}

function viewFromPathname(pathname: string): WorkspaceView {
  if (pathname.startsWith("/shop")) return "shop";
  if (pathname.startsWith("/partner")) return "partner";
  if (pathname.startsWith("/judge")) return "judge";
  if (pathname.startsWith("/host")) return "host";
  if (pathname.startsWith("/ops")) return "ops";
  return "landing";
}

function pathnameForView(view: WorkspaceView): string {
  if (view === "shop") return "/shop";
  if (view === "partner") return "/partner";
  if (view === "host") return "/host";
  if (view === "ops") return "/ops";
  if (view === "judge") return "/judge";
  return "/";
}

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>(() => {
    if (typeof window !== "undefined") {
      return viewFromPathname(window.location.pathname);
    }
    return "landing";
  });

  const [gid, setGid] = useState<string>(() => getOrCreateGid());
  const [householdCode, setHouseholdCode] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("h");
    }
    return null;
  });
  const [isDemoMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("demo") === "1";
    }
    return false;
  });

  const [card, setCard] = useState<WeddingCardData | null>(null);
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  const [voicePausedFlag, setVoicePausedFlag] = useState(false);
  const [rsvp, setRsvp] = useState<GuestRsvp | null>(null);
  const [rsvpCutoff, setRsvpCutoff] = useState<string | null>(null);
  const [rsvpClosed, setRsvpClosed] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [dismissedAnnId, setDismissedAnnId] = useState<string | null>(() =>
    localStorage.getItem("haanji_dismissed_ann")
  );
  const [caps, setCaps] = useState<CapabilitiesSummary | null>(null);
  const [opsAvailable, setOpsAvailable] = useState<boolean>(false);
  const [shopEnabled, setShopEnabled] = useState<boolean>(false);
  const [shopPlacement, setShopPlacement] = useState<ShopPlacementArm>("inline");
  const [shopProducts, setShopProducts] = useState<ShopProductItem[]>([]);
  const [shopFilterFn, setShopFilterFn] = useState<string>("all");
  const [travelEnabled, setTravelEnabled] = useState<boolean>(false);
  const [travelModes, setTravelModes] = useState<TravelModesConfig>({
    bus: true,
    train: true,
    flight: true,
  });
  const [travelProviders, setTravelProviders] = useState<TravelProvidersMap | null>(null);
  const [travelServices, setTravelServices] = useState<TravelServiceItem[]>([]);

  const [languageHint, setLanguageHint] = useState("auto");
  const [elderMode, setElderMode] = useState<boolean>(
    () => localStorage.getItem("haanji_elder_mode") === "true"
  );
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [cardDrawerOpen, setCardDrawerOpen] = useState(false);
  const [activeVenueIdx, setActiveVenueIdx] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const markImageFailed = useCallback((key: string) => {
    setFailedImages((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });

  // Hero reply typewriter & audio preview
  const [typedHeroReply, setTypedHeroReply] = useState("");
  const [heroAudioPlaying, setHeroAudioPlaying] = useState(false);
  const heroAudioRef = useRef<HTMLAudioElement | null>(null);
  const annAudioRef = useRef<HTMLAudioElement | null>(null);

  // RSVP inline editor state for #rsvp section
  const [rsvpEditOpen, setRsvpEditOpen] = useState(false);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [rsvpSaveNote, setRsvpSaveNote] = useState<string | null>(null);
  const [rsvpForm, setRsvpForm] = useState({
    attending: true,
    headcount: 2,
    functions: ["shaadi"] as string[],
    jain: 0,
    veg: 2,
    nonveg: 0,
    needs_room: false,
    travel_mode: "" as "" | TravelMode,
    arrival_date: "",
    arrival_time: "",
    arrival_point: "",
  });

  // Concierge coordination signals
  const [focusAskNonce, setFocusAskNonce] = useState(0);
  const [externalQuestion, setExternalQuestion] = useState<{
    text: string;
    autoSubmit?: boolean;
    nonce: number;
  } | null>(null);
  const [demoDone, setDemoDone] = useState<Record<DemoStepId, boolean>>(INITIAL_DEMO_DONE);
  const [guestDemoCmd, setGuestDemoCmd] = useState<{
    action: "ask" | "elder" | "focus_mic";
    text?: string;
    lang?: string;
    nonce: number;
  } | null>(null);
  const [opsDemoFocus, setOpsDemoFocus] = useState<{
    section: "rush" | "flags";
    nonce: number;
  } | null>(null);

  const teamMenuRef = useRef<HTMLDivElement | null>(null);

  const syncRsvpForm = useCallback((next: GuestRsvp) => {
    setRsvpForm({
      attending: next.attending !== false,
      headcount: next.headcount ?? 2,
      functions: next.functions?.length ? next.functions : ["shaadi"],
      jain: next.diet?.jain ?? 0,
      veg: next.diet?.veg ?? 0,
      nonveg: next.diet?.nonveg ?? 0,
      needs_room: Boolean(next.needs_room),
      travel_mode: next.travel_mode || "",
      arrival_date: next.arrival_date || "",
      arrival_time: next.arrival_time || "",
      arrival_point: next.arrival_point || "",
    });
  }, []);

  const fetchCardAndState = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ gid });
      if (householdCode) qs.set("h", householdCode);
      if (languageHint && languageHint !== "auto") qs.set("lang", languageHint);
      const res = await fetch(`/api/card?${qs.toString()}`);
      if (!res.ok) return;
      const data: CardApiState = await res.json();
      setCard(data.card);
      setLevel(data.level);
      setVoicePausedFlag(Boolean(data.voice_paused));
      setAnnouncements(data.announcements || []);
      setRsvpCutoff(data.rsvp_cutoff || null);
      setRsvpClosed(Boolean(data.rsvp_closed));
      setShopEnabled(Boolean(data.shop_enabled));
      setShopPlacement(data.shop_placement || "inline");
      setTravelEnabled(Boolean(data.travel_enabled));
      if (data.travel_modes) setTravelModes(data.travel_modes);
      if (data.travel_providers) setTravelProviders(data.travel_providers);
      if (data.household) setHousehold(data.household);
      if (
        data.elder_mode_default &&
        localStorage.getItem("haanji_elder_mode") === null
      ) {
        setElderMode(true);
      }
      if (data.rsvp) {
        setRsvp(data.rsvp);
        syncRsvpForm(data.rsvp);
      }
      try {
        localStorage.setItem("haanji_cached_card", JSON.stringify(data.card));
      } catch {
        // ignore quota
      }
    } catch {
      // Fallback to cached card if offline
      try {
        const cached = localStorage.getItem("haanji_cached_card");
        if (cached && !card) {
          setCard(JSON.parse(cached) as WeddingCardData);
        }
      } catch {
        // ignore
      }
    }
  }, [gid, householdCode, languageHint, syncRsvpForm, card]);

  const fetchCapabilities = useCallback(async (refresh = false) => {
    try {
      const res = await fetch(`/api/capabilities${refresh ? "?refresh=1" : ""}`);
      if (res.ok) {
        setCaps(await res.json());
      }
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("h");
    if (h) setHouseholdCode(h);
    const onPopState = () => {
      setActiveView(viewFromPathname(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    void fetchCardAndState();
    const id = window.setInterval(() => {
      void fetchCardAndState();
    }, 4500);
    return () => window.clearInterval(id);
  }, [fetchCardAndState]);

  useEffect(() => {
    void fetchCapabilities();
    const capTimer = window.setInterval(() => {
      void fetchCapabilities();
    }, 15000);
    return () => window.clearInterval(capTimer);
  }, [fetchCapabilities]);

  const fetchShopProducts = useCallback(async () => {
    try {
      const res = await fetch(`/api/shop?gid=${encodeURIComponent(gid)}`);
      if (!res.ok) return;
      const data: ShopApiResponse = await res.json();
      setShopProducts(data.products || []);
      if (data.placement_arm) setShopPlacement(data.placement_arm);
    } catch {
      // ignore transient error
    }
  }, [gid]);

  useEffect(() => {
    if (!shopEnabled && activeView !== "shop") return;
    void fetchShopProducts();
  }, [shopEnabled, activeView, fetchShopProducts]);

  const fetchTravelData = useCallback(async () => {
    try {
      const res = await fetch("/api/travel");
      if (!res.ok) return;
      const data: TravelApiResponse = await res.json();
      setTravelEnabled(Boolean(data.travel_enabled));
      if (data.travel_modes) setTravelModes(data.travel_modes);
      if (data.travel_providers) setTravelProviders(data.travel_providers);
      setTravelServices(data.services || []);
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    if (!travelEnabled) return;
    void fetchTravelData();
  }, [travelEnabled, fetchTravelData]);

  const trackShopClick = useCallback(
    (productId: string | undefined, action: string) => {
      void fetch("/api/shop/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid, productId, action }),
      }).catch(() => {});
    },
    [gid]
  );

  useEffect(() => {
    let active = true;
    fetch("/api/ops-proxy/state")
      .then((r) => {
        if (active && r.ok) setOpsAvailable(true);
      })
      .catch(() => {
        if (active) setOpsAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onClickOutside = (ev: MouseEvent) => {
      if (teamMenuRef.current && !teamMenuRef.current.contains(ev.target as Node)) {
        setTeamMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Scrollspy for single-scroll landing sections
  useEffect(() => {
    if (activeView !== "landing") return;
    const observers: IntersectionObserver[] = [];
    const visibleRatios: Record<string, number> = {};

    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visibleRatios[id] = entry.isIntersecting ? entry.intersectionRatio : 0;
          }
          let bestId = "home";
          let bestRatio = -1;
          for (const candidate of SECTION_IDS) {
            const ratio = visibleRatios[candidate] ?? 0;
            if (ratio > bestRatio && ratio > 0.12) {
              bestRatio = ratio;
              bestId = candidate;
            }
          }
          if (bestRatio > 0) {
            setActiveSection(bestId);
            const targetHash = bestId === "home" ? "" : `#${bestId}`;
            if (window.location.hash !== targetHash && window.location.pathname === "/") {
              window.history.replaceState(
                {},
                "",
                `${window.location.pathname}${window.location.search}${targetHash}`
              );
            }
          }
        },
        { threshold: [0.15, 0.35, 0.6], rootMargin: "-72px 0px -30% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    }

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [activeView, card]);

  // Dynamic hero Sangeet reply from /api/card
  const sangeetFn = useMemo(() => {
    return card?.functions?.find((f) => f.id === "sangeet") || card?.functions?.[1] || card?.functions?.[0] || null;
  }, [card]);

  const fullHeroReply = useMemo(() => {
    if (!sangeetFn) return "";
    return `Namaste! ${sangeetFn.name} is at ${sangeetFn.time} on ${sangeetFn.date} at ${sangeetFn.venue}. Dress code: ${sangeetFn.dress_code}.`;
  }, [sangeetFn]);

  useEffect(() => {
    if (!fullHeroReply) {
      setTypedHeroReply("");
      return;
    }
    if (prefersReducedMotion) {
      setTypedHeroReply(fullHeroReply);
      return;
    }
    setTypedHeroReply("");
    let idx = 0;
    const timer = window.setInterval(() => {
      idx += 2;
      setTypedHeroReply(fullHeroReply.slice(0, idx));
      if (idx >= fullHeroReply.length) {
        window.clearInterval(timer);
      }
    }, 24);
    return () => window.clearInterval(timer);
  }, [fullHeroReply, prefersReducedMotion]);

  const scrollToSection = (sectionId: string, focusConcierge = false) => {
    setMobileMenuOpen(false);
    setTeamMenuOpen(false);
    if (activeView !== "landing") {
      setActiveView("landing");
      window.setTimeout(() => {
        const el = document.getElementById(sectionId);
        el?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
        if (focusConcierge) setFocusAskNonce((n) => n + 1);
      }, 90);
    } else {
      const el = document.getElementById(sectionId);
      el?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      if (focusConcierge) setFocusAskNonce((n) => n + 1);
    }
    setActiveSection(sectionId);
    const nextHash = sectionId === "home" ? "" : `#${sectionId}`;
    window.history.replaceState({}, "", `/${window.location.search}${nextHash}`);
  };

  const switchWorkspaceView = (view: WorkspaceView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    setTeamMenuOpen(false);
    if (typeof window !== "undefined") {
      const targetPath = pathnameForView(view);
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, "", `${targetPath}${window.location.search}`);
      }
    }
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const openShopTab = (functionId = "all") => {
    setShopFilterFn(functionId);
    switchWorkspaceView("shop");
  };

  const handleConciergeShopTheLook = (functionId: string) => {
    trackShopClick(undefined, `concierge_chip_${functionId}`);
    if (shopPlacement === "tab") {
      openShopTab(functionId);
      return;
    }
    const targetId = `schedule-fn-${functionId}`;
    const el = document.getElementById(targetId) || document.getElementById("schedule");
    el?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
  };

  const toggleElderMode = () => {
    const next = !elderMode;
    setElderMode(next);
    localStorage.setItem("haanji_elder_mode", String(next));
    if (next && isDemoMode) {
      setDemoDone((prev) => ({ ...prev, elder_mode: true }));
    }
  };

  const rotateSession = () => {
    const fresh = crypto.randomUUID ? crypto.randomUUID() : `gid-${Date.now()}`;
    localStorage.setItem("haanji_gid", fresh);
    document.cookie = `haanji_gid=${encodeURIComponent(fresh)}; path=/; max-age=31536000; SameSite=Lax`;
    setGid(fresh);
    setRsvp(null);
  };

  const openGuestWithHousehold = (code: string) => {
    setHouseholdCode(code);
    setActiveView("landing");
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.searchParams.set("h", code);
    window.history.replaceState({}, "", url.toString());
    window.setTimeout(() => {
      document.getElementById("ask")?.scrollIntoView({ behavior: "smooth" });
    }, 80);
  };

  const playHeroSampleReply = () => {
    if (!fullHeroReply || !caps?.sarvam) return;
    if (heroAudioPlaying) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (heroAudioRef.current) {
        heroAudioRef.current.pause();
        heroAudioRef.current.currentTime = 0;
      }
      setHeroAudioPlaying(false);
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(fullHeroReply);
      u.lang = "en-IN";
      u.rate = elderMode ? 0.85 : 1.0;
      u.onstart = () => setHeroAudioPlaying(true);
      u.onend = () => setHeroAudioPlaying(false);
      u.onerror = () => setHeroAudioPlaying(false);
      setHeroAudioPlaying(true);
      window.speechSynthesis.speak(u);
    }
  };

  const langKey = languageHint === "auto" ? "hinglish" : languageHint.split("-")[0];
  const topAnnouncement = announcements[0];
  const showAnnouncement = Boolean(topAnnouncement && topAnnouncement.id !== dismissedAnnId);

  const playAnnouncement = () => {
    if (!topAnnouncement) return;
    if (topAnnouncement.audio_base64 && annAudioRef.current) {
      annAudioRef.current.src = `data:${topAnnouncement.audio_mime || "audio/wav"};base64,${topAnnouncement.audio_base64}`;
      annAudioRef.current.playbackRate = elderMode ? 0.85 : 0.96;
      void annAudioRef.current.play().catch(() => {});
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const text = topAnnouncement.translations?.[langKey] || topAnnouncement.english;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = bcpForAnnouncement(langKey);
      u.rate = elderMode ? 0.82 : 0.96;
      window.speechSynthesis.speak(u);
    }
  };

  const handleSaveManualRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rsvpSaving || rsvpClosed) return;
    setRsvpSaving(true);
    setRsvpSaveNote(null);
    try {
      const res = await fetch(`/api/rsvp/${encodeURIComponent(gid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdCode: household?.code || householdCode || undefined,
          attending: rsvpForm.attending,
          headcount: rsvpForm.attending ? Number(rsvpForm.headcount) : 0,
          functions: rsvpForm.attending ? rsvpForm.functions : [],
          diet: {
            veg: Number(rsvpForm.veg),
            jain: Number(rsvpForm.jain),
            nonveg: Number(rsvpForm.nonveg),
            no_onion_garlic: 0,
          },
          travel_mode: rsvpForm.attending ? rsvpForm.travel_mode || null : null,
          arrival_date: rsvpForm.attending ? rsvpForm.arrival_date.trim() || null : null,
          arrival_time: rsvpForm.attending ? rsvpForm.arrival_time.trim() || null : null,
          arrival_point: rsvpForm.attending ? rsvpForm.arrival_point.trim() || null : null,
          needs_room: rsvpForm.needs_room,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update RSVP");
      setRsvp(data.rsvp);
      syncRsvpForm(data.rsvp);
      setRsvpEditOpen(false);
      setRsvpSaveNote("RSVP confirmed and synced to the caterer count.");
      if (isDemoMode) {
        setDemoDone((prev) => ({ ...prev, rsvp_confirmed: true }));
      }
    } catch {
      setRsvpSaveNote("Could not save RSVP right now. Please try again.");
    } finally {
      setRsvpSaving(false);
    }
  };

  const handleConfirmPendingRsvp = async () => {
    if (rsvpSaving || rsvpClosed) return;
    setRsvpSaving(true);
    setRsvpSaveNote(null);
    try {
      const res = await fetch(`/api/rsvp/${encodeURIComponent(gid)}/confirm`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRsvp(data.rsvp);
        syncRsvpForm(data.rsvp);
        setRsvpSaveNote("RSVP confirmed and synced to the caterer count.");
        if (isDemoMode) {
          setDemoDone((prev) => ({ ...prev, rsvp_confirmed: true }));
        }
      }
    } finally {
      setRsvpSaving(false);
    }
  };

  const handleGuestSignal = useCallback((evt: GuestDemoEvent) => {
    setDemoDone((prev) => ({ ...prev, [evt]: true }));
  }, []);

  const handleOpsSignal = useCallback((evt: "ops_rush_done" | "ops_flags_checked") => {
    setDemoDone((prev) => ({ ...prev, [evt]: true }));
  }, []);

  const handleSelectDemoStep = (step: DemoStepId) => {
    const nonce = Date.now();
    if (step === "hinglish") {
      switchWorkspaceView("landing");
      window.setTimeout(() => scrollToSection("ask"), 60);
      setGuestDemoCmd({
        action: "ask",
        text: "Sangeet kitne baje start hoga aur kahan hai?",
        lang: "hinglish",
        nonce,
      });
    } else if (step === "kannada") {
      switchWorkspaceView("landing");
      window.setTimeout(() => scrollToSection("ask"), 60);
      setGuestDemoCmd({
        action: "focus_mic",
        text: "ಮುಹೂರ್ತ ಮತ್ತು ಮದುವೆ ಎಷ್ಟು ಗಂಟೆಗೆ ಮತ್ತು ಎಲ್ಲಿ ನಡೆಯುತ್ತದೆ?",
        lang: "kn-IN",
        nonce,
      });
    } else if (step === "tamil") {
      switchWorkspaceView("landing");
      window.setTimeout(() => scrollToSection("ask"), 60);
      setGuestDemoCmd({
        action: "ask",
        text: "முகூர்த்தம் எத்தனை மணிக்கு எங்கே நடைபெறும்?",
        lang: "ta-IN",
        nonce,
      });
    } else if (step === "rsvp_confirmed") {
      switchWorkspaceView("landing");
      window.setTimeout(() => scrollToSection("ask"), 60);
      setGuestDemoCmd({
        action: "ask",
        text: "Hum 4 log aayenge, 2 Jain, sirf shaadi.",
        lang: "hinglish",
        nonce,
      });
    } else if (step === "elder_mode") {
      switchWorkspaceView("landing");
      window.setTimeout(() => scrollToSection("ask"), 60);
      setGuestDemoCmd({ action: "elder", nonce });
    } else if (step === "ops_rush_done") {
      switchWorkspaceView("ops");
      setOpsDemoFocus({ section: "rush", nonce });
    } else if (step === "ops_flags_checked") {
      switchWorkspaceView("ops");
      setOpsDemoFocus({ section: "flags", nonce });
    }
  };

  const handleResetDemo = async () => {
    await fetch("/api/demo/reset", { method: "POST" });
    localStorage.removeItem("haanji_elder_mode");
    localStorage.removeItem("haanji_dismissed_ann");
    setElderMode(false);
    setDismissedAnnId(null);
    setDemoDone(INITIAL_DEMO_DONE);
    setActiveView("landing");
    void fetchCardAndState();
  };

  // Deduplicate unique venues from /api/card
  const uniqueVenues = useMemo(() => {
    if (!card?.functions) return [];
    const seen = new Map<string, { venue: string; maps_url?: string; functions: string[] }>();
    for (const fn of card.functions) {
      const parts = fn.venue.split(",");
      const mainVenue = parts.length > 1 ? parts[parts.length - 1].trim() : fn.venue;
      const existing = seen.get(mainVenue);
      if (existing) {
        existing.functions.push(fn.name);
        if (!existing.maps_url && fn.maps_url) existing.maps_url = fn.maps_url;
      } else {
        seen.set(mainVenue, {
          venue: mainVenue,
          maps_url: fn.maps_url,
          functions: [fn.name],
        });
      }
    }
    return Array.from(seen.values());
  }, [card]);

  const btnMinH = elderMode ? "min-h-[56px]" : "min-h-[44px]";
  const cityShort = card?.wedding?.city ? card.wedding.city.split(",")[0].trim() : "";

  const leftNavLinks: Array<{ id: string; label: string; targetView?: WorkspaceView }> = [
    { id: "home", label: "Home" },
    { id: "schedule", label: "Schedule" },
    { id: "rsvp", label: "RSVP" },
    { id: "ask", label: "Ask HaanJi" },
  ];
  const rightNavLinks: Array<{ id: string; label: string; targetView?: WorkspaceView }> = [
    ...(shopEnabled ? [{ id: "shop", label: "Shop", targetView: "shop" as WorkspaceView }] : []),
    { id: "venues", label: "Venues" },
    ...(travelEnabled ? [{ id: "travel", label: "Travel" }] : []),
    { id: "faqs", label: "FAQs" },
    { id: "contacts", label: "Contacts" },
    { id: "host", label: "Host", targetView: "host" },
    { id: "partner", label: "Partner", targetView: "partner" },
  ];

  return (
    <div
      className={`min-h-screen flex flex-col text-[#F5EDE1] ${
        elderMode ? "elder-root" : ""
      }`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-full focus:bg-[#F5EDE1] focus:text-[#14050A] focus:text-xs focus:font-semibold"
      >
        Skip to content
      </a>

      {/* SINGLE STICKY NAVIGATION BAR (shared across every screen) */}
      <header
        className={`sticky top-0 z-40 transition-colors duration-300 ${
          scrolled || activeView !== "landing"
            ? "bg-[#14050A]/75 backdrop-blur-md border-b border-[#B8925A]/25"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-4">
          {/* Left: Wordmark + hairline + single-row nav at 1280px+ */}
          <div className="flex items-center gap-4 min-w-0">
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("home");
              }}
              className="font-display text-2xl sm:text-3xl font-light tracking-wide text-[#F5EDE1] hover:text-[#E6CFA3] transition-colors whitespace-nowrap shrink-0"
            >
              HaanJi
            </a>

            <span
              aria-hidden="true"
              className="hidden xl:block h-px w-5 bg-[#B8925A]/40 shrink-0"
            />

            {/* Single-row uppercase links at 1280px and up */}
            <nav
              aria-label="Primary navigation"
              className="hidden xl:flex items-center gap-3.5 text-[11px] uppercase tracking-[0.14em]"
            >
              {[...leftNavLinks, ...rightNavLinks].map((item) => {
                const targetView = item.targetView;
                const isActive = targetView
                  ? activeView === targetView
                  : activeView === "landing" && activeSection === item.id;
                return targetView ? (
                  <a
                    key={item.id}
                    href={pathnameForView(targetView)}
                    onClick={(e) => {
                      e.preventDefault();
                      switchWorkspaceView(targetView);
                    }}
                    className={`py-1 uppercase tracking-[0.14em] whitespace-nowrap shrink-0 transition-colors ${
                      isActive ? "text-[#E6CFA3]" : "text-[#F5EDE1]/75 hover:text-[#F5EDE1]"
                    }`}
                  >
                    {item.label}
                  </a>
                ) : (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(item.id, item.id === "ask");
                    }}
                    className={`py-1 whitespace-nowrap shrink-0 transition-colors ${
                      isActive ? "text-[#E6CFA3]" : "text-[#F5EDE1]/75 hover:text-[#F5EDE1]"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Right side controls at 1280px+ */}
          <div className="hidden xl:flex items-center gap-2 shrink-0">
            <select
              aria-label="Language switch"
              value={languageHint}
              onChange={(e) => setLanguageHint(e.target.value)}
              className="min-h-[38px] rounded-full border border-[#B8925A]/45 bg-[#14050A]/75 px-3 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] hover:border-[#E6CFA3]"
            >
              <option value="auto">Auto</option>
              <option value="hi-IN">हिन्दी</option>
              <option value="hinglish">Hinglish</option>
              <option value="en-IN">English</option>
              <option value="kn-IN">ಕನ್ನಡ</option>
              <option value="ta-IN">தமிழ்</option>
            </select>

            <button
              type="button"
              onClick={toggleElderMode}
              aria-pressed={elderMode}
              className={`min-h-[38px] px-3 rounded-full border text-[11px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap shrink-0 ${
                elderMode
                  ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                  : "border-[#B8925A]/45 text-[#F5EDE1]/85 hover:text-[#F5EDE1] hover:border-[#B8925A]"
              }`}
            >
              Elder Mode{elderMode ? " · ON" : ""}
            </button>

            <button
              type="button"
              onClick={() => scrollToSection("rsvp")}
              className="min-h-[38px] px-3.5 rounded-full border border-[#B8925A] text-[11px] uppercase tracking-[0.18em] text-[#F5EDE1] hover:bg-[#B8925A]/15 transition-colors whitespace-nowrap shrink-0"
            >
              RSVP
            </button>

            {/* Team Menu */}
            <div ref={teamMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={teamMenuOpen}
                aria-haspopup="menu"
                onClick={() => setTeamMenuOpen((v) => !v)}
                className={`min-h-[38px] px-3 rounded-full border text-[11px] uppercase tracking-[0.16em] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  activeView === "ops" || activeView === "tests" || activeView === "judge"
                    ? "border-[#E6CFA3] text-[#E6CFA3]"
                    : "border-[#B8925A]/30 text-[#F5EDE1]/75 hover:text-[#F5EDE1]"
                }`}
              >
                <span>Team</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {teamMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 rounded-2xl border border-[#B8925A]/30 bg-[#14050A]/95 backdrop-blur-md p-1.5 space-y-1 z-50"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => switchWorkspaceView("partner")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs uppercase tracking-[0.15em] ${
                      activeView === "partner"
                        ? "bg-[#B8925A]/20 text-[#E6CFA3]"
                        : "text-[#F5EDE1]/85 hover:bg-[#B8925A]/10"
                    }`}
                  >
                    Partner Portal
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => switchWorkspaceView("ops")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs uppercase tracking-[0.15em] ${
                      activeView === "ops"
                        ? "bg-[#B8925A]/20 text-[#E6CFA3]"
                        : "text-[#F5EDE1]/85 hover:bg-[#B8925A]/10"
                    }`}
                  >
                    Ops Control
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => switchWorkspaceView("tests")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs uppercase tracking-[0.15em] ${
                      activeView === "tests"
                        ? "bg-[#B8925A]/20 text-[#E6CFA3]"
                        : "text-[#F5EDE1]/85 hover:bg-[#B8925A]/10"
                    }`}
                  >
                    Test Bench
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => switchWorkspaceView("judge")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs uppercase tracking-[0.15em] ${
                      activeView === "judge"
                        ? "bg-[#B8925A]/20 text-[#E6CFA3]"
                        : "text-[#F5EDE1]/85 hover:bg-[#B8925A]/10"
                    }`}
                  >
                    Judge Mode
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTeamMenuOpen(false);
                      setCardDrawerOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs uppercase tracking-[0.15em] text-[#F5EDE1]/75 hover:bg-[#B8925A]/10 border-t hairline-gold"
                  >
                    Wedding Card
                  </button>
                </div>
              )}
            </div>

            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#B8925A]/40 bg-[#14050A]/80 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] whitespace-nowrap">
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </span>
            )}
          </div>

          {/* Collapsed bar below 1280px: Wordmark + Ask HaanJi icon + Menu button */}
          <div className="flex xl:hidden items-center gap-2 shrink-0">
            {!isOnline && (
              <span
                aria-label="Offline mode active"
                className="px-2.5 py-1 rounded-full border border-[#B8925A]/40 text-[10px] uppercase tracking-[0.14em] text-[#E6CFA3]"
              >
                Offline
              </span>
            )}
            <button
              type="button"
              onClick={() => scrollToSection("ask", true)}
              aria-label="Ask HaanJi"
              className="min-h-[44px] min-w-[44px] rounded-full border border-[#B8925A]/50 bg-[#14050A]/60 flex items-center justify-center text-[#E6CFA3]"
            >
              <Mic className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="min-h-[44px] min-w-[44px] rounded-full border border-[#B8925A]/50 bg-[#14050A]/60 flex items-center justify-center text-[#F5EDE1]"
            >
              <Menu className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* ANNOUNCEMENT STRIP (directly beneath nav, if a family announcement exists) */}
        {showAnnouncement && topAnnouncement && (
          <div className="bg-[#14050A]/85 border-y border-[#B8925A]/25 px-4 sm:px-6 lg:px-10 py-2">
            <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3 text-xs text-[#F5EDE1]">
              <p className="flex-1 min-w-[200px] indic-relaxed text-[#F5EDE1]/90">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#E6CFA3] mr-2.5">
                  {topAnnouncement.sender_type && topAnnouncement.sender_type !== "host"
                    ? `Partner Update · ${topAnnouncement.sender_name || topAnnouncement.sender_type}`
                    : "Family Update"}
                </span>
                {topAnnouncement.translations?.[langKey] || topAnnouncement.english}
              </p>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={playAnnouncement}
                  className="px-3 py-1 rounded-full border border-[#B8925A]/45 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] hover:bg-[#B8925A]/15 inline-flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3" />
                  <span>Listen</span>
                </button>
                <button
                  type="button"
                  aria-label="Dismiss announcement"
                  onClick={() => {
                    setDismissedAnnId(topAnnouncement.id);
                    localStorage.setItem("haanji_dismissed_ann", topAnnouncement.id);
                  }}
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full text-[#F5EDE1]/70 hover:text-[#F5EDE1]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <audio ref={annAudioRef} className="hidden" />
          </div>
        )}
      </header>

      {/* Mobile Full-Screen Overlay Menu */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
          className="fixed inset-0 z-50 bg-[#14050A]/98 backdrop-blur-md p-6 flex flex-col justify-between overflow-y-auto"
        >
          <div className="flex items-center justify-between pb-4 border-b hairline-gold">
            <span className="font-display text-3xl font-light text-[#F5EDE1]">HaanJi</span>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] min-w-[44px] rounded-full border border-[#B8925A]/45 flex items-center justify-center text-[#F5EDE1]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="my-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {[...leftNavLinks, ...rightNavLinks].map((item) =>
                item.targetView ? (
                  <a
                    key={item.id}
                    href={pathnameForView(item.targetView)}
                    onClick={(e) => {
                      e.preventDefault();
                      switchWorkspaceView(item.targetView!);
                    }}
                    className="text-left py-2.5 text-sm uppercase tracking-[0.2em] text-[#E6CFA3]"
                  >
                    {item.label}
                  </a>
                ) : (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(item.id, item.id === "ask");
                    }}
                    className="py-2.5 text-sm uppercase tracking-[0.2em] text-[#F5EDE1]"
                  >
                    {item.label}
                  </a>
                )
              )}
            </div>

            <div className="pt-5 border-t hairline-gold space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3] mb-2">
                  Language
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { val: "auto", label: "Auto" },
                    { val: "hi-IN", label: "हिन्दी" },
                    { val: "hinglish", label: "Hinglish" },
                    { val: "en-IN", label: "English" },
                    { val: "kn-IN", label: "ಕನ್ನಡ" },
                    { val: "ta-IN", label: "தமிழ்" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setLanguageHint(opt.val)}
                      className={`min-h-[44px] px-3.5 rounded-full border text-xs ${
                        languageHint === opt.val
                          ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                          : "border-[#B8925A]/45 text-[#F5EDE1]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs uppercase tracking-[0.18em] text-[#F5EDE1]/85">
                  Elder Mode
                </span>
                <button
                  type="button"
                  onClick={toggleElderMode}
                  aria-pressed={elderMode}
                  className={`min-h-[44px] px-4 rounded-full border text-xs uppercase tracking-[0.16em] ${
                    elderMode
                      ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                      : "border-[#B8925A]/45 text-[#E6CFA3]"
                  }`}
                >
                  {elderMode ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="pt-5 border-t hairline-gold space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3] mb-2">Team</p>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => switchWorkspaceView("ops")}
                  className="min-h-[44px] px-4 rounded-full border border-[#B8925A]/45 text-xs uppercase tracking-[0.16em] text-[#F5EDE1]"
                >
                  Ops Control
                </button>
                <button
                  type="button"
                  onClick={() => switchWorkspaceView("tests")}
                  className="min-h-[44px] px-4 rounded-full border border-[#B8925A]/45 text-xs uppercase tracking-[0.16em] text-[#F5EDE1]"
                >
                  Test Bench
                </button>
                <button
                  type="button"
                  onClick={() => switchWorkspaceView("judge")}
                  className="min-h-[44px] px-4 rounded-full border border-[#B8925A]/45 text-xs uppercase tracking-[0.16em] text-[#F5EDE1]"
                >
                  Judge Mode
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setCardDrawerOpen(true);
            }}
            className="min-h-[44px] w-full rounded-full border border-[#B8925A] text-xs uppercase tracking-[0.2em] text-[#E6CFA3]"
          >
            View Official Wedding Card
          </button>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main id="main-content" className="flex-1 flex flex-col">
        {activeView === "shop" &&
          (shopEnabled ? (
            <ShopCatalogView
              gid={gid}
              card={card}
              initialFunction={shopFilterFn}
              onBackToSchedule={() => scrollToSection("schedule")}
              onShopClick={trackShopClick}
            />
          ) : (
            <section className="mx-auto max-w-2xl w-full px-4 sm:px-6 py-20 text-center space-y-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                Shop the Look
              </p>
              <h1 className="font-display font-light text-4xl text-[#F5EDE1]">
                Boutique looks are currently turned off
              </h1>
              <p className="text-sm text-[#F5EDE1]/75 leading-relaxed">
                The wedding hosts can enable Shop the look anytime from the Host Desk.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => scrollToSection("schedule")}
                  className="min-h-[44px] px-6 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3]"
                >
                  Back to Schedule
                </button>
                <button
                  type="button"
                  onClick={() => switchWorkspaceView("host")}
                  className="min-h-[44px] px-6 rounded-full border border-[#B8925A] text-[#E6CFA3] text-xs uppercase tracking-[0.16em] hover:bg-[#B8925A]/15"
                >
                  Open Host Desk
                </button>
              </div>
            </section>
          ))}
        {activeView === "host" && <HostDashboard onOpenHousehold={openGuestWithHousehold} />}
        {activeView === "partner" && (
          <PartnerDashboard
            onOpenGuestPage={() => switchWorkspaceView("landing")}
            onOpenOpsPage={() => switchWorkspaceView("ops")}
          />
        )}
        {activeView === "ops" && (
          <OpsControlPlane
            onDemoSignal={isDemoMode ? handleOpsSignal : undefined}
            demoFocus={isDemoMode ? opsDemoFocus : null}
          />
        )}
        {activeView === "judge" && <JudgeMode onOpenGuestLink={openGuestWithHousehold} />}
        {activeView === "tests" && <TestWorkbench />}

        {activeView === "landing" && (
          <>
            {/* HERO (Full viewport height on desktop, mobile static hero-mobile + urli rim arc) */}
            <section
              id="home"
              onMouseMove={(e) => {
                if (prefersReducedMotion || window.innerWidth < 768) return;
                const nx = (e.clientX / window.innerWidth - 0.5) * 12;
                const ny = (e.clientY / window.innerHeight - 0.5) * 12;
                setParallaxOffset({ x: nx, y: ny });
              }}
              className="relative min-h-[calc(100vh-76px)] flex items-center overflow-hidden border-b hairline-gold"
            >
              {/* Desktop Hero Video Loop (only >=768px and motion allowed) */}
              {!prefersReducedMotion && (
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/assets/landing/hero-bg.webp"
                  aria-hidden="true"
                  className="hidden md:block pointer-events-none absolute inset-0 w-full h-full object-cover opacity-55"
                >
                  <source src="/assets/landing/hero-loop.mp4" type="video/mp4" />
                </video>
              )}

              {/* Desktop Static Fallback when prefers-reduced-motion is enabled */}
              {prefersReducedMotion && (
                <picture className="hidden md:block pointer-events-none absolute inset-0 w-full h-full">
                  <source srcSet="/assets/landing/hero-bg.webp" type="image/webp" />
                  <img
                    src="/assets/landing/hero-bg.jpg"
                    alt=""
                    aria-hidden="true"
                    className="w-full h-full object-cover opacity-55"
                  />
                </picture>
              )}

              {/* Mobile Hero Background (<768px, NO video, <1.5 MB weight) */}
              <picture className="md:hidden pointer-events-none absolute inset-0 w-full h-full">
                <source srcSet="/assets/landing/hero-mobile.webp" type="image/webp" />
                <img
                  src="/assets/landing/hero-mobile.jpg"
                  alt=""
                  aria-hidden="true"
                  fetchPriority="high"
                  className="w-full h-full object-cover opacity-55"
                />
              </picture>

              {/* Mobile Urli Rim Arc behind hero buttons (<768px) */}
              <picture className="md:hidden pointer-events-none absolute bottom-[-60px] left-1/2 -translate-x-1/2 w-[140%] max-w-none mix-blend-screen opacity-75 animate-urli-rise">
                <source srcSet="/assets/landing/urli.webp" type="image/webp" />
                <img
                  src="/assets/landing/urli.png"
                  alt=""
                  aria-hidden="true"
                  className="w-full h-auto"
                />
              </picture>

              {/* Subtle Jaali + Petals accent layer on reduced-motion or gentle desktop depth */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 hidden md:block"
                style={{
                  transform: `translate3d(${parallaxOffset.x * 0.4}px, ${parallaxOffset.y * 0.4}px, 0)`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#14050A]/90 via-[#14050A]/55 to-[#14050A]/70" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#14050A] via-transparent to-[#14050A]/65" />
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 md:hidden bg-gradient-to-b from-[#14050A]/80 via-[#14050A]/55 to-[#14050A]"
              />

              {/* Subtle Film-Grain Overlay (4% opacity) */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 film-grain-overlay" />

              {/* Hero Foreground Content */}
              <div className="relative z-10 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-10 py-14 lg:py-20">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
                  {/* Left Column (~45% width = 5/12 or 6/12) */}
                  <div className="lg:col-span-6 space-y-6">
                    <div className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-[#B8925A]/55 bg-[#14050A]/50 text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                      हिंदी · Hinglish · ಕನ್ನಡ · தமிழ் · English
                    </div>

                    <h1 className="font-display font-light text-[44px] sm:text-[58px] lg:text-[72px] leading-[1.03] tracking-tight text-[#F5EDE1]">
                      <span className="block animate-hero-line-1">
                        Every question, answered in
                      </span>
                      <span className="block animate-hero-line-2">
                        <em className="italic font-light text-[#B8925A]">your language</em>
                      </span>
                    </h1>

                    <p className="text-base sm:text-lg text-[#F5EDE1]/85 leading-relaxed max-w-xl indic-relaxed">
                      {card ? (
                        <span className="block text-sm uppercase tracking-[0.16em] text-[#E6CFA3] mb-2">
                          {card.wedding.title} · {card.wedding.dates}
                          {cityShort ? ` · ${cityShort}` : ""}
                        </span>
                      ) : null}
                      Wedding season, sorted. Guests ask in their own language. HaanJi answers from the card. The family stops answering the same 200 calls.
                    </p>

                    <div className="relative z-10 flex flex-wrap items-center gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() => scrollToSection("ask", true)}
                        className={`${btnMinH} px-7 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.18em] hover:bg-[#E6CFA3] transition-colors inline-flex items-center gap-2.5`}
                      >
                        <Mic className="w-4 h-4" strokeWidth={1.5} />
                        <span>Ask HaanJi</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => scrollToSection("schedule")}
                        className={`${btnMinH} px-7 rounded-full border border-[#B8925A] text-[#F5EDE1] text-xs uppercase tracking-[0.18em] hover:bg-[#B8925A]/15 transition-colors`}
                      >
                        View schedule
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Dark Glass Preview Card (built from /api/card sangeet) */}
                  <div className="lg:col-span-6">
                    <div className="glass-card p-6 sm:p-8 space-y-6 animate-hero-card">
                      {/* Top voice question pill */}
                      <div className="flex items-center gap-3 rounded-full border border-[#B8925A]/30 bg-[#14050A]/65 px-4 py-2.5">
                        <AudioLines
                          className="w-4 h-4 text-[#E6CFA3] shrink-0"
                          strokeWidth={1.5}
                        />
                        <span className="text-sm text-[#F5EDE1]/90">
                          &ldquo;Sangeet kab hai aur dress code kya hai?&rdquo;
                        </span>
                      </div>

                      {/* Typed-in Card-Grounded Reply */}
                      <div className="min-h-[112px] flex items-center">
                        {sangeetFn ? (
                          <p className="font-display font-light text-2xl sm:text-3xl leading-[1.35] text-[#F5EDE1]">
                            {typedHeroReply || fullHeroReply}
                          </p>
                        ) : (
                          <p className="font-display font-light text-2xl text-[#F5EDE1]/70">
                            Reading the wedding invitation card...
                          </p>
                        )}
                      </div>

                      {/* Bottom row */}
                      <div className="pt-4 border-t hairline-gold flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="px-3 py-1 rounded-full border border-[#B8925A]/35 text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                            Hinglish &rarr; English
                          </span>

                          {caps?.sarvam && sangeetFn && (
                            <button
                              type="button"
                              onClick={playHeroSampleReply}
                              className="min-h-[36px] px-3.5 rounded-full border border-[#B8925A]/55 text-[11px] uppercase tracking-[0.16em] text-[#F5EDE1] hover:bg-[#B8925A]/15 inline-flex items-center gap-1.5"
                            >
                              <Play className="w-3 h-3 text-[#E6CFA3]" />
                              <span>{heroAudioPlaying ? "Stop reply" : "Play reply"}</span>
                            </button>
                          )}
                        </div>

                        <span className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]/80">
                          Grounded in the wedding card
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <audio ref={heroAudioRef} className="hidden" />
            </section>

            {/* 1. #schedule: CELEBRATION SCHEDULE */}
            <section
              id="schedule"
              className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold"
            >
              <div className="mx-auto max-w-7xl space-y-10">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                      01 · Celebration Schedule
                    </p>
                    <h2 className="mt-2 font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                      Four moments together
                    </h2>
                  </div>
                  <p className="text-sm text-[#F5EDE1]/70 max-w-md">
                    Every function timing, venue, dress code, and calendar link synced directly from the wedding card.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                  {(card?.functions || []).map((fn) => {
                    const localFnName =
                      languageHint.startsWith("kn")
                        ? fn.name_kn
                        : languageHint.startsWith("ta")
                          ? fn.name_ta
                          : languageHint.startsWith("hi")
                            ? fn.name_hi
                            : undefined;
                    const schedImg = SCHEDULE_IMAGES[fn.id];
                    const imgKey = `sched-${fn.id}`;
                    const fnShopProducts = shopEnabled
                      ? shopProducts.filter((p) => p.function_ids.includes(fn.id))
                      : [];
                    return (
                      <article
                        key={fn.id}
                        id={`schedule-fn-${fn.id}`}
                        className="glass-card min-w-0 overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          {schedImg && (
                            <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-[#B8925A]/30 bg-[#14050A]/75">
                              {!failedImages[imgKey] ? (
                                <picture className="block w-full h-full">
                                  <source srcSet={schedImg.src} type="image/webp" />
                                  <img
                                    src={schedImg.src}
                                    alt={schedImg.alt}
                                    loading="lazy"
                                    onError={() => markImageFailed(imgKey)}
                                    className="w-full h-full object-cover"
                                  />
                                </picture>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2B0A12] to-[#14050A] px-4 text-center">
                                  <span className="font-display text-lg text-[#E6CFA3]/80">
                                    {fn.name}
                                  </span>
                                </div>
                              )}
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#14050A]/70 to-transparent"
                              />
                            </div>
                          )}

                          <div className="p-5 sm:p-6 space-y-3 min-w-0">
                            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] whitespace-nowrap">
                              <span className="shrink-0">{fn.date}</span>
                              <span className="font-mono tabular-nums shrink-0">{fn.time}</span>
                            </div>

                            <div>
                              <h3 className="font-display font-light text-2xl sm:text-[26px] leading-tight text-[#F5EDE1]">
                                {fn.name}
                              </h3>
                              {localFnName && (
                                <p className="mt-1 text-xs text-[#E6CFA3]/85 indic-relaxed">
                                  {localFnName}
                                </p>
                              )}
                            </div>

                            <p className="text-sm text-[#F5EDE1]/80 leading-relaxed">{fn.venue}</p>

                            <p className="text-xs text-[#F5EDE1]/65 leading-relaxed">
                              <span className="text-[#E6CFA3] uppercase tracking-[0.14em] text-[10px] block mb-0.5">
                                Dress code
                              </span>
                              {fn.dress_code}
                            </p>

                            {shopEnabled && fnShopProducts.length > 0 && (
                              <ShopProductRow
                                functionId={fn.id}
                                functionName={fn.name}
                                products={fnShopProducts}
                                weddingTitle={card?.wedding?.title || "Sharma & Reddy Wedding"}
                                placementArm={shopPlacement}
                                compact
                                onShopClick={trackShopClick}
                                onSeeAll={openShopTab}
                              />
                            )}
                          </div>
                        </div>

                        <div className="mx-5 sm:mx-6 mb-5 sm:mb-6 pt-4 border-t hairline-gold flex items-center justify-between gap-3">
                          {fn.maps_url ? (
                            <a
                              href={fn.maps_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-[#E6CFA3] hover:underline whitespace-nowrap shrink-0"
                            >
                              <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                              <span>Directions</span>
                            </a>
                          ) : (
                            <span />
                          )}

                          <button
                            type="button"
                            onClick={() => downloadFunctionIcs(fn)}
                            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-[#F5EDE1]/85 hover:text-[#E6CFA3] whitespace-nowrap shrink-0"
                          >
                            <CalendarPlus className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                            <span className="xl:hidden">Add to calendar</span>
                            <span className="hidden xl:inline">Calendar</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 2. #ask: ASK HAANJI (INLINE GUEST CONCIERGE) */}
            <section
              id="ask"
              className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold"
            >
              <div className="mx-auto max-w-7xl space-y-8">
                <div className="text-center space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                    02 · Ask HaanJi
                  </p>
                  <h2 className="font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                    Voice &amp; text concierge
                  </h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Illustration above concierge on mobile, beside concierge on desktop */}
                  <div className="order-1 lg:order-2 lg:col-span-4 lg:sticky lg:top-24">
                    <div className="relative rounded-2xl border border-[#B8925A]/45 overflow-hidden bg-[#14050A]/60 aspect-[16/10] sm:aspect-[16/9] lg:aspect-[3/4] w-full">
                      {!failedImages["ask-concierge"] ? (
                        <picture className="block w-full h-full">
                          <source srcSet="/assets/landing/ask-concierge.webp" type="image/webp" />
                          <img
                            src="/assets/landing/ask-concierge.webp"
                            alt="Guest hands holding a phone with glowing antique-gold voice waves surrounded by diyas and marigold garlands"
                            loading="lazy"
                            onError={() => markImageFailed("ask-concierge")}
                            className="w-full h-full object-cover"
                          />
                        </picture>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-6 text-center bg-gradient-to-br from-[#2B0A12] to-[#14050A]">
                          <span className="font-display text-2xl font-light text-[#E6CFA3]">
                            HaanJi Voice Concierge
                          </span>
                        </div>
                      )}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#14050A]/85 via-[#14050A]/35 to-transparent"
                      />
                      <p className="absolute bottom-4 left-4 right-4 text-xs text-[#F5EDE1]/90 leading-relaxed">
                        Hindi, Hinglish, Kannada, Tamil &amp; English — grounded directly in the wedding card.
                      </p>
                    </div>
                  </div>

                  <div className="order-2 lg:order-1 lg:col-span-8 min-w-0">
                    <GuestConcierge
                      gid={gid}
                      householdCode={householdCode}
                      household={household}
                      card={card}
                      level={level}
                      voicePausedFlag={voicePausedFlag}
                      caps={caps}
                      rsvp={rsvp}
                      languageHint={languageHint}
                      elderMode={elderMode}
                      onLanguageHintChange={setLanguageHint}
                      onToggleElderMode={toggleElderMode}
                      onRsvpChange={(next) => {
                        setRsvp(next);
                        syncRsvpForm(next);
                      }}
                      onRotateGid={rotateSession}
                      onRefreshState={() => {
                        void fetchCardAndState();
                        void fetchCapabilities();
                      }}
                      onOpenRsvpEdit={() => {
                        setRsvpEditOpen(true);
                        scrollToSection("rsvp");
                      }}
                      onDemoSignal={isDemoMode ? handleGuestSignal : undefined}
                      demoCommand={isDemoMode ? guestDemoCmd : null}
                      externalQuestion={externalQuestion}
                      focusNonce={focusAskNonce}
                      shopEnabled={shopEnabled}
                      onShopTheLook={handleConciergeShopTheLook}
                      travelEnabled={travelEnabled}
                      onOpenTravel={() => scrollToSection("travel")}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 3. #rsvp: RSVP STATUS & CONFIRMATION */}
            <section
              id="rsvp"
              className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold"
            >
              <div className="mx-auto max-w-7xl space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                      03 · Your RSVP
                    </p>
                    <h2 className="font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                      Attendance &amp; dietary notes
                    </h2>
                    <p className="text-sm text-[#F5EDE1]/75 max-w-xl">
                      Tell us who&apos;s coming and any Jain / veg needs.
                    </p>
                  </div>

                  {rsvpCutoff && (
                    <span className="px-3.5 py-1.5 rounded-full border border-[#B8925A]/45 text-[11px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                      {rsvpClosed ? "RSVP closed, please contact the family" : `RSVPs close ${rsvpCutoff}`}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-7 min-w-0 glass-card p-6 sm:p-8 lg:p-10 space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-6">
                      <div className="space-y-2 min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                          RSVP on record
                        </p>

                        {rsvp ? (
                          <p className="font-display font-light text-2xl sm:text-3xl text-[#F5EDE1]">
                            {rsvp.attending === false
                              ? "Not attending"
                              : `${
                                  rsvp.headcount ??
                                  (rsvp.headcount_range
                                    ? `${rsvp.headcount_range[0]}-${rsvp.headcount_range[1]} tentative`
                                    : "Pending headcount")
                                } guests · ${
                                  rsvp.functions.length
                                    ? rsvp.functions.join(" + ")
                                    : "No functions selected"
                                }`}
                          </p>
                        ) : (
                          <p className="font-display font-light text-2xl text-[#F5EDE1]/75">
                            No RSVP recorded yet. Speak above or edit your count here.
                          </p>
                        )}

                        {rsvp && rsvp.attending !== false && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex flex-wrap items-center gap-3 text-xs text-[#F5EDE1]/75">
                              <span>Veg: {rsvp.diet?.veg ?? 0}</span>
                              <span>·</span>
                              <span>Jain: {rsvp.diet?.jain ?? 0}</span>
                              {rsvp.needs_room && (
                                <>
                                  <span>·</span>
                                  <span className="text-[#E6CFA3]">Hotel room requested</span>
                                </>
                              )}
                              <span>·</span>
                              <span className={rsvp.confirmed ? "text-[#8FB39A]" : "text-[#E6CFA3]"}>
                                {rsvp.confirmed ? "Confirmed to caterer" : "Awaiting confirmation"}
                              </span>
                            </div>
                            {(rsvp.travel_mode || rsvp.arrival_date || rsvp.arrival_point) && (
                              <p className="text-xs text-[#E6CFA3]/85">
                                Arrival:{" "}
                                {[
                                  rsvp.travel_mode ? rsvp.travel_mode.toUpperCase() : null,
                                  rsvp.arrival_date,
                                  rsvp.arrival_time,
                                  rsvp.arrival_point,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {!rsvpClosed && (
                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          {rsvp && !rsvp.confirmed && rsvp.headcount && (
                            <button
                              type="button"
                              disabled={rsvpSaving}
                              onClick={handleConfirmPendingRsvp}
                              className={`${btnMinH} px-6 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3] inline-flex items-center gap-2 whitespace-nowrap`}
                            >
                              <Check className="w-4 h-4" />
                              <span>Confirm RSVP</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRsvpEditOpen((v) => !v)}
                            className={`${btnMinH} px-5 rounded-full border border-[#B8925A] text-[#F5EDE1] text-xs uppercase tracking-[0.18em] hover:bg-[#B8925A]/15 inline-flex items-center gap-2 whitespace-nowrap`}
                          >
                            <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            <span>{rsvpEditOpen ? "Close" : "Edit"}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {rsvp?.warnings && rsvp.warnings.length > 0 && (
                      <p className="text-xs text-[#C98A8A]">{rsvp.warnings[0]}</p>
                    )}

                    {rsvpSaveNote && (
                      <p className="text-xs text-[#8FB39A] flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{rsvpSaveNote}</span>
                      </p>
                    )}

                    {rsvpEditOpen && !rsvpClosed && (
                      <form
                        onSubmit={handleSaveManualRsvp}
                        className="pt-6 border-t hairline-gold space-y-5"
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.14em]">
                            Attending
                            <select
                              value={rsvpForm.attending ? "yes" : "no"}
                              onChange={(e) =>
                                setRsvpForm({ ...rsvpForm, attending: e.target.value === "yes" })
                              }
                              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                            >
                              <option value="yes">Yes</option>
                              <option value="no">Cannot attend</option>
                            </select>
                          </label>

                          <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.14em]">
                            Headcount
                            <input
                              type="number"
                              min={0}
                              max={50}
                              disabled={!rsvpForm.attending}
                              value={rsvpForm.headcount}
                              onChange={(e) =>
                                setRsvpForm({ ...rsvpForm, headcount: Number(e.target.value) })
                              }
                              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1] tabular-nums"
                            />
                          </label>

                          <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.14em]">
                            Jain Meals
                            <input
                              type="number"
                              min={0}
                              disabled={!rsvpForm.attending}
                              value={rsvpForm.jain}
                              onChange={(e) =>
                                setRsvpForm({ ...rsvpForm, jain: Number(e.target.value) })
                              }
                              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1] tabular-nums"
                            />
                          </label>

                          <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.14em]">
                            Veg Meals
                            <input
                              type="number"
                              min={0}
                              disabled={!rsvpForm.attending}
                              value={rsvpForm.veg}
                              onChange={(e) =>
                                setRsvpForm({ ...rsvpForm, veg: Number(e.target.value) })
                              }
                              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1] tabular-nums"
                            />
                          </label>
                        </div>

                        {rsvpForm.attending && (
                          <div className="flex flex-wrap items-center gap-2.5 text-xs">
                            {(["mehendi", "sangeet", "shaadi", "reception"] as const).map((fnId) => {
                              const active = rsvpForm.functions.includes(fnId);
                              return (
                                <button
                                  key={fnId}
                                  type="button"
                                  onClick={() =>
                                    setRsvpForm({
                                      ...rsvpForm,
                                      functions: active
                                        ? rsvpForm.functions.filter((f) => f !== fnId)
                                        : [...rsvpForm.functions, fnId],
                                    })
                                  }
                                  className={`min-h-[44px] px-4 rounded-full border capitalize ${
                                    active
                                      ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                                      : "border-[#B8925A]/35 text-[#F5EDE1]/80 hover:border-[#B8925A]"
                                  }`}
                                >
                                  {fnId}
                                </button>
                              );
                            })}
                            <label className="ml-auto inline-flex items-center gap-2 text-[#F5EDE1]/85">
                              <input
                                type="checkbox"
                                checked={rsvpForm.needs_room}
                                onChange={(e) =>
                                  setRsvpForm({ ...rsvpForm, needs_room: e.target.checked })
                                }
                              />
                              <span>Needs hotel room</span>
                            </label>
                          </div>
                        )}

                        {rsvpForm.attending && (
                          <div className="pt-4 border-t hairline-gold space-y-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                              Travel &amp; Arrival Details (Optional)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.12em]">
                                Travel Mode
                                <select
                                  value={rsvpForm.travel_mode}
                                  onChange={(e) =>
                                    setRsvpForm({
                                      ...rsvpForm,
                                      travel_mode: e.target.value as "" | TravelMode,
                                    })
                                  }
                                  className="mt-1.5 w-full min-h-[42px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                                >
                                  <option value="">Not specified</option>
                                  <option value="flight">Flight</option>
                                  <option value="train">Train</option>
                                  <option value="bus">Bus</option>
                                  <option value="own">Own vehicle</option>
                                </select>
                              </label>

                              <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.12em]">
                                Arrival Date
                                <input
                                  type="text"
                                  value={rsvpForm.arrival_date}
                                  onChange={(e) =>
                                    setRsvpForm({ ...rsvpForm, arrival_date: e.target.value })
                                  }
                                  placeholder={card?.travel?.suggested_arrival_date || "27 Nov 2026"}
                                  className="mt-1.5 w-full min-h-[42px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                                />
                              </label>

                              <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.12em]">
                                Arrival Time
                                <input
                                  type="text"
                                  value={rsvpForm.arrival_time}
                                  onChange={(e) =>
                                    setRsvpForm({ ...rsvpForm, arrival_time: e.target.value })
                                  }
                                  placeholder="e.g. 04:30 PM"
                                  className="mt-1.5 w-full min-h-[42px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                                />
                              </label>

                              <label className="text-xs text-[#E6CFA3] uppercase tracking-[0.12em]">
                                Arrival Point
                                <select
                                  value={rsvpForm.arrival_point}
                                  onChange={(e) =>
                                    setRsvpForm({ ...rsvpForm, arrival_point: e.target.value })
                                  }
                                  className="mt-1.5 w-full min-h-[42px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                                >
                                  <option value="">Select point</option>
                                  <option
                                    value={
                                      card?.travel?.nearest_airport ||
                                      "Kempegowda International Airport (BLR)"
                                    }
                                  >
                                    {card?.travel?.nearest_airport ||
                                      "Kempegowda International Airport (BLR)"}
                                  </option>
                                  <option
                                    value={
                                      card?.travel?.nearest_railway_station ||
                                      "KSR Bengaluru City Junction (SBC)"
                                    }
                                  >
                                    {card?.travel?.nearest_railway_station ||
                                      "KSR Bengaluru City Junction (SBC)"}
                                  </option>
                                  <option
                                    value={
                                      card?.travel?.main_bus_stand ||
                                      "Kempegowda Bus Station (Majestic)"
                                    }
                                  >
                                    {card?.travel?.main_bus_stand ||
                                      "Kempegowda Bus Station (Majestic)"}
                                  </option>
                                  <option value="Own vehicle (Direct to venue)">
                                    Own vehicle (Direct to venue)
                                  </option>
                                </select>
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={rsvpSaving}
                            className={`${btnMinH} px-6 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3] inline-flex items-center gap-2`}
                          >
                            <Check className="w-4 h-4" />
                            <span>{rsvpSaving ? "Saving..." : "Confirm & Save RSVP"}</span>
                          </button>
                        </div>
                      </form>
                    )}

                    <p className="pt-4 border-t hairline-gold text-xs text-[#F5EDE1]/65">
                      Your RSVP reaches the caterer only after you confirm.
                    </p>
                  </div>

                  <div className="lg:col-span-5">
                    <div className="rounded-2xl border border-[#B8925A]/45 overflow-hidden bg-[#14050A]/60 aspect-[4/3] w-full">
                      {!failedImages["rsvp-card-thali"] ? (
                        <picture className="block w-full h-full">
                          <source srcSet="/assets/landing/rsvp-card-thali.webp" type="image/webp" />
                          <img
                            src="/assets/landing/rsvp-card-thali.webp"
                            alt="Wedding invitation card with antique gold wax seal beside a brass vegetarian and Jain festive thali"
                            loading="lazy"
                            onError={() => markImageFailed("rsvp-card-thali")}
                            className="w-full h-full object-cover"
                          />
                        </picture>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-6 text-center bg-gradient-to-br from-[#2B0A12] to-[#14050A]">
                          <span className="font-display text-2xl font-light text-[#E6CFA3]">
                            Wedding RSVP &amp; Dining
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. HOW IT WORKS */}
            <section className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold">
              <div className="mx-auto max-w-7xl space-y-10">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                    04 · How it works
                  </p>
                  <h2 className="mt-2 font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                    Quiet certainty for every guest
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                  {[
                    {
                      num: "01",
                      icon: Mic,
                      image: "/assets/landing/how-step-1.webp",
                      alt: "Illustrated antique-gold speech bubble with ornamental Indic script strokes and marigold accents",
                      title: "Speak in your language",
                      desc: "Ask by voice or text in Hindi, Hinglish, Kannada, Tamil, or English with no app download.",
                    },
                    {
                      num: "02",
                      icon: BookOpen,
                      image: "/assets/landing/how-step-2.webp",
                      alt: "Illustrated open wedding invitation card with an antique-gold wax check seal",
                      title: "HaanJi answers only from the wedding card",
                      desc: "Every timing, venue, dress code, and menu item is checked strictly against the family's official card.",
                    },
                    {
                      num: "03",
                      icon: CheckCircle2,
                      image: "/assets/landing/how-step-3.webp",
                      alt: "Illustrated brass wedding caterer thali paired with a gold confirmation checkmark",
                      title: "Confirm your RSVP, and it reaches the caterer only after you say yes",
                      desc: "Guests review headcounts and Jain or veg preferences before a single plate is added to caterer totals.",
                    },
                  ].map((step) => {
                    const Icon = step.icon;
                    const imgKey = `how-${step.num}`;
                    return (
                      <div key={step.num} className="glass-card min-w-0 p-6 sm:p-7 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border border-[#B8925A]/45 overflow-hidden bg-[#14050A]/75 shrink-0">
                            {!failedImages[imgKey] ? (
                              <picture className="block w-full h-full">
                                <source srcSet={step.image} type="image/webp" />
                                <img
                                  src={step.image}
                                  alt={step.alt}
                                  loading="lazy"
                                  onError={() => markImageFailed(imgKey)}
                                  className="w-full h-full object-cover"
                                />
                              </picture>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-[#2B0A12]">
                                <Icon className="w-7 h-7 text-[#E6CFA3]" strokeWidth={1.25} />
                              </div>
                            )}
                          </div>
                          <span className="font-display font-light text-4xl text-[#B8925A]">
                            {step.num}
                          </span>
                        </div>
                        <h3 className="font-display font-light text-2xl text-[#F5EDE1]">
                          {step.title}
                        </h3>
                        <p className="text-sm text-[#F5EDE1]/70 leading-relaxed">{step.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 5. LANGUAGES MARQUEE (5 supported languages only) */}
            <section
              aria-label="Supported languages"
              className="py-10 border-b hairline-gold overflow-hidden bg-[#14050A]/45"
            >
              <div className="flex whitespace-nowrap w-max animate-lang-marquee">
                {[0, 1].map((dup) => (
                  <div
                    key={dup}
                    aria-hidden={dup === 1}
                    className="flex items-center gap-12 px-6 font-display italic font-light text-3xl sm:text-5xl text-[#E6CFA3]/85"
                  >
                    <span>Namaste</span>
                    <span className="text-[#B8925A]/50">·</span>
                    <span>Haan ji</span>
                    <span className="text-[#B8925A]/50">·</span>
                    <span>Namaskara</span>
                    <span className="text-[#B8925A]/50">·</span>
                    <span>Vanakkam</span>
                    <span className="text-[#B8925A]/50">·</span>
                    <span>Hello</span>
                    <span className="text-[#B8925A]/50">·</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 6. #venues: VENUES */}
            <section
              id="venues"
              className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold"
            >
              {(() => {
                const selectedVenue = uniqueVenues[activeVenueIdx] || uniqueVenues[0];
                const featuredIllustration = getVenueIllustration(
                  selectedVenue?.venue || "Tamarind Tree"
                );
                const featuredKey = `venue-featured-${featuredIllustration.webp}`;
                return (
                  <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                    <div className="lg:col-span-5">
                      <div className="relative rounded-2xl border border-[#B8925A]/45 overflow-hidden bg-[#14050A]/60 aspect-[4/3] w-full">
                        {!failedImages[featuredKey] ? (
                          <picture key={featuredIllustration.webp} className="w-full h-full block">
                            <source srcSet={featuredIllustration.webp} type="image/webp" />
                            <img
                              src={featuredIllustration.fallback}
                              alt={featuredIllustration.alt}
                              loading="lazy"
                              onError={() => markImageFailed(featuredKey)}
                              className="w-full h-full object-cover transition-opacity duration-300"
                            />
                          </picture>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#2B0A12] to-[#14050A]">
                            <span className="font-display text-2xl font-light text-[#E6CFA3]">
                              {selectedVenue?.venue || card?.wedding.city || "Bengaluru"}
                            </span>
                          </div>
                        )}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#14050A]/90 via-[#14050A]/40 to-transparent"
                        />
                        {selectedVenue && (
                          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                                Featured venue
                              </p>
                              <p className="font-display text-xl sm:text-2xl font-light text-[#F5EDE1] truncate">
                                {selectedVenue.venue}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-7 space-y-6 min-w-0">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                          05 · Venues &amp; Travel
                        </p>
                        <h2 className="mt-2 font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                          Where we gather
                        </h2>
                      </div>

                      <div className="space-y-4">
                        {uniqueVenues.map((v, idx) => {
                          const isSelected = idx === activeVenueIdx;
                          const thumb = getVenueIllustration(v.venue);
                          const thumbKey = `venue-thumb-${v.venue}`;
                          return (
                            <div
                              key={v.venue}
                              onMouseEnter={() => setActiveVenueIdx(idx)}
                              onFocus={() => setActiveVenueIdx(idx)}
                              onClick={() => setActiveVenueIdx(idx)}
                              className={`glass-card min-w-0 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 cursor-pointer transition-colors ${
                                isSelected ? "border-[#E6CFA3]/60 bg-[#2B0A12]/45" : "hover:border-[#B8925A]/45"
                              }`}
                            >
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-20 h-14 rounded-xl border border-[#B8925A]/40 overflow-hidden bg-[#14050A]/75 shrink-0">
                                  {!failedImages[thumbKey] ? (
                                    <picture className="block w-full h-full">
                                      <source srcSet={thumb.webp} type="image/webp" />
                                      <img
                                        src={thumb.fallback}
                                        alt={thumb.alt}
                                        loading="lazy"
                                        onError={() => markImageFailed(thumbKey)}
                                        className="w-full h-full object-cover"
                                      />
                                    </picture>
                                  ) : (
                                    <div className="w-full h-full bg-[#2B0A12]" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-display font-light text-2xl text-[#F5EDE1]">
                                    {v.venue}
                                  </h3>
                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#E6CFA3]/80">
                                    {v.functions.join(" · ")}
                                  </p>
                                </div>
                              </div>
                              {v.maps_url && (
                                <a
                                  href={v.maps_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className={`${btnMinH} w-full sm:w-auto justify-center px-5 rounded-full border border-[#B8925A] text-xs uppercase tracking-[0.16em] text-[#F5EDE1] hover:bg-[#B8925A]/15 inline-flex items-center gap-2 shrink-0 whitespace-nowrap`}
                                >
                                  <MapPin className="w-3.5 h-3.5 text-[#E6CFA3] shrink-0" />
                                  <span>Directions</span>
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {card?.logistics && (
                        <div className="glass-card p-6 space-y-2.5 text-sm text-[#F5EDE1]/75">
                          <p>
                            <strong className="text-[#E6CFA3] font-medium">Parking:</strong>{" "}
                            {card.logistics.parking}
                          </p>
                          <p>
                            <strong className="text-[#E6CFA3] font-medium">Shuttles:</strong>{" "}
                            {card.logistics.shuttle}
                          </p>
                        </div>
                      )}
                    </div>

                    {card?.travel && (
                      <div className="lg:col-span-12">
                        <GettingThereCard
                          travel={card.travel}
                          travelEnabled={travelEnabled}
                          onOpenBookTravel={() => scrollToSection("travel")}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>

            {/* 6b. #travel: BOOK TRAVEL & LOCAL PICKUP (Flagsmith travel_enabled) */}
            {travelEnabled && card?.travel && travelProviders && (
              <section
                id="travel"
                className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold"
              >
                <div className="mx-auto max-w-7xl space-y-8">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                        Travel &amp; Local Pickup
                      </p>
                      <h2 className="mt-2 font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                        Plan your trip to Bengaluru
                      </h2>
                    </div>
                    <p className="text-sm text-[#F5EDE1]/70 max-w-md">
                      Book intercity buses, trains, or flights directly on partner platforms, or enquire with verified local cab &amp; tempo-traveller partners.
                    </p>
                  </div>

                  <BookTravelPanel
                    travel={card.travel}
                    weddingTitle={card.wedding.title}
                    modes={travelModes}
                    providers={travelProviders}
                    services={travelServices}
                    household={household}
                    rsvp={rsvp}
                    onOpenRsvpTravel={() => {
                      setRsvpEditOpen(true);
                      scrollToSection("rsvp");
                    }}
                  />
                </div>
              </section>
            )}

            {/* 7. #faqs: GROUNDED FAQS */}
            <section
              id="faqs"
              className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold"
            >
              <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                <div className="lg:col-span-7 space-y-8 min-w-0">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                      06 · Frequently Asked
                    </p>
                    <h2 className="mt-2 font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                      From the wedding card
                    </h2>
                  </div>

                  <div className="divide-y divide-[#B8925A]/25 border-y hairline-gold">
                    {(card?.faqs || []).map((faq, idx) => {
                      const isOpen = openFaqIdx === idx;
                      return (
                        <div key={idx} className="py-5">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                            className="w-full text-left flex items-center justify-between gap-4 py-1"
                          >
                            <span className="font-display font-light text-2xl text-[#F5EDE1]">
                              {faq.q}
                            </span>
                            {isOpen ? (
                              <ChevronUp className="w-5 h-5 text-[#E6CFA3] shrink-0" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-[#B8925A] shrink-0" />
                            )}
                          </button>

                          {isOpen && (
                            <div className="mt-3 space-y-4">
                              <p className="text-sm text-[#F5EDE1]/75 leading-relaxed indic-relaxed">
                                {faq.a}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setExternalQuestion({
                                    text: faq.q,
                                    autoSubmit: true,
                                    nonce: Date.now(),
                                  });
                                  scrollToSection("ask", true);
                                }}
                                className="px-4 py-2 rounded-full border border-[#B8925A]/45 text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3] hover:bg-[#B8925A]/15"
                              >
                                Ask HaanJi about this
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tall sticky side illustration on desktop, hidden on mobile */}
                <div className="hidden lg:block lg:col-span-5 sticky top-24">
                  <div className="rounded-2xl border border-[#B8925A]/45 overflow-hidden bg-[#14050A]/60 aspect-[3/4] w-full">
                    {!failedImages["faq-help-desk"] ? (
                      <picture className="block w-full h-full">
                        <source srcSet="/assets/landing/faq-help-desk.webp" type="image/webp" />
                        <img
                          src="/assets/landing/faq-help-desk.webp"
                          alt="Illustrated palace guest-help welcome desk framed by marigold torans, brass lanterns, and an urli bowl"
                          loading="lazy"
                          onError={() => markImageFailed("faq-help-desk")}
                          className="w-full h-full object-cover"
                        />
                      </picture>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-8 text-center bg-gradient-to-br from-[#2B0A12] to-[#14050A]">
                        <span className="font-display text-2xl font-light text-[#E6CFA3]">
                          Guest Welcome Desk
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 8. SPONSOR TOOLS & MUHURAT PROTECTION */}
            <section className="relative overflow-hidden py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold">
              {/* Faded Muhurat Rush illustration backdrop (15-20% opacity) */}
              {!failedImages["ops-muhurat-rush"] && (
                <picture
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 w-full h-full"
                >
                  <source srcSet="/assets/landing/ops-muhurat-rush.webp" type="image/webp" />
                  <img
                    src="/assets/landing/ops-muhurat-rush.webp"
                    alt=""
                    loading="lazy"
                    onError={() => markImageFailed("ops-muhurat-rush")}
                    className="w-full h-full object-cover opacity-[0.18]"
                  />
                </picture>
              )}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#14050A]/90 via-[#14050A]/70 to-[#14050A]/92"
              />

              <div className="relative z-10 mx-auto max-w-7xl space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div className="max-w-2xl space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                      07 · Calm on the busiest minute
                    </p>
                    <h2 className="font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                      Protected during the muhurat rush
                    </h2>
                    <p className="text-sm text-[#F5EDE1]/75 leading-relaxed">
                      When hundreds of guests ask at once during the muhurat, HaanJi slows down gracefully, and only after a human approves.
                    </p>
                  </div>

                  {opsAvailable && (
                    <button
                      type="button"
                      onClick={() => switchWorkspaceView("ops")}
                      className={`${btnMinH} px-6 rounded-full border border-[#B8925A] text-xs uppercase tracking-[0.18em] text-[#F5EDE1] hover:bg-[#B8925A]/15 whitespace-nowrap shrink-0`}
                    >
                      Open Ops Control
                    </button>
                  )}
                </div>

                {/* 3 Sponsor Tool Cards driven by /api/capabilities */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {[
                    {
                      icon: Sparkles,
                      name: "Sarvam AI",
                      live: Boolean(caps?.sarvam),
                      reason: caps?.sarvam_reason || "Checking status...",
                      role: "Hears, translates, understands, and speaks replies across 5 languages grounded strictly in the wedding card.",
                      lastEvent:
                        caps?.last_events?.sarvam?.summary || "Waiting for first guest voice/text turn",
                      lastTs: caps?.last_events?.sarvam?.ts || null,
                    },
                    {
                      icon: Flag,
                      name: "Flagsmith",
                      live: Boolean(caps?.flagsmith),
                      reason: caps?.flagsmith_reason || "Checking status...",
                      role: "Controls degradation level (0/1/2), 5-55 RPM budget, voice rollout %, Elder Mode defaults, and persona split.",
                      lastEvent:
                        caps?.last_events?.flagsmith?.summary || "Contract default flags active",
                      lastTs: caps?.last_events?.flagsmith?.ts || null,
                    },
                    {
                      icon: Activity,
                      name: "NudgeBee",
                      live: Boolean(caps?.nudgebee),
                      reason: caps?.nudgebee_reason || "Checking status...",
                      role: "Detects quota alerts, investigates cluster health vs. upstream 429s, and awaits human approval before flag changes.",
                      lastEvent:
                        caps?.last_events?.nudgebee?.summary || "No incident alerts triggered yet",
                      lastTs: caps?.last_events?.nudgebee?.ts || null,
                    },
                  ].map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <div
                        key={tool.name}
                        className="glass-card min-w-0 p-6 flex flex-col justify-between space-y-5"
                      >
                        <div className="space-y-3 min-w-0">
                          <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon className="w-5 h-5 text-[#E6CFA3] shrink-0" strokeWidth={1.35} />
                              <h3 className="font-display font-light text-2xl text-[#F5EDE1] whitespace-nowrap">
                                {tool.name}
                              </h3>
                            </div>

                            <div className="flex flex-col items-start gap-1.5 min-w-0">
                              <span
                                title={tool.reason}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] uppercase tracking-[0.14em] whitespace-nowrap ${
                                  tool.live
                                    ? "border-[#8FB39A]/45 bg-[#8FB39A]/10 text-[#8FB39A]"
                                    : "border-[#B8925A]/30 bg-[#14050A]/65 text-[#F5EDE1]/75"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    tool.live ? "bg-[#8FB39A]" : "bg-[#F5EDE1]/45"
                                  }`}
                                />
                                <span>{tool.live ? "Live" : "Not connected"}</span>
                              </span>
                              {!tool.live && (
                                <p className="text-[11px] font-mono text-[#F5EDE1]/55 break-words [overflow-wrap:anywhere] max-w-full">
                                  {tool.reason}
                                </p>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-[#F5EDE1]/75 leading-relaxed break-words">
                            {tool.role}
                          </p>
                        </div>

                        <div className="pt-3 border-t hairline-gold space-y-1 min-w-0">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                            Last real event
                          </p>
                          <p className="text-xs text-[#F5EDE1]/85 font-mono leading-relaxed break-words">
                            {tool.lastEvent}
                            {tool.lastTs ? ` · ${new Date(tool.lastTs).toLocaleTimeString()}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 4-step horizontal flow */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    {
                      icon: Sparkles,
                      name: "1. Sarvam Surge",
                      desc: "Guests ask at once during the 9:30 AM muhurat",
                    },
                    {
                      icon: Activity,
                      name: "2. NudgeBee",
                      desc: "Spots 429s, proves pods are healthy, stops unsafe scaling",
                    },
                    {
                      icon: ShieldCheck,
                      name: "3. Human approval",
                      desc: "Operator approves remediation before any flag mutates",
                    },
                    {
                      icon: Flag,
                      name: "4. Flagsmith",
                      desc: "Switches degradation 0 -> 1 cleanly (text stays live)",
                    },
                  ].map((step) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.name} className="rounded-xl border border-[#B8925A]/20 bg-[#14050A]/65 backdrop-blur-sm p-5 space-y-2 min-w-0">
                        <Icon className="w-4 h-4 text-[#E6CFA3]" strokeWidth={1.35} />
                        <h3 className="font-display font-light text-xl text-[#F5EDE1]">
                          {step.name}
                        </h3>
                        <p className="text-xs text-[#F5EDE1]/70 leading-relaxed">{step.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 9. FOR THE FAMILY: HOST DESK TEASER (Existing features only) */}
            <section className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold">
              <div className="mx-auto max-w-7xl glass-card p-6 sm:p-10 lg:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-5 min-w-0">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                      For the family
                    </p>
                    <h2 className="font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                      Everything the hosts need, in one desk
                    </h2>
                  </div>

                  <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-sm text-[#F5EDE1]/80">
                    <li className="border-l border-[#B8925A]/45 pl-3.5">
                      Announcements in every language
                    </li>
                    <li className="border-l border-[#B8925A]/45 pl-3.5">
                      Family Inbox for unanswered questions
                    </li>
                    <li className="border-l border-[#B8925A]/45 pl-3.5">
                      Live caterer headcount and diet totals
                    </li>
                  </ul>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => switchWorkspaceView("host")}
                      className={`${btnMinH} px-7 rounded-full border border-[#B8925A] text-xs uppercase tracking-[0.18em] text-[#F5EDE1] hover:bg-[#B8925A]/15 whitespace-nowrap`}
                    >
                      Open Host Desk
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <div className="rounded-2xl border border-[#B8925A]/45 overflow-hidden bg-[#14050A]/60 aspect-[4/3] w-full">
                    {!failedImages["family-host-desk"] ? (
                      <picture className="block w-full h-full">
                        <source srcSet="/assets/landing/family-host-desk.webp" type="image/webp" />
                        <img
                          src="/assets/landing/family-host-desk.webp"
                          alt="Family elders and wedding hosts gathered calmly from behind at a decorated table with a laptop and phone"
                          loading="lazy"
                          onError={() => markImageFailed("family-host-desk")}
                          className="w-full h-full object-cover"
                        />
                      </picture>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-6 text-center bg-gradient-to-br from-[#2B0A12] to-[#14050A]">
                        <span className="font-display text-2xl font-light text-[#E6CFA3]">
                          Family Host Desk
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 10. FOR WEDDING BUSINESSES (HAANJI FOR BUSINESS / PARTNER PORTAL) */}
            <section
              id="partners"
              className="py-14 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-10 border-b hairline-gold"
            >
              <div className="mx-auto max-w-7xl space-y-10">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div className="max-w-2xl space-y-2.5">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                      08 · HaanJi for Business
                    </p>
                    <h2 className="font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                      For wedding businesses
                    </h2>
                    <p className="text-sm text-[#F5EDE1]/75 leading-relaxed">
                      Live guest-confirmed headcounts, Jain and veg dietary splits, and instant
                      5-language updates for the teams running the celebration.
                    </p>
                  </div>

                  <a
                    href="/partner"
                    onClick={(e) => {
                      e.preventDefault();
                      switchWorkspaceView("partner");
                    }}
                    className={`${btnMinH} px-7 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.18em] hover:bg-[#E6CFA3] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0`}
                  >
                    <span>Join as a partner</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    {
                      icon: UtensilsCrossed,
                      title: "Caterers",
                      sample: "Annapoorna Caterers",
                      desc: "See live confirmed headcounts per function with exact Veg, Jain, No-Onion-Garlic, and Non-Veg splits — plus one-click CSV sheets.",
                    },
                    {
                      icon: Flower2,
                      title: "Decorators & Venues",
                      sample: "Marigold Decor",
                      desc: "Coordinate courtyard handovers, mandap florals, dress-code palettes, and valet shifts across every function without group-chat chaos.",
                    },
                    {
                      icon: ClipboardList,
                      title: "Planners",
                      sample: "ShaadiCraft Planners",
                      desc: "Broadcast shuttle departures and run-of-show updates in Hindi, Hinglish, Kannada, Tamil & English across multiple season weddings.",
                    },
                  ].map((cardItem) => {
                    const Icon = cardItem.icon;
                    return (
                      <article
                        key={cardItem.title}
                        className="glass-card min-w-0 p-6 sm:p-7 flex flex-col justify-between space-y-5"
                      >
                        <div className="space-y-4">
                          <div className="w-11 h-11 rounded-2xl border border-[#B8925A]/45 bg-[#14050A]/75 flex items-center justify-center text-[#E6CFA3]">
                            <Icon className="w-5 h-5" strokeWidth={1.35} />
                          </div>
                          <div>
                            <h3 className="font-display font-light text-2xl sm:text-3xl text-[#F5EDE1]">
                              {cardItem.title}
                            </h3>
                            <p className="mt-2 text-sm text-[#F5EDE1]/75 leading-relaxed">
                              {cardItem.desc}
                            </p>
                          </div>
                        </div>

                        <div className="pt-4 border-t hairline-gold flex items-center justify-between gap-3 text-xs">
                          <span className="text-[#E6CFA3]/85">{cardItem.sample}</span>
                          <a
                            href="/partner"
                            onClick={(e) => {
                              e.preventDefault();
                              switchWorkspaceView("partner");
                            }}
                            className="inline-flex items-center gap-1 uppercase tracking-[0.14em] text-[#F5EDE1]/85 hover:text-[#E6CFA3] whitespace-nowrap"
                          >
                            <span>Preview</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* 10. #contacts: FOOTER */}
      <footer
        id="contacts"
        className="py-14 sm:py-16 px-4 sm:px-6 lg:px-10 border-t hairline-gold bg-[#14050A]/70 text-[#F5EDE1]"
      >
        <div className="mx-auto max-w-7xl space-y-8">
          {/* Decorative Marigold & Mango-Leaf Toran Strip */}
          {!failedImages["footer-toran"] && (
            <div className="relative rounded-2xl border border-[#B8925A]/35 overflow-hidden bg-[#14050A] h-20 sm:h-24 md:h-28 w-full">
              <picture className="block w-full h-full">
                <source srcSet="/assets/landing/footer-toran.webp" type="image/webp" />
                <img
                  src="/assets/landing/footer-toran.webp"
                  alt="Decorative hand-painted marigold flower and mango-leaf toran garland with brass bells"
                  loading="lazy"
                  onError={() => markImageFailed("footer-toran")}
                  className="w-full h-full object-cover object-center"
                />
              </picture>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#14050A]/65 via-transparent to-[#14050A]/65"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(card?.logistics?.contacts || []).map((c) => (
              <div key={c.role} className="glass-card min-w-0 p-6 space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">{c.role}</p>
                <p className="font-display font-light text-2xl text-[#F5EDE1]">{c.name}</p>
                <p className="text-xs text-[#F5EDE1]/70">{c.note}</p>
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#E6CFA3] hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{c.phone}</span>
                  </a>
                )}
              </div>
            ))}

            <div className="glass-card min-w-0 p-6 flex flex-col justify-between space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                  Official Reference
                </p>
                <p className="mt-1.5 text-sm text-[#F5EDE1]/75">
                  Browse every function, menu counter, and travel note directly from the wedding card.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCardDrawerOpen(true)}
                className="self-start px-4 py-2 rounded-full border border-[#B8925A]/55 text-xs uppercase tracking-[0.16em] text-[#E6CFA3] hover:bg-[#B8925A]/15 whitespace-nowrap"
              >
                Open Wedding Card
              </button>
            </div>
          </div>

          <div className="pt-8 border-t hairline-gold flex flex-wrap items-center justify-between gap-4 text-xs text-[#F5EDE1]/65">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#B8925A]" />
                <span>Built with</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    caps?.sarvam ? "bg-[#8FB39A]" : "bg-[#F5EDE1]/40"
                  }`}
                />
                <span>Sarvam AI</span>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    caps?.flagsmith ? "bg-[#8FB39A]" : "bg-[#F5EDE1]/40"
                  }`}
                />
                <span>Flagsmith</span>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    caps?.nudgebee ? "bg-[#8FB39A]" : "bg-[#F5EDE1]/40"
                  }`}
                />
                <span>NudgeBee</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <a
                href="https://github.com/Nagaraj1399/HaanJi"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#E6CFA3] hover:underline"
              >
                <span>GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span>Fictional demonstration data</span>
            </div>
          </div>
        </div>
      </footer>

      <WeddingCardDrawer
        open={cardDrawerOpen}
        onClose={() => setCardDrawerOpen(false)}
        card={card}
        shopEnabled={shopEnabled}
        shopProducts={shopProducts}
        shopPlacement={shopPlacement}
        onShopClick={trackShopClick}
        onSeeAllShop={openShopTab}
      />

      {isDemoMode && (
        <DemoChecklist
          completed={demoDone}
          onSelectStep={handleSelectDemoStep}
          onResetDemo={handleResetDemo}
        />
      )}
    </div>
  );
}
