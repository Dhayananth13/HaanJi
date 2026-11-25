import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  ExternalLink,
  Flag,
  Flower2,
  Lock,
  MapPin,
  Megaphone,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  PartnerStateResponse,
  PartnerVendor,
  ShopGender,
  ShopProductItem,
  ShopProductType,
  TravelServiceItem,
  VendorBusinessType,
  VendorPlan,
} from "../types/haanji";
import { buildWhatsAppOrderUrl, formatInr } from "./ShopTheLook";
import { buildLocalPickupWhatsAppUrl } from "./TravelPanel";

interface PartnerDashboardProps {
  onOpenGuestPage: () => void;
  onOpenOpsPage?: () => void;
}

const BUSINESS_META: Record<
  VendorBusinessType,
  {
    label: string;
    roleHeadline: string;
    icon: typeof UtensilsCrossed;
    sampleBroadcasts: string[];
  }
> = {
  caterer: {
    label: "Caterer",
    roleHeadline: "Live confirmed plates, Jain & veg counters, and function-wise kitchen prep",
    icon: UtensilsCrossed,
    sampleBroadcasts: [
      "Dedicated Jain chaat and no-onion-garlic counter is now open beside the Banyan Lawn entrance.",
      "Fresh Mysore Pak and filter coffee service starts at 10:30 AM right after the Muhurat.",
    ],
  },
  decorator: {
    label: "Decorator & Venue",
    roleHeadline: "Floral setup windows, dress-code palettes, and courtyard lighting cues",
    icon: Flower2,
    sampleBroadcasts: [
      "The marigold photo pavilion at Heritage Courtyard is ready for family portraits before Sangeet.",
      "Valet drop-off has shifted to the North Archway while the baraat florals are placed.",
    ],
  },
  planner: {
    label: "Wedding Planner",
    roleHeadline: "Run-of-show timing, shuttle dispatch, and multi-wedding coordination",
    icon: ClipboardList,
    sampleBroadcasts: [
      "Complimentary AC shuttles depart The Leela Palace lobby every 15 minutes from 8:45 AM.",
      "Family group portraits begin at 11:00 AM near the Garden Mandap immediately after pheras.",
    ],
  },
  boutique: {
    label: "Attire Boutique",
    roleHeadline: "Curated dress-code outfits, express alterations, and pre-ceremony delivery",
    icon: ShoppingBag,
    sampleBroadcasts: [
      "Express steaming and blouse fitting counter is open at The Leela Palace Wing B until 6:00 PM.",
      "Last-minute yellow Mehendi dupattas and silk stoles are available for same-day hotel delivery.",
    ],
  },
  travel: {
    label: "Travel & Transfers",
    roleHeadline: "Airport pickups, railway station cabs, and AC tempo travellers for wedding families",
    icon: Car,
    sampleBroadcasts: [
      "Chauffeurs holding 'Sharma & Reddy Wedding' placards are stationed outside BLR Terminal 1 Arrival Gate 4.",
      "12-seater AC Tempo Traveller from KSR Bengaluru (SBC) to Tamarind Tree departs at 11:30 AM.",
    ],
  },
};

const PRODUCT_IMAGE_PRESETS = [
  { label: "Mehendi Mustard Anarkali", url: "/assets/shop/mehendi-anarkali.webp" },
  { label: "Mehendi Yellow Kurta", url: "/assets/shop/mehendi-kurta.webp" },
  { label: "Sangeet Champagne Gown", url: "/assets/shop/sangeet-gown.webp" },
  { label: "Sangeet Emerald Bandhgala", url: "/assets/shop/sangeet-bandhgala.webp" },
  { label: "Shaadi Crimson Kanjeevaram", url: "/assets/shop/shaadi-kanjeevaram.webp" },
  { label: "Shaadi Ivory Kurta-Dhoti", url: "/assets/shop/shaadi-kurta-dhoti.webp" },
  { label: "Reception Wine Gown", url: "/assets/shop/reception-gown.webp" },
  { label: "Reception Black-Tie Bandhgala", url: "/assets/shop/reception-tuxedo.webp" },
];

const FUNCTION_CHOICES = [
  { id: "mehendi", label: "Mehendi" },
  { id: "sangeet", label: "Sangeet" },
  { id: "shaadi", label: "Shaadi" },
  { id: "reception", label: "Reception" },
] as const;

interface ProductFormState {
  name: string;
  image: string;
  price_inr: string;
  type: ShopProductType;
  function_ids: string[];
  colour_tags: string;
  gender: ShopGender;
  buy_url: string;
  whatsapp_number: string;
  delivers_by: string;
}

const EMPTY_PRODUCT_FORM: ProductFormState = {
  name: "",
  image: "/assets/shop/mehendi-anarkali.webp",
  price_inr: "6500",
  type: "buy",
  function_ids: ["mehendi"],
  colour_tags: "yellow, mustard, floral",
  gender: "women",
  buy_url: "https://partner.example.in/looks/custom-outfit",
  whatsapp_number: "919845011221",
  delivers_by: "26 Nov 2026",
};

interface TravelServiceFormState {
  name: string;
  vehicle: string;
  seats: string;
  price_inr: string;
  pickup_points: string;
  whatsapp_number: string;
}

const EMPTY_TRAVEL_SERVICE_FORM: TravelServiceFormState = {
  name: "",
  vehicle: "Toyota Innova Crysta (AC)",
  seats: "6",
  price_inr: "2200",
  pickup_points:
    "Kempegowda International Airport (BLR), KSR Bengaluru City Junction (SBC)",
  whatsapp_number: "919845077881",
};

const STORAGE_KEY = "haanji_partner_vendor_id";

