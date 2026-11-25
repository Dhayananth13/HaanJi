import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  Truck,
} from "lucide-react";
import {
  ShopApiResponse,
  ShopGender,
  ShopPlacementArm,
  ShopProductItem,
  ShopProductType,
  WeddingCardData,
} from "../types/haanji";

export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function buildWhatsAppOrderUrl(
  product: Pick<ShopProductItem, "name" | "whatsapp_number" | "type" | "price_inr">,
  weddingTitle: string
): string {
  const digits = (product.whatsapp_number || "").replace(/[^\d]/g, "");
  const message = `Namaste! I am interested in "${product.name}" (${
    product.type === "rent" ? "Rent" : "Buy"
  }, ${formatInr(product.price_inr)}) for ${weddingTitle}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

interface ShopProductRowProps {
  functionId: string;
  functionName: string;
  products: ShopProductItem[];
  weddingTitle: string;
  placementArm: ShopPlacementArm;
  onShopClick: (productId: string | undefined, action: string) => void;
  onSeeAll: (functionId: string) => void;
  compact?: boolean;
}

export function ShopProductRow({
  functionId,
  functionName,
  products,
  weddingTitle,
  placementArm,
  onShopClick,
  onSeeAll,
  compact = false,
}: ShopProductRowProps) {
  const [expandedInTabArm, setExpandedInTabArm] = useState(false);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});

  const visibleProducts = products.slice(0, 4);
  if (visibleProducts.length === 0) return null;

  const showInlineCards = placementArm === "inline" || expandedInTabArm;

  return (
    <div
      id={`shop-row-${functionId}`}
      className="mt-3 pt-3 border-t hairline-gold space-y-2.5 min-w-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3]">
          <ShoppingBag className="w-3 h-3 shrink-0" strokeWidth={1.6} />
          <span>Shop the look</span>
        </span>
        <button
          type="button"
          onClick={() => {
            onShopClick(undefined, `see_all_${functionId}`);
            onSeeAll(functionId);
          }}
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3] hover:text-[#F5EDE1] hover:underline whitespace-nowrap shrink-0"
        >
          <span>See all</span>
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>

      {!showInlineCards ? (
        <div className="rounded-xl border border-[#B8925A]/30 bg-[#14050A]/65 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2 shrink-0">
              {visibleProducts.slice(0, 3).map((item) => (
                <img
                  key={item.id}
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  className="w-9 h-9 rounded-lg object-cover object-top border border-[#B8925A]/45 bg-[#2B0A12]"
                />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[#F5EDE1] truncate">
                {visibleProducts.length} curated looks for {functionName}
              </p>
              <p className="text-[11px] text-[#F5EDE1]/65 font-mono tabular-nums">
                From {formatInr(Math.min(...visibleProducts.map((p) => p.price_inr)))} · Buy or Rent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onShopClick(undefined, `open_tab_${functionId}`);
                onSeeAll(functionId);
              }}
              className="flex-1 min-h-[36px] px-3 rounded-lg bg-[#F5EDE1] text-[#14050A] text-[11px] font-semibold uppercase tracking-[0.14em] hover:bg-[#E6CFA3] transition-colors whitespace-nowrap"
            >
              Open Shop tab
            </button>
            <button
              type="button"
              onClick={() => {
                onShopClick(undefined, `expand_preview_${functionId}`);
                setExpandedInTabArm(true);
              }}
              className="min-h-[36px] px-2.5 rounded-lg border border-[#B8925A]/40 text-[10px] uppercase tracking-[0.14em] text-[#E6CFA3] hover:bg-[#B8925A]/15 whitespace-nowrap"
            >
              Preview
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1.5 snap-x">
          {visibleProducts.map((product) => {
            const waUrl = buildWhatsAppOrderUrl(product, weddingTitle);
            return (
              <div
                key={product.id}
                className={`${
                  compact ? "w-[186px]" : "w-[210px]"
                } shrink-0 snap-start rounded-xl border border-[#B8925A]/30 bg-[#14050A]/75 overflow-hidden flex flex-col justify-between`}
              >
                <div>
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#2B0A12] border-b border-[#B8925A]/20">
                    {!failedImgs[product.id] ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        loading="lazy"
                        onError={() =>
                          setFailedImgs((prev) => ({ ...prev, [product.id]: true }))
                        }
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 text-center text-[11px] text-[#E6CFA3]">
                        {product.name}
                      </div>
                    )}
                    {product.is_featured && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#14050A]/85 border border-[#E6CFA3]/55 text-[9px] uppercase tracking-[0.14em] text-[#E6CFA3]">
                        Featured
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-[#F5EDE1] leading-snug line-clamp-2 min-h-[2.2rem]">
                      {product.name}
                    </p>
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#E6CFA3]">
                        {formatInr(product.price_inr)}
                      </span>
                      <span className="text-[10px] text-[#F5EDE1]/65 truncate">
                        {product.vendor_name}
                      </span>
                    </div>
                    <p className="inline-flex items-center gap-1 text-[10px] text-[#8FB39A]">
                      <Truck className="w-3 h-3 shrink-0" strokeWidth={1.6} />
                      <span className="truncate">Delivers before {product.delivers_by}</span>
                    </p>
                  </div>
                </div>

                <div className="px-2.5 pb-2.5 pt-1 flex items-center gap-1.5">
                  <a
                    href={product.buy_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onShopClick(product.id, `inline_${product.type}`)}
                    className="flex-1 min-h-[34px] px-2.5 rounded-lg bg-[#F5EDE1] text-[#14050A] text-[11px] font-semibold uppercase tracking-[0.12em] hover:bg-[#E6CFA3] transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                  >
                    <span>{product.type === "rent" ? "Rent" : "Buy"}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Order on WhatsApp from ${product.vendor_name}`}
                    aria-label={`Order ${product.name} on WhatsApp`}
                    onClick={() => onShopClick(product.id, "inline_whatsapp")}
                    className="min-h-[34px] min-w-[34px] px-2 rounded-lg border border-[#B8925A]/45 text-[#E6CFA3] hover:bg-[#B8925A]/15 inline-flex items-center justify-center shrink-0"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ShopCatalogViewProps {
  gid: string;
  card: WeddingCardData | null;
  initialFunction: string;
  onBackToSchedule: () => void;
  onShopClick: (productId: string | undefined, action: string) => void;
}

const FUNCTION_OPTIONS = [
  { id: "all", label: "All functions" },
  { id: "mehendi", label: "Mehendi" },
  { id: "sangeet", label: "Sangeet" },
  { id: "shaadi", label: "Shaadi" },
  { id: "reception", label: "Reception" },
] as const;

const TYPE_OPTIONS: Array<{ id: "all" | ShopProductType; label: string }> = [
  { id: "all", label: "Buy & Rent" },
  { id: "buy", label: "Buy" },
  { id: "rent", label: "Rent" },
];

const GENDER_OPTIONS: Array<{ id: "all" | ShopGender; label: string }> = [
  { id: "all", label: "All styles" },
  { id: "women", label: "Women" },
  { id: "men", label: "Men" },
  { id: "unisex", label: "Unisex" },
];

export function ShopCatalogView({
  gid,
  card,
  initialFunction,
  onBackToSchedule,
  onShopClick,
}: ShopCatalogViewProps) {
  const [selectedFn, setSelectedFn] = useState<string>(initialFunction || "all");
  const [selectedType, setSelectedType] = useState<"all" | ShopProductType>("all");
  const [selectedGender, setSelectedGender] = useState<"all" | ShopGender>("all");
  const [products, setProducts] = useState<ShopProductItem[]>([]);
  const [weddingTitle, setWeddingTitle] = useState<string>(
    card?.wedding?.title || "Sharma & Reddy Wedding"
  );
  const [featuredActive, setFeaturedActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelectedFn(initialFunction || "all");
  }, [initialFunction]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (selectedFn !== "all") qs.set("function", selectedFn);
        if (selectedType !== "all") qs.set("type", selectedType);
        if (selectedGender !== "all") qs.set("gender", selectedGender);
        if (gid) qs.set("gid", gid);
        const res = await fetch(`/api/shop?${qs.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as ShopApiResponse;
        if (cancelled) return;
        setProducts(data.products || []);
        setFeaturedActive(Boolean(data.shop_featured_slot));
        if (data.wedding_title) setWeddingTitle(data.wedding_title);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedFn, selectedType, selectedGender, gid]);

  const activeFnDetails =
    selectedFn !== "all"
      ? card?.functions?.find((f) => f.id === selectedFn) || null
      : null;

  return (
    <section className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-10 py-10 sm:py-14 space-y-8 text-[#F5EDE1]">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 pb-6 border-b hairline-gold">
        <div className="space-y-3">
          <button
            type="button"
            onClick={onBackToSchedule}
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-[#E6CFA3] hover:text-[#F5EDE1]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Schedule</span>
          </button>

          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
              Shop the Look · {weddingTitle}
            </p>
            <h1 className="mt-1.5 font-display font-light text-4xl sm:text-5xl text-[#F5EDE1]">
              Curated attire for every celebration
            </h1>
            <p className="mt-2 text-sm text-[#F5EDE1]/75 max-w-2xl">
              Matched directly to each ceremony&apos;s dress code. Order directly on a partner&apos;s store or on WhatsApp — no in-app payments.
            </p>
          </div>
        </div>

        <div className="text-left lg:text-right space-y-1 shrink-0">
          <p className="font-mono text-xs tabular-nums text-[#E6CFA3]">
            {products.length} {products.length === 1 ? "look" : "looks"} shown
          </p>
          <p className="text-xs text-[#F5EDE1]/60">
            {featuredActive
              ? "Pro partner boutiques appear first"
              : "Sorted by ceremony catalog order"}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Function filter */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3] block">
              Function
            </span>
            <div className="flex flex-wrap gap-1.5">
              {FUNCTION_OPTIONS.map((opt) => {
                const active = selectedFn === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedFn(opt.id)}
                    className={`min-h-[38px] px-3.5 rounded-lg border text-xs transition-colors ${
                      active
                        ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                        : "border-[#B8925A]/35 bg-[#14050A]/60 text-[#F5EDE1]/85 hover:border-[#E6CFA3]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            {/* Buy / Rent filter */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3] block">
                Format
              </span>
              <div className="inline-flex rounded-lg border border-[#B8925A]/35 bg-[#14050A]/70 p-0.5">
                {TYPE_OPTIONS.map((opt) => {
                  const active = selectedType === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedType(opt.id)}
                      className={`min-h-[34px] px-3 rounded-md text-xs transition-colors ${
                        active
                          ? "bg-[#F5EDE1] text-[#14050A] font-semibold"
                          : "text-[#F5EDE1]/80 hover:text-[#F5EDE1]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gender filter */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3] block">
                Wardrobe
              </span>
              <div className="inline-flex rounded-lg border border-[#B8925A]/35 bg-[#14050A]/70 p-0.5">
                {GENDER_OPTIONS.map((opt) => {
                  const active = selectedGender === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedGender(opt.id)}
                      className={`min-h-[34px] px-3 rounded-md text-xs transition-colors ${
                        active
                          ? "bg-[#F5EDE1] text-[#14050A] font-semibold"
                          : "text-[#F5EDE1]/80 hover:text-[#F5EDE1]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {activeFnDetails && (
          <div className="pt-3 border-t hairline-gold flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-[#F5EDE1]/85">
              <span className="text-[#E6CFA3] uppercase tracking-[0.14em] text-[10px] mr-2">
                {activeFnDetails.name} dress code
              </span>
              {activeFnDetails.dress_code}
            </p>
            <span className="font-mono text-[11px] tabular-nums text-[#E6CFA3]">
              {activeFnDetails.date} · {activeFnDetails.time}
            </span>
          </div>
        )}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-card h-[420px] animate-pulse bg-[#2B0A12]/35" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="glass-card p-10 text-center space-y-4">
          <p className="font-display text-2xl font-light text-[#F5EDE1]">
            No looks match this filter combination
          </p>
          <p className="text-sm text-[#F5EDE1]/70">
            Reset filters to browse all curated outfits across Mehendi, Sangeet, Shaadi, and Reception.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedFn("all");
              setSelectedType("all");
              setSelectedGender("all");
            }}
            className="min-h-[44px] px-6 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[#E6CFA3]"
          >
            Reset all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => {
            const waUrl = buildWhatsAppOrderUrl(product, weddingTitle);
            return (
              <article
                key={product.id}
                className="glass-card min-w-0 overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#2B0A12] border-b border-[#B8925A]/25">
                    {!failedImgs[product.id] ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        loading="lazy"
                        onError={() =>
                          setFailedImgs((prev) => ({ ...prev, [product.id]: true }))
                        }
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-6 text-center">
                        <span className="font-display text-xl text-[#E6CFA3]">{product.name}</span>
                      </div>
                    )}

                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                      {product.is_featured ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#14050A]/85 border border-[#E6CFA3]/60 text-[10px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                          <Sparkles className="w-3 h-3" />
                          <span>Featured Partner</span>
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="px-2.5 py-1 rounded-md bg-[#14050A]/85 border border-[#B8925A]/40 text-[10px] uppercase tracking-[0.16em] text-[#F5EDE1]">
                        {product.type === "rent" ? "Rental" : "To Buy"}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3]/90 truncate">
                          {product.vendor_name}
                        </p>
                        <h2 className="mt-1 font-display font-light text-2xl leading-snug text-[#F5EDE1]">
                          {product.name}
                        </h2>
                      </div>
                      <p className="font-mono text-lg font-semibold tabular-nums text-[#E6CFA3] shrink-0">
                        {formatInr(product.price_inr)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#F5EDE1]/70">
                      <span className="capitalize">
                        {product.function_ids.join(" · ")} · {product.gender}
                      </span>
                      {product.colour_tags.length > 0 && (
                        <span className="text-[#F5EDE1]/55 capitalize">
                          {product.colour_tags.slice(0, 3).join(", ")}
                        </span>
                      )}
                    </div>

                    <p className="inline-flex items-center gap-1.5 text-xs text-[#8FB39A]">
                      <Truck className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                      <span>Delivers before {product.delivers_by}</span>
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t hairline-gold flex flex-col sm:flex-row gap-2.5">
                  <a
                    href={product.buy_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onShopClick(product.id, `tab_${product.type}`)}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.14em] hover:bg-[#E6CFA3] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <span>{product.type === "rent" ? "Rent" : "Buy"}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onShopClick(product.id, "tab_whatsapp")}
                    className="flex-1 min-h-[44px] px-4 rounded-xl border border-[#B8925A]/55 text-[#E6CFA3] text-xs uppercase tracking-[0.12em] hover:bg-[#B8925A]/15 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Order on WhatsApp</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