function ProBadge({ flagKey }: { flagKey: string }) {
  return (
    <span
      title={`Controlled by Flagsmith flag: ${flagKey}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#E6CFA3]/55 bg-[#B8925A]/20 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E6CFA3] whitespace-nowrap shrink-0"
    >
      <Lock className="w-3 h-3" />
      <span>Pro</span>
    </span>
  );
}

export function PartnerDashboard({ onOpenGuestPage, onOpenOpsPage }: PartnerDashboardProps) {
  const [vendors, setVendors] = useState<PartnerVendor[]>([]);
  const [weddingId, setWeddingId] = useState<string>("w_demo");
  const [weddingTitle, setWeddingTitle] = useState<string>("Sharma & Reddy Wedding");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  const [state, setState] = useState<PartnerStateResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingState, setLoadingState] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastFeedback, setBroadcastFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [partnerTab, setPartnerTab] = useState<"overview" | "products" | "travel">("overview");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [productSaving, setProductSaving] = useState(false);
  const [productFeedback, setProductFeedback] = useState<string | null>(null);
  const [editingTravelId, setEditingTravelId] = useState<string | null>(null);
  const [travelForm, setTravelForm] = useState<TravelServiceFormState>(
    EMPTY_TRAVEL_SERVICE_FORM
  );
  const [travelSaving, setTravelSaving] = useState(false);
  const [travelFeedback, setTravelFeedback] = useState<string | null>(null);

  const loadVendors = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/partner/vendors");
      if (!res.ok) throw new Error("Could not load partner businesses");
      const data = (await res.json()) as {
        wedding_id: string;
        wedding_title: string;
        vendors: PartnerVendor[];
      };
      setVendors(data.vendors || []);
      if (data.wedding_id) setWeddingId(data.wedding_id);
      if (data.wedding_title) setWeddingTitle(data.wedding_title);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load partners");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadPartnerState = useCallback(async (vendorId: string, silent = false) => {
    if (!silent) setLoadingState(true);
    try {
      const res = await fetch(`/api/partner/state?vendorId=${encodeURIComponent(vendorId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setSelectedVendorId(null);
          window.sessionStorage.removeItem(STORAGE_KEY);
          return;
        }
        throw new Error("Could not load partner workspace");
      }
      const data = (await res.json()) as PartnerStateResponse;
      setState(data);
      setErrorMsg(null);
    } catch (err) {
      if (!silent) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load partner state");
      }
    } finally {
      if (!silent) setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    if (!selectedVendorId) {
      setState(null);
      return;
    }
    void loadPartnerState(selectedVendorId);
    const timer = window.setInterval(() => {
      void loadPartnerState(selectedVendorId, true);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [selectedVendorId, loadPartnerState]);

  const handleSelectVendor = (vendorId: string) => {
    setBroadcastFeedback(null);
    setBroadcastText("");
    setErrorMsg(null);
    const chosen = vendors.find((v) => v.id === vendorId);
    setPartnerTab(chosen?.business_type === "travel" ? "travel" : "overview");
    setSelectedVendorId(vendorId);
    window.sessionStorage.setItem(STORAGE_KEY, vendorId);
  };

  const handleSignOut = () => {
    setSelectedVendorId(null);
    setState(null);
    setBroadcastFeedback(null);
    setErrorMsg(null);
    window.sessionStorage.removeItem(STORAGE_KEY);
    void loadVendors();
  };

  const handlePlanSwitch = async (nextPlan: VendorPlan) => {
    if (!state || switchingPlan || state.vendor.plan === nextPlan) return;
    setSwitchingPlan(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/partner/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: state.vendor.id, plan: nextPlan }),
      });
      const data = (await res.json()) as PartnerStateResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not switch plan");
      setState({
        vendor: data.vendor,
        flag_evaluation: data.flag_evaluation,
        caterer: data.caterer,
        card: data.card,
        announcements: data.announcements,
        weddings: data.weddings,
        shop_featured_slot: Boolean(data.shop_featured_slot),
        products: data.products || [],
      });
      setVendors((prev) =>
        prev.map((v) => (v.id === data.vendor.id ? { ...v, plan: data.vendor.plan } : v))
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to switch plan");
    } finally {
      setSwitchingPlan(false);
    }
  };

  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state || !broadcastText.trim() || broadcastBusy) return;
    setBroadcastBusy(true);
    setBroadcastFeedback(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/partner/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: state.vendor.id,
          text: broadcastText.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        announcements?: PartnerStateResponse["announcements"];
      };
      if (!res.ok) throw new Error(data.error || "Could not send broadcast");
      setBroadcastText("");
      setBroadcastFeedback(
        "Translated into Hindi, Hinglish, Kannada, Tamil & English and published live to the Guest page."
      );
      if (data.announcements) {
        setState((prev) => (prev ? { ...prev, announcements: data.announcements! } : prev));
      } else {
        void loadPartnerState(state.vendor.id, true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setBroadcastBusy(false);
    }
  };

  const startEditProduct = (product: ShopProductItem) => {
    setEditingProductId(product.id);
    setProductFeedback(null);
    setErrorMsg(null);
    setProductForm({
      name: product.name,
      image: product.image,
      price_inr: String(product.price_inr),
      type: product.type,
      function_ids: [...product.function_ids],
      colour_tags: product.colour_tags.join(", "),
      gender: product.gender,
      buy_url: product.buy_url,
      whatsapp_number: product.whatsapp_number,
      delivers_by: product.delivers_by,
    });
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
    setProductFeedback(null);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state || productSaving) return;
    setProductSaving(true);
    setProductFeedback(null);
    setErrorMsg(null);
    try {
      const payload = {
        vendorId: state.vendor.id,
        name: productForm.name.trim(),
        image: productForm.image.trim(),
        price_inr: Number(productForm.price_inr),
        type: productForm.type,
        function_ids: productForm.function_ids,
        colour_tags: productForm.colour_tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        gender: productForm.gender,
        buy_url: productForm.buy_url.trim(),
        whatsapp_number: productForm.whatsapp_number.trim(),
        delivers_by: productForm.delivers_by.trim(),
      };
      const url = editingProductId
        ? `/api/partner/products/${encodeURIComponent(editingProductId)}`
        : "/api/partner/products";
      const res = await fetch(url, {
        method: editingProductId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        products?: ShopProductItem[];
      };
      if (!res.ok) throw new Error(data.error || "Could not save product");
      if (data.products) {
        setState((prev) => (prev ? { ...prev, products: data.products! } : prev));
      } else {
        void loadPartnerState(state.vendor.id, true);
      }
      setProductFeedback(
        editingProductId
          ? "Product updated and synced live to Shop the look."
          : "Product published and matched to the selected dress codes."
      );
      setEditingProductId(null);
      setProductForm(EMPTY_PRODUCT_FORM);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setProductSaving(false);
    }
  };

  const startEditTravelService = (svc: TravelServiceItem) => {
    setEditingTravelId(svc.id);
    setTravelFeedback(null);
    setErrorMsg(null);
    setTravelForm({
      name: svc.name,
      vehicle: svc.vehicle,
      seats: String(svc.seats),
      price_inr: String(svc.price_inr),
      pickup_points: svc.pickup_points.join(", "),
      whatsapp_number: svc.whatsapp_number,
    });
  };

  const resetTravelServiceForm = () => {
    setEditingTravelId(null);
    setTravelForm(EMPTY_TRAVEL_SERVICE_FORM);
    setTravelFeedback(null);
  };

  const handleSaveTravelService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state || travelSaving) return;
    setTravelSaving(true);
    setTravelFeedback(null);
    setErrorMsg(null);
    try {
      const payload = {
        vendorId: state.vendor.id,
        name: travelForm.name.trim(),
        vehicle: travelForm.vehicle.trim(),
        seats: Number(travelForm.seats),
        price_inr: Number(travelForm.price_inr),
        pickup_points: travelForm.pickup_points
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        whatsapp_number: travelForm.whatsapp_number.trim(),
      };
      const url = editingTravelId
        ? `/api/partner/travel-services/${encodeURIComponent(editingTravelId)}`
        : "/api/partner/travel-services";
      const res = await fetch(url, {
        method: editingTravelId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        services?: TravelServiceItem[];
      };
      if (!res.ok) throw new Error(data.error || "Could not save travel service");
      if (data.services) {
        setState((prev) => (prev ? { ...prev, travel_services: data.services! } : prev));
      } else {
        void loadPartnerState(state.vendor.id, true);
      }
      setTravelFeedback(
        editingTravelId
          ? "Pickup service updated and synced live to Local Pickup."
          : "Pickup service published and visible under Local Pickup when travel is enabled."
      );
      setEditingTravelId(null);
      setTravelForm(EMPTY_TRAVEL_SERVICE_FORM);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save travel service");
    } finally {
      setTravelSaving(false);
    }
  };

  // PARTNER LOGIN VIEW
  if (!selectedVendorId) {
    return (
      <section className="mx-auto max-w-6xl w-full px-4 sm:px-6 lg:px-10 py-12 sm:py-16 space-y-10">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#B8925A]/50 bg-[#14050A]/65 text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
            <Building2 className="w-3.5 h-3.5" />
            <span>HaanJi for Business · Partner Portal</span>
          </div>
          <h1 className="font-display font-light text-4xl sm:text-5xl lg:text-6xl leading-[1.06] text-[#F5EDE1]">
            Choose a wedding partner desk
          </h1>
          <p className="text-sm sm:text-base text-[#F5EDE1]/75 leading-relaxed max-w-2xl">
            Sign in as a demo wedding vendor linked to{" "}
            <span className="text-[#E6CFA3] font-medium">{weddingTitle}</span>{" "}
            <span className="font-mono text-xs text-[#E6CFA3]/80">({weddingId})</span>. Feature
            access is evaluated live per vendor identity via Flagsmith traits{" "}
            <span className="font-mono text-xs text-[#E6CFA3]/85">business_type</span> and{" "}
            <span className="font-mono text-xs text-[#E6CFA3]/85">plan</span>.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-[#C98A8A]/45 bg-[#2B0A12]/80 px-4 py-3 text-sm text-[#F5EDE1]">
            {errorMsg}
          </div>
        )}

        {loadingList ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="glass-card p-6 h-64 animate-pulse bg-[#2B0A12]/35" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vendors.map((vendor) => {
              const meta = BUSINESS_META[vendor.business_type];
              const Icon = meta.icon;
              return (
                <button
                  key={vendor.id}
                  type="button"
                  onClick={() => handleSelectVendor(vendor.id)}
                  className="group text-left glass-card min-w-0 p-6 sm:p-7 flex flex-col justify-between gap-6 hover:border-[#E6CFA3]/65 hover:bg-[#2B0A12]/55 transition-colors"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-11 h-11 rounded-2xl border border-[#B8925A]/45 bg-[#14050A]/75 flex items-center justify-center text-[#E6CFA3] shrink-0">
                        <Icon className="w-5 h-5" strokeWidth={1.4} />
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-[0.18em] whitespace-nowrap ${
                          vendor.plan === "pro"
                            ? "border-[#E6CFA3]/55 bg-[#B8925A]/20 text-[#E6CFA3]"
                            : "border-[#B8925A]/30 bg-[#14050A]/70 text-[#F5EDE1]/75"
                        }`}
                      >
                        {vendor.plan === "pro" ? "Pro Plan" : "Free Plan"}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                        {meta.label}
                      </p>
                      <h2 className="font-display font-light text-3xl text-[#F5EDE1] group-hover:text-[#E6CFA3] transition-colors">
                        {vendor.name}
                      </h2>
                      <p className="text-xs text-[#F5EDE1]/70 leading-relaxed">{vendor.tagline}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t hairline-gold space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#F5EDE1]/70">
                      <span>{vendor.contact_name}</span>
                      <span className="font-mono text-[11px] text-[#E6CFA3]/85">
                        {vendor.wedding_ids.join(", ")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[#E6CFA3]">
                      <span>Open partner desk</span>
                      <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="glass-card p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
              Live Flagsmith Gating
            </p>
            <p className="text-sm text-[#F5EDE1]/80">
              Try signing in as <strong className="text-[#F5EDE1]">Marigold Decor (Free)</strong>{" "}
              to see Pro-gated badges driven by Flagsmith, then flip the plan switcher live to Pro.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenGuestPage}
              className="min-h-[44px] px-5 rounded-full border border-[#B8925A]/55 text-xs uppercase tracking-[0.16em] text-[#F5EDE1] hover:bg-[#B8925A]/15 whitespace-nowrap"
            >
              Back to Guest Page
            </button>
            {onOpenOpsPage && (
              <button
                type="button"
                onClick={onOpenOpsPage}
                className="min-h-[44px] px-5 rounded-full border border-[#B8925A]/35 text-xs uppercase tracking-[0.16em] text-[#E6CFA3] hover:bg-[#B8925A]/10 whitespace-nowrap"
              >
                Inspect Ops Flag Catalog
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // LOADING SELECTED PARTNER
  if (loadingState && !state) {
    return (
      <section className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-10 py-16 text-center space-y-4">
        <RefreshCw className="w-6 h-6 text-[#E6CFA3] animate-spin mx-auto" />
        <p className="font-display text-2xl font-light text-[#F5EDE1]">
          Evaluating Flagsmith partner flags...
        </p>
      </section>
    );
  }

  if (!state) return null;

  const { vendor, flag_evaluation, caterer, card, announcements, weddings } = state;
  const { flags, monthly_question_limit } = flag_evaluation;
  const meta = BUSINESS_META[vendor.business_type];
  const RoleIcon = meta.icon;

  const quotaPct =
    monthly_question_limit > 0
      ? Math.min(100, Math.round((vendor.questions_used_month / monthly_question_limit) * 100))
      : 0;

  const flagEntries: Array<{ key: keyof typeof flags; label: string; enabled: boolean }> = [
    { key: "b2b_partner_portal", label: "Partner Portal", enabled: flags.b2b_partner_portal },
    { key: "b2b_live_headcount", label: "Live Headcount", enabled: flags.b2b_live_headcount },
    { key: "b2b_csv_export", label: "CSV Export", enabled: flags.b2b_csv_export },
    {
      key: "b2b_vendor_broadcast",
      label: "Vendor Broadcast",
      enabled: flags.b2b_vendor_broadcast,
    },
    { key: "b2b_multi_wedding", label: "Multi-Wedding", enabled: flags.b2b_multi_wedding },
  ];

  const orderedFunctions = card.functions || [];

  return (
    <section className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-10 py-10 sm:py-12 space-y-8">
      {/* Top Partner Header & Flagsmith Plan Switcher */}
      <div className="glass-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#B8925A]/40 text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3] hover:bg-[#B8925A]/15"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Switch business</span>
              </button>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#B8925A]/35 bg-[#14050A]/70 text-[11px] uppercase tracking-[0.16em] text-[#F5EDE1]/85">
                <RoleIcon className="w-3.5 h-3.5 text-[#E6CFA3]" />
                <span>{meta.label}</span>
              </span>
              <span className="font-mono text-[11px] text-[#E6CFA3]/80">
                {card.wedding.title} · {card.wedding.id}
              </span>
            </div>

            <div>
              <h1 className="font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
                {vendor.name}
              </h1>
              <p className="mt-1.5 text-sm text-[#F5EDE1]/75 max-w-2xl">
                {meta.roleHeadline} — {vendor.contact_name}, {vendor.city}.
              </p>
            </div>
          </div>

          {/* Plan Switcher (via Flagsmith) */}
          <div className="rounded-2xl border border-[#B8925A]/45 bg-[#14050A]/75 p-4 sm:p-5 space-y-3 shrink-0 lg:min-w-[300px]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-[#E6CFA3]" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                  Plan switcher (via Flagsmith)
                </span>
              </div>
              {switchingPlan && <RefreshCw className="w-3.5 h-3.5 text-[#E6CFA3] animate-spin" />}
            </div>

            <div
              role="group"
              aria-label="Plan switcher via Flagsmith"
              className="grid grid-cols-2 gap-1.5 p-1 rounded-full border border-[#B8925A]/35 bg-[#14050A]"
            >
              {(["free", "pro"] as const).map((tier) => {
                const active = vendor.plan === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    disabled={switchingPlan}
                    aria-pressed={active}
                    onClick={() => handlePlanSwitch(tier)}
                    className={`min-h-[40px] rounded-full text-xs uppercase tracking-[0.18em] transition-colors ${
                      active
                        ? "bg-[#F5EDE1] text-[#14050A] font-semibold"
                        : "text-[#F5EDE1]/75 hover:text-[#F5EDE1]"
                    }`}
                  >
                    {tier === "free" ? "Free" : "Pro"}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-[#F5EDE1]/65 leading-relaxed">
              Evaluates <span className="font-mono text-[#E6CFA3]/90">{flag_evaluation.identity}</span>{" "}
              with trait <span className="font-mono text-[#E6CFA3]/90">plan={vendor.plan}</span> ·{" "}
              <span>{flag_evaluation.source}</span>
            </p>
          </div>
        </div>

        {/* Evaluated B2B Flags + Monthly Question Limit (b2b_limits) */}
        <div className="pt-5 border-t hairline-gold grid grid-cols-1 xl:grid-cols-12 gap-5 items-center">
          <div className="xl:col-span-8 flex flex-wrap items-center gap-2 min-w-0">
            {flagEntries.map((item) => (
              <span
                key={item.key}
                title={`${item.key}: ${item.enabled ? "enabled" : "disabled"}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-mono ${
                  item.enabled
                    ? "border-[#8FB39A]/45 bg-[#8FB39A]/10 text-[#8FB39A]"
                    : "border-[#B8925A]/30 bg-[#14050A]/75 text-[#F5EDE1]/60"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    item.enabled ? "bg-[#8FB39A]" : "bg-[#F5EDE1]/35"
                  }`}
                />
                <span>{item.key}</span>
              </span>
            ))}
          </div>

          <div className="xl:col-span-4 space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                Monthly Q&amp;A quota (b2b_limits)
              </span>
              <span className="font-mono tabular-nums text-[#F5EDE1]">
                {vendor.questions_used_month.toLocaleString()} /{" "}
                {monthly_question_limit.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#14050A] border border-[#B8925A]/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#B8925A] to-[#E6CFA3] transition-all duration-300"
                style={{ width: `${Math.max(4, quotaPct)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-[#C98A8A]/45 bg-[#2B0A12]/80 px-4 py-3 text-sm text-[#F5EDE1]">
          {errorMsg}
        </div>
      )}

      {/* Partner Sub-Navigation: Overview vs My products vs Travel services */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b hairline-gold pb-4">
        <div role="tablist" aria-label="Partner workspace views" className="flex flex-wrap gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={partnerTab === "overview"}
            onClick={() => setPartnerTab("overview")}
            className={`min-h-[42px] px-5 rounded-full border text-xs uppercase tracking-[0.16em] transition-colors ${
              partnerTab === "overview"
                ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                : "border-[#B8925A]/40 bg-[#14050A]/60 text-[#F5EDE1]/85 hover:border-[#E6CFA3]"
            }`}
          >
            Overview
          </button>

          {vendor.business_type === "travel" ? (
            <button
              type="button"
              role="tab"
              aria-selected={partnerTab === "travel"}
              onClick={() => setPartnerTab("travel")}
              className={`min-h-[42px] px-5 rounded-full border text-xs uppercase tracking-[0.16em] inline-flex items-center gap-2 transition-colors ${
                partnerTab === "travel"
                  ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                  : "border-[#B8925A]/40 bg-[#14050A]/60 text-[#F5EDE1]/85 hover:border-[#E6CFA3]"
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Local pickup services ({(state.travel_services || []).length})</span>
            </button>
          ) : (
            <button
              type="button"
              role="tab"
              aria-selected={partnerTab === "products"}
              onClick={() => setPartnerTab("products")}
              className={`min-h-[42px] px-5 rounded-full border text-xs uppercase tracking-[0.16em] inline-flex items-center gap-2 transition-colors ${
                partnerTab === "products"
                  ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                  : "border-[#B8925A]/40 bg-[#14050A]/60 text-[#F5EDE1]/85 hover:border-[#E6CFA3]"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>My products ({(state.products || []).length})</span>
            </button>
          )}
        </div>

        <span className="text-xs text-[#F5EDE1]/65">
          {vendor.business_type === "travel"
            ? state.travel_featured_vendor && vendor.plan === "pro"
              ? "Featured vendor ON · Your vehicles rank first under Local Pickup"
              : vendor.plan === "free"
                ? "Switch to Pro above to rank first under Local Pickup (travel_featured_vendor)"
                : "Services sync live to the guest Travel panel"
            : state.shop_featured_slot && vendor.plan === "pro"
              ? "Featured slot ON · Your looks rank first in Shop the look"
              : vendor.plan === "free"
                ? "Switch to Pro above to rank first in Shop the look (shop_featured_slot)"
                : "Products sync live to Shop the look"}
        </span>
      </div>

      {partnerTab === "travel" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Add / Edit Local Pickup Service Form */}
          <div className="lg:col-span-5 glass-card p-6 sm:p-7 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                  {editingTravelId ? "Edit Pickup Service" : "Add Pickup Service"}
                </p>
                <h2 className="mt-1 font-display font-light text-3xl text-[#F5EDE1]">
                  {editingTravelId ? "Update vehicle listing" : "List a local pickup"}
                </h2>
              </div>
              {editingTravelId && (
                <button
                  type="button"
                  onClick={resetTravelServiceForm}
                  className="px-3 py-1.5 rounded-full border border-[#B8925A]/45 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] hover:bg-[#B8925A]/15"
                >
                  Cancel edit
                </button>
              )}
            </div>

            {travelFeedback && (
              <p className="text-xs text-[#8FB39A] flex items-start gap-2 rounded-xl border border-[#8FB39A]/35 bg-[#14050A]/70 px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{travelFeedback}</span>
              </p>
            )}

            <form onSubmit={handleSaveTravelService} className="space-y-4 text-xs">
              <label className="block space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Service name</span>
                <input
                  type="text"
                  required
                  value={travelForm.name}
                  onChange={(e) => setTravelForm({ ...travelForm, name: e.target.value })}
                  placeholder="e.g., BLR Airport Meet & Greet Transfer"
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3.5 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Vehicle model</span>
                <input
                  type="text"
                  required
                  value={travelForm.vehicle}
                  onChange={(e) => setTravelForm({ ...travelForm, vehicle: e.target.value })}
                  placeholder="e.g., Toyota Innova Crysta (AC) or 12-Seater Tempo Traveller"
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3.5 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Seats</span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={60}
                    value={travelForm.seats}
                    onChange={(e) => setTravelForm({ ...travelForm, seats: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm font-mono tabular-nums text-[#F5EDE1]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Price (₹)</span>
                  <input
                    type="number"
                    required
                    min={100}
                    value={travelForm.price_inr}
                    onChange={(e) => setTravelForm({ ...travelForm, price_inr: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm font-mono tabular-nums text-[#F5EDE1]"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">
                  Pickup points (comma-separated)
                </span>
                <textarea
                  rows={2}
                  required
                  value={travelForm.pickup_points}
                  onChange={(e) =>
                    setTravelForm({ ...travelForm, pickup_points: e.target.value })
                  }
                  placeholder="Kempegowda International Airport (BLR), KSR Bengaluru City Junction (SBC)"
                  className="w-full rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 p-3 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">
                  WhatsApp number (with country code)
                </span>
                <input
                  type="text"
                  required
                  value={travelForm.whatsapp_number}
                  onChange={(e) =>
                    setTravelForm({ ...travelForm, whatsapp_number: e.target.value })
                  }
                  placeholder="919845077881"
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3.5 font-mono text-xs text-[#F5EDE1]"
                />
              </label>

              <button
                type="submit"
                disabled={travelSaving}
                className="w-full min-h-[46px] rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3] disabled:opacity-45 inline-flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {travelSaving
                    ? "Saving..."
                    : editingTravelId
                      ? "Save Service Changes"
                      : "Publish Local Pickup"}
                </span>
              </button>
            </form>
          </div>

          {/* RIGHT: Listed Travel Services */}
          <div className="lg:col-span-7 glass-card p-6 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                  Active Fleet Listings
                </p>
                <h2 className="mt-1 font-display font-light text-3xl text-[#F5EDE1]">
                  Local pickup services ({(state.travel_services || []).length})
                </h2>
              </div>
              {vendor.plan === "pro" && state.travel_featured_vendor && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#E6CFA3]/55 bg-[#B8925A]/20 text-[10px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                  <Sparkles className="w-3 h-3" />
                  <span>Featured Travel Vendor Active</span>
                </span>
              )}
            </div>

            {!state.travel_services || state.travel_services.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#B8925A]/35 bg-[#14050A]/60 p-8 text-center space-y-2">
                <p className="font-display text-2xl font-light text-[#F5EDE1]">
                  No local pickup services listed yet
                </p>
                <p className="text-xs text-[#F5EDE1]/70">
                  Add your first cab or tempo-traveller service using the form on the left.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {state.travel_services.map((svc) => (
                  <div
                    key={svc.id}
                    className="rounded-2xl border border-[#B8925A]/30 bg-[#14050A]/70 p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-2xl font-light text-[#F5EDE1]">
                          {svc.name}
                        </h3>
                        <p className="text-xs text-[#F5EDE1]/75">
                          {svc.vehicle} · <span className="font-mono">{svc.seats} seats</span>
                        </p>
                      </div>
                      <span className="font-mono text-base font-semibold tabular-nums text-[#E6CFA3]">
                        {formatInr(svc.price_inr)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {svc.pickup_points.map((pt) => (
                        <span
                          key={pt}
                          className="px-2.5 py-0.5 rounded-md border border-[#B8925A]/25 bg-[#2B0A12]/40 text-[11px] text-[#F5EDE1]/80"
                        >
                          {pt}
                        </span>
                      ))}
                    </div>

                    <div className="pt-2 border-t hairline-gold flex flex-wrap items-center justify-between gap-2 text-xs">
                      <a
                        href={buildLocalPickupWhatsAppUrl(svc, {
                          guestName: "Sample Guest",
                          arrivalPoint: svc.pickup_points[0] || "BLR Airport",
                          arrivalTime: "27 Nov, 4:00 PM",
                          weddingTitle: card.wedding.title,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[#8FB39A] hover:underline"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Preview WhatsApp ({svc.whatsapp_number})</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => startEditTravelService(svc)}
                        className="min-h-[34px] px-3.5 rounded-full border border-[#B8925A]/50 text-[11px] uppercase tracking-[0.14em] text-[#F5EDE1] hover:bg-[#B8925A]/15 inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : partnerTab === "products" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Add / Edit Product Form */}
          <div className="lg:col-span-5 glass-card p-6 sm:p-7 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                  {editingProductId ? "Edit Product" : "Add Product"}
                </p>
                <h2 className="mt-1 font-display font-light text-3xl text-[#F5EDE1]">
                  {editingProductId ? "Update look listing" : "List a wedding look"}
                </h2>
              </div>
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="px-3 py-1.5 rounded-full border border-[#B8925A]/45 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] hover:bg-[#B8925A]/15"
                >
                  Cancel edit
                </button>
              )}
            </div>

            {productFeedback && (
              <p className="text-xs text-[#8FB39A] flex items-start gap-2 rounded-xl border border-[#8FB39A]/35 bg-[#14050A]/70 px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{productFeedback}</span>
              </p>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <label className="block space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Product name</span>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="e.g., Mustard Silk Gota-Patti Anarkali"
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3.5 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                />
              </label>

              <div className="space-y-1.5">
                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Image URL or Preset</span>
                  <input
                    type="text"
                    required
                    value={productForm.image}
                    onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                    placeholder="/assets/shop/mehendi-anarkali.webp"
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3.5 font-mono text-xs text-[#F5EDE1]"
                  />
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRODUCT_IMAGE_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setProductForm({ ...productForm, image: preset.url })}
                      className={`px-2.5 py-1 rounded-md border text-[10px] transition-colors ${
                        productForm.image === preset.url
                          ? "border-[#E6CFA3] bg-[#B8925A]/25 text-[#E6CFA3]"
                          : "border-[#B8925A]/25 text-[#F5EDE1]/70 hover:text-[#F5EDE1]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Price (₹)</span>
                  <input
                    type="number"
                    required
                    min={100}
                    value={productForm.price_inr}
                    onChange={(e) => setProductForm({ ...productForm, price_inr: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm font-mono tabular-nums text-[#F5EDE1]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Type</span>
                  <select
                    value={productForm.type}
                    onChange={(e) =>
                      setProductForm({ ...productForm, type: e.target.value as ShopProductType })
                    }
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                  >
                    <option value="buy">Buy</option>
                    <option value="rent">Rent</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Gender</span>
                  <select
                    value={productForm.gender}
                    onChange={(e) =>
                      setProductForm({ ...productForm, gender: e.target.value as ShopGender })
                    }
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                  >
                    <option value="women">Women</option>
                    <option value="men">Men</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </label>
              </div>

              <div className="space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3] block">
                  Matched wedding functions
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FUNCTION_CHOICES.map((fn) => {
                    const checked = productForm.function_ids.includes(fn.id);
                    return (
                      <button
                        key={fn.id}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? productForm.function_ids.filter((id) => id !== fn.id)
                            : [...productForm.function_ids, fn.id];
                          if (next.length > 0) {
                            setProductForm({ ...productForm, function_ids: next });
                          }
                        }}
                        className={`min-h-[38px] rounded-lg border text-xs transition-colors ${
                          checked
                            ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                            : "border-[#B8925A]/35 bg-[#14050A]/70 text-[#F5EDE1]/80"
                        }`}
                      >
                        {fn.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Colour tags</span>
                  <input
                    type="text"
                    value={productForm.colour_tags}
                    onChange={(e) => setProductForm({ ...productForm, colour_tags: e.target.value })}
                    placeholder="yellow, mustard, floral"
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">Delivers before</span>
                  <input
                    type="text"
                    required
                    value={productForm.delivers_by}
                    onChange={(e) => setProductForm({ ...productForm, delivers_by: e.target.value })}
                    placeholder="26 Nov 2026"
                    className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">External Buy / Rent URL</span>
                <input
                  type="url"
                  required
                  value={productForm.buy_url}
                  onChange={(e) => setProductForm({ ...productForm, buy_url: e.target.value })}
                  placeholder="https://store.example.in/product"
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-sm text-[#F5EDE1]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">
                  WhatsApp order number (with country code)
                </span>
                <input
                  type="text"
                  required
                  value={productForm.whatsapp_number}
                  onChange={(e) =>
                    setProductForm({ ...productForm, whatsapp_number: e.target.value })
                  }
                  placeholder="919845011221"
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 font-mono text-sm text-[#F5EDE1]"
                />
              </label>

              <button
                type="submit"
                disabled={productSaving}
                className="w-full min-h-[46px] rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3] disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {productSaving
                    ? "Saving..."
                    : editingProductId
                      ? "Save Product Changes"
                      : "Add Product to Wedding Shop"}
                </span>
              </button>
            </form>
          </div>

          {/* RIGHT: Partner's Existing Products */}
          <div className="lg:col-span-7 glass-card p-6 sm:p-7 space-y-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                  My Products · {card.wedding.title}
                </p>
                <h2 className="mt-1 font-display font-light text-3xl text-[#F5EDE1]">
                  Published looks ({(state.products || []).length})
                </h2>
              </div>
              {vendor.plan === "pro" && state.shop_featured_slot && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#E6CFA3]/55 bg-[#B8925A]/20 text-[10px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                  <Sparkles className="w-3 h-3" />
                  <span>Featured Partner Slot Active</span>
                </span>
              )}
            </div>

            {(!state.products || state.products.length === 0) ? (
              <div className="rounded-2xl border border-dashed border-[#B8925A]/35 bg-[#14050A]/60 p-8 text-center space-y-2">
                <p className="font-display text-2xl font-light text-[#F5EDE1]">
                  No products listed yet for {vendor.name}
                </p>
                <p className="text-xs text-[#F5EDE1]/70">
                  Add your first wedding outfit using the form on the left. It will immediately appear under matching dress codes when the host enables Shop the look.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {state.products.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-2xl border border-[#B8925A]/30 bg-[#14050A]/70 p-4 flex flex-col sm:flex-row gap-4 min-w-0"
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full sm:w-32 h-36 sm:h-28 rounded-xl object-cover object-top border border-[#B8925A]/30 bg-[#2B0A12] shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-display text-xl font-light text-[#F5EDE1] leading-snug">
                            {product.name}
                          </h3>
                          <p className="text-xs text-[#F5EDE1]/70 capitalize">
                            {product.function_ids.join(" · ")} · {product.type} · {product.gender}
                          </p>
                        </div>
                        <span className="font-mono text-base font-semibold tabular-nums text-[#E6CFA3] shrink-0">
                          {formatInr(product.price_inr)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#F5EDE1]/70">
                        <span className="inline-flex items-center gap-1 text-[#8FB39A]">
                          <Truck className="w-3.5 h-3.5" />
                          <span>Delivers before {product.delivers_by}</span>
                        </span>
                        {product.colour_tags.length > 0 && (
                          <span className="text-[#F5EDE1]/60 capitalize">
                            Tags: {product.colour_tags.join(", ")}
                          </span>
                        )}
                      </div>

                      <div className="pt-2 border-t hairline-gold flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          <a
                            href={product.buy_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#E6CFA3] hover:underline"
                          >
                            <span>Store link</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={buildWhatsAppOrderUrl(product, card.wedding.title)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#E6CFA3] hover:underline"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        </div>

                        <button
                          type="button"
                          onClick={() => startEditProduct(product)}
                          className="min-h-[34px] px-3.5 rounded-full border border-[#B8925A]/50 text-[11px] uppercase tracking-[0.14em] text-[#F5EDE1] hover:bg-[#B8925A]/15 inline-flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MAIN GRID: Live Confirmed Headcount + Vendor Broadcast */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): Live Confirmed Headcount & CSV Export */}
        <div className="lg:col-span-7 space-y-6 min-w-0">
          <div className="glass-card p-6 sm:p-7 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                    Live Confirmed Headcount &amp; Dietary Split
                  </p>
                  {!flags.b2b_live_headcount && <ProBadge flagKey="b2b_live_headcount" />}
                </div>
                <h2 className="font-display font-light text-3xl text-[#F5EDE1]">
                  {vendor.business_type === "caterer"
                    ? "Kitchen & plate counts by function"
                    : "Confirmed guest counts by function"}
                </h2>
              </div>

              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8FB39A] whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Guest-confirmed RSVPs only</span>
              </span>
            </div>

            {flags.b2b_live_headcount && caterer ? (
              <>
                {/* Top KPI Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-[#B8925A]/30 bg-[#14050A]/65 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                      Confirmed Parties
                    </p>
                    <p className="mt-1 font-display text-3xl font-light text-[#F5EDE1] tabular-nums">
                      {caterer.confirmed_parties}
                    </p>
                    <p className="text-[11px] text-[#F5EDE1]/60">
                      Declined: {caterer.declined_parties}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#B8925A]/30 bg-[#14050A]/65 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                      Peak Function Plates
                    </p>
                    <p className="mt-1 font-display text-3xl font-light text-[#F5EDE1] tabular-nums">
                      {Math.max(
                        0,
                        ...Object.values(caterer.by_function).map((f) => f.confirmed_headcount)
                      )}
                    </p>
                    <p className="text-[11px] text-[#F5EDE1]/60">Confirmed guests</p>
                  </div>
                  <div className="rounded-xl border border-[#B8925A]/30 bg-[#14050A]/65 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                      Hotel Rooms Needed
                    </p>
                    <p className="mt-1 font-display text-3xl font-light text-[#F5EDE1] tabular-nums">
                      {caterer.needs_room_count}
                    </p>
                    <p className="text-[11px] text-[#F5EDE1]/60">Confirmed requests</p>
                  </div>
                </div>

                {/* Caterer summary line */}
                <div className="rounded-xl border border-[#B8925A]/35 bg-[#2B0A12]/45 px-4 py-3 text-xs text-[#F5EDE1]/90 leading-relaxed">
                  <span className="uppercase tracking-[0.16em] text-[10px] text-[#E6CFA3] block mb-1">
                    Confirmed Caterer Summary
                  </span>
                  {caterer.caterer_line}
                </div>

                {/* 4 Function Breakdown Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {orderedFunctions.map((fn) => {
                    const stats = caterer.by_function[fn.id];
                    const headcount = stats?.confirmed_headcount ?? 0;
                    const diet = stats?.diet ?? {
                      veg: 0,
                      jain: 0,
                      nonveg: 0,
                      no_onion_garlic: 0,
                    };
                    return (
                      <div
                        key={fn.id}
                        className="rounded-2xl border border-[#B8925A]/30 bg-[#14050A]/65 p-5 flex flex-col justify-between gap-4 min-w-0"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                                {fn.date} · {fn.time}
                              </p>
                              <h3 className="font-display font-light text-2xl text-[#F5EDE1]">
                                {fn.name}
                              </h3>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-display text-3xl font-light text-[#E6CFA3] tabular-nums leading-none">
                                {headcount}
                              </p>
                              <p className="text-[10px] uppercase tracking-[0.14em] text-[#F5EDE1]/60 mt-1">
                                confirmed
                              </p>
                            </div>
                          </div>

                          {/* Diet Split */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border border-[#B8925A]/20 bg-[#2B0A12]/35 px-3 py-2 flex items-center justify-between">
                              <span className="text-[#F5EDE1]/70">Veg</span>
                              <span className="font-mono tabular-nums text-[#F5EDE1] font-medium">
                                {diet.veg}
                              </span>
                            </div>
                            <div className="rounded-lg border border-[#E6CFA3]/30 bg-[#B8925A]/12 px-3 py-2 flex items-center justify-between">
                              <span className="text-[#E6CFA3]">Jain</span>
                              <span className="font-mono tabular-nums text-[#E6CFA3] font-semibold">
                                {diet.jain}
                              </span>
                            </div>
                            <div className="rounded-lg border border-[#B8925A]/20 bg-[#2B0A12]/35 px-3 py-2 flex items-center justify-between">
                              <span className="text-[#F5EDE1]/70">No Onion/Garlic</span>
                              <span className="font-mono tabular-nums text-[#F5EDE1]">
                                {diet.no_onion_garlic}
                              </span>
                            </div>
                            <div className="rounded-lg border border-[#B8925A]/20 bg-[#2B0A12]/35 px-3 py-2 flex items-center justify-between">
                              <span className="text-[#F5EDE1]/70">Non-Veg</span>
                              <span className="font-mono tabular-nums text-[#F5EDE1]">
                                {diet.nonveg}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Per-function CSV export gated by b2b_csv_export */}
                        <div className="pt-3 border-t hairline-gold flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[#F5EDE1]/60 truncate">
                            {fn.venue.split(",")[0]}
                          </span>
                          {flags.b2b_csv_export ? (
                            <a
                              href={`/api/partner/csv/${fn.id}?vendorId=${encodeURIComponent(
                                vendor.id
                              )}`}
                              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] hover:underline whitespace-nowrap shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Export CSV</span>
                            </a>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 shrink-0">
                              <span className="text-[11px] text-[#F5EDE1]/50">CSV</span>
                              <ProBadge flagKey="b2b_csv_export" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Locked Live Headcount Card driven by !flags.b2b_live_headcount */
              <div className="rounded-2xl border border-[#B8925A]/35 bg-[#14050A]/75 p-6 sm:p-8 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Users className="w-5 h-5 text-[#E6CFA3]" />
                    <h3 className="font-display text-2xl font-light text-[#F5EDE1]">
                      Live confirmed headcount &amp; Jain/veg breakdown
                    </h3>
                  </div>
                  <ProBadge flagKey="b2b_live_headcount" />
                </div>
                <p className="text-sm text-[#F5EDE1]/75 leading-relaxed">
                  Real-time confirmed guest counts per function, Jain/veg dietary splits, and
                  kitchen CSV exports are gated by Flagsmith flags{" "}
                  <span className="font-mono text-xs text-[#E6CFA3]">b2b_live_headcount</span> and{" "}
                  <span className="font-mono text-xs text-[#E6CFA3]">b2b_csv_export</span>.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={switchingPlan}
                    onClick={() => handlePlanSwitch("pro")}
                    className="min-h-[44px] px-5 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3] inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Switch to Pro via Flagsmith</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Role-Specific Wedding Brief (always available on Partner Portal) */}
          <div className="glass-card p-6 sm:p-7 space-y-5">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                Official Wedding Card Brief · {meta.label}
              </p>
              <h2 className="font-display font-light text-3xl text-[#F5EDE1]">
                {vendor.business_type === "caterer"
                  ? "Menu counters & dietary tags"
                  : vendor.business_type === "decorator"
                    ? "Venues, lighting windows & dress palette"
                    : "Run-of-show & travel logistics"}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {orderedFunctions.map((fn) => (
                <div
                  key={`brief-${fn.id}`}
                  className="rounded-xl border border-[#B8925A]/25 bg-[#14050A]/60 p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#E6CFA3]">
                    <span className="uppercase tracking-[0.14em]">{fn.name}</span>
                    <span className="font-mono tabular-nums">{fn.time}</span>
                  </div>
                  <p className="text-xs text-[#F5EDE1]/75 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#E6CFA3] shrink-0 mt-0.5" />
                    <span>{fn.venue}</span>
                  </p>
                  {vendor.business_type === "caterer" ? (
                    <ul className="space-y-1 pt-1 text-xs text-[#F5EDE1]/80">
                      {fn.menu.slice(0, 3).map((m) => (
                        <li key={m.item} className="flex items-center justify-between gap-2">
                          <span className="truncate">{m.item}</span>
                          <span className="font-mono text-[10px] uppercase text-[#E6CFA3]/85 shrink-0">
                            {m.tags.join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[#F5EDE1]/70">
                      <span className="text-[#E6CFA3]">Dress &amp; palette:</span> {fn.dress_code}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {vendor.business_type === "planner" && card.logistics && (
              <div className="rounded-xl border border-[#B8925A]/25 bg-[#14050A]/60 p-4 space-y-1.5 text-xs text-[#F5EDE1]/80">
                <p>
                  <strong className="text-[#E6CFA3]">Parking:</strong> {card.logistics.parking}
                </p>
                <p>
                  <strong className="text-[#E6CFA3]">Shuttle:</strong> {card.logistics.shuttle}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Multilingual Vendor Broadcast + Multi-Wedding Workspace */}
        <div className="lg:col-span-5 space-y-6 min-w-0">
          {/* VENDOR BROADCAST */}
          <div className="glass-card p-6 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                    Multilingual Vendor Broadcast
                  </p>
                  {!flags.b2b_vendor_broadcast && <ProBadge flagKey="b2b_vendor_broadcast" />}
                </div>
                <h2 className="font-display font-light text-3xl text-[#F5EDE1]">
                  Send a live guest update
                </h2>
              </div>
              <Megaphone className="w-5 h-5 text-[#E6CFA3] shrink-0" strokeWidth={1.4} />
            </div>

            {flags.b2b_vendor_broadcast ? (
              <>
                <p className="text-xs text-[#F5EDE1]/75 leading-relaxed">
                  Type an update in English. HaanJi translates it into{" "}
                  <strong className="text-[#E6CFA3]">
                    Hindi, Hinglish, Kannada, Tamil &amp; English
                  </strong>{" "}
                  and displays it live on the Guest page.
                </p>

                <form onSubmit={handleBroadcastSubmit} className="space-y-3.5">
                  <textarea
                    rows={3}
                    maxLength={320}
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    placeholder={`e.g. ${meta.sampleBroadcasts[0]}`}
                    className="w-full rounded-2xl border border-[#B8925A]/40 bg-[#14050A]/80 px-4 py-3 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40 focus:outline-none focus:border-[#E6CFA3]"
                  />

                  <div className="flex flex-wrap gap-2">
                    {meta.sampleBroadcasts.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setBroadcastText(sample)}
                        className="px-3 py-1.5 rounded-full border border-[#B8925A]/30 text-[11px] text-[#E6CFA3]/90 hover:bg-[#B8925A]/15 text-left"
                      >
                        Use sample #{idx + 1}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={broadcastBusy || !broadcastText.trim()}
                      className="min-h-[44px] px-5 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3] disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{broadcastBusy ? "Translating..." : "Broadcast to Guests"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenGuestPage}
                      className="min-h-[44px] px-4 rounded-full border border-[#B8925A]/50 text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3] hover:bg-[#B8925A]/15 inline-flex items-center gap-1.5"
                    >
                      <span>View Guest Page</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>

                {broadcastFeedback && (
                  <p className="text-xs text-[#8FB39A] flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{broadcastFeedback}</span>
                  </p>
                )}
              </>
            ) : (
              /* Locked Broadcast Card driven by !flags.b2b_vendor_broadcast */
              <div className="rounded-2xl border border-[#B8925A]/35 bg-[#14050A]/75 p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#F5EDE1]">
                    5-language guest broadcasts
                  </span>
                  <ProBadge flagKey="b2b_vendor_broadcast" />
                </div>
                <p className="text-xs text-[#F5EDE1]/70 leading-relaxed">
                  Push kitchen counter alerts, floral setup changes, or shuttle updates directly to
                  the Guest banner in <span className="font-mono text-[#E6CFA3]">hi/hinglish/kn/ta/en</span>.
                  Controlled by Flagsmith flag{" "}
                  <span className="font-mono text-[#E6CFA3]">b2b_vendor_broadcast</span>.
                </p>
                <button
                  type="button"
                  disabled={switchingPlan}
                  onClick={() => handlePlanSwitch("pro")}
                  className="min-h-[40px] px-4 rounded-full border border-[#E6CFA3]/60 text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3] hover:bg-[#B8925A]/15"
                >
                  Unlock via Pro plan
                </button>
              </div>
            )}

            {/* Live Published Broadcasts Feed (with all 5 translations) */}
            <div className="pt-4 border-t hairline-gold space-y-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#E6CFA3]">
                Live on Guest Page ({announcements.length})
              </p>

              {announcements.length === 0 ? (
                <p className="text-xs text-[#F5EDE1]/60">
                  No updates published yet. Broadcast an update above to see all 5 translations live
                  on the Guest page.
                </p>
              ) : (
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {announcements.slice(0, 4).map((ann) => (
                    <div
                      key={ann.id}
                      className="rounded-xl border border-[#B8925A]/25 bg-[#14050A]/70 p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                        <span>
                          {ann.sender_name ? `${ann.sender_name}` : "Family Host"}
                        </span>
                        <span className="font-mono text-[#F5EDE1]/55">
                          {new Date(ann.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-[#F5EDE1] leading-relaxed">{ann.english}</p>
                      <div className="grid grid-cols-1 gap-1.5 pt-2 border-t hairline-gold text-[11px] text-[#F5EDE1]/75 indic-relaxed">
                        {(
                          [
                            { code: "hi", label: "हिन्दी" },
                            { code: "hinglish", label: "Hinglish" },
                            { code: "kn", label: "ಕನ್ನಡ" },
                            { code: "ta", label: "தமிழ்" },
                          ] as const
                        ).map((lang) =>
                          ann.translations?.[lang.code] ? (
                            <p key={lang.code} className="leading-relaxed">
                              <span className="text-[#E6CFA3] font-medium mr-1.5">
                                {lang.label}:
                              </span>
                              {ann.translations[lang.code]}
                            </p>
                          ) : null
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* MULTI-WEDDING WORKSPACE (gated by b2b_multi_wedding) */}
          <div className="glass-card p-6 sm:p-7 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                    Linked Weddings
                  </p>
                  {!flags.b2b_multi_wedding && <ProBadge flagKey="b2b_multi_wedding" />}
                </div>
                <h2 className="font-display font-light text-3xl text-[#F5EDE1]">
                  Season calendar
                </h2>
              </div>
              <CalendarDays className="w-5 h-5 text-[#E6CFA3] shrink-0" strokeWidth={1.4} />
            </div>

            <div className="space-y-3">
              {weddings.map((w) => (
                <div
                  key={w.id}
                  className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                    w.status === "active"
                      ? "border-[#E6CFA3]/55 bg-[#2B0A12]/50"
                      : "border-[#B8925A]/25 bg-[#14050A]/65"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl font-light text-[#F5EDE1]">{w.title}</h3>
                      <span className="font-mono text-[10px] text-[#E6CFA3]/85">{w.id}</span>
                    </div>
                    <p className="text-xs text-[#F5EDE1]/70">
                      {w.dates} · {w.city}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.14em] whitespace-nowrap shrink-0 ${
                      w.status === "active"
                        ? "border-[#8FB39A]/45 bg-[#8FB39A]/10 text-[#8FB39A]"
                        : "border-[#B8925A]/30 text-[#E6CFA3]"
                    }`}
                  >
                    {w.status === "active" ? "Active" : "Upcoming"}
                  </span>
                </div>
              ))}

              {!flags.b2b_multi_wedding && (
                <div className="rounded-xl border border-dashed border-[#B8925A]/40 bg-[#14050A]/55 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs text-[#F5EDE1]/85">
                      Manage multiple weddings in one partner desk
                    </p>
                    <p className="text-[11px] font-mono text-[#F5EDE1]/55">
                      Flag: b2b_multi_wedding
                    </p>
                  </div>
                  <ProBadge flagKey="b2b_multi_wedding" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </section>
  );
}
