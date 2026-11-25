import { useMemo, useState } from "react";
import {
  Bus,
  CalendarDays,
  Car,
  ExternalLink,
  MapPin,
  MessageCircle,
  Plane,
  Sparkles,
  Train,
  Users,
} from "lucide-react";
import {
  BookableTravelMode,
  GuestRsvp,
  HouseholdInfo,
  TravelModesConfig,
  TravelProviderConfig,
  TravelProvidersMap,
  TravelServiceItem,
  WeddingTravelInfo,
} from "../types/haanji";

const QUICK_ORIGIN_CITIES = [
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
];

function isSafeHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function formatInrTravel(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/**
 * Builds an external provider URL strictly from the Flagsmith remote-config
 * `travel_providers` entry. If `url_template` is missing/empty, falls back
 * cleanly to `provider.homepage`. Never hard-codes provider URLs.
 */
export function buildProviderBookingUrl(
  provider: TravelProviderConfig | undefined,
  params: { from: string; to: string; date: string }
): string | null {
  if (!provider) return null;
  const tpl = (provider.url_template || "").trim();
  const fromVal = params.from.trim();
  const toVal = params.to.trim();
  const dateVal = params.date.trim();

  if (tpl && isSafeHttpUrl(tpl.replace(/\{from\}|\{to\}|\{date\}/g, "placeholder"))) {
    const filled = tpl
      .replace(/\{from\}/g, encodeURIComponent(fromVal || "Origin"))
      .replace(/\{to\}/g, encodeURIComponent(toVal))
      .replace(/\{date\}/g, encodeURIComponent(dateVal));
    if (isSafeHttpUrl(filled)) return filled;
  }

  const homepage = (provider.homepage || "").trim();
  return isSafeHttpUrl(homepage) ? homepage : null;
}

export function buildLocalPickupWhatsAppUrl(
  service: TravelServiceItem,
  context: {
    guestName: string;
    arrivalPoint: string;
    arrivalTime: string;
    weddingTitle: string;
  }
): string {
  const digits = service.whatsapp_number.replace(/[^\d]/g, "");
  const parts = [
    `Namaste ${service.vendor_name}!`,
    `I am ${context.guestName || "a wedding guest"} attending the ${context.weddingTitle}.`,
    `Could you share availability for "${service.name}" (${service.vehicle}, ${service.seats} seats)?`,
    `Arrival point: ${context.arrivalPoint || service.pickup_points[0] || "Bengaluru"}.`,
    `Arrival time: ${context.arrivalTime || "To be confirmed"}.`,
  ];
  return `https://wa.me/${digits}?text=${encodeURIComponent(parts.join(" "))}`;
}

export function GettingThereCard({
  travel,
  travelEnabled,
  onOpenBookTravel,
}: {
  travel: WeddingTravelInfo;
  travelEnabled: boolean;
  onOpenBookTravel?: () => void;
}) {
  return (
    <div className="glass-card p-6 sm:p-7 space-y-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b hairline-gold">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
            Getting there · From the wedding card
          </p>
          <h3 className="mt-1 font-display font-light text-2xl sm:text-3xl text-[#F5EDE1]">
            Reaching {travel.destination_city}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={travel.venue_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[38px] px-4 rounded-full border border-[#B8925A]/55 text-xs uppercase tracking-[0.14em] text-[#E6CFA3] hover:bg-[#B8925A]/15 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Venue Map</span>
          </a>
          {travelEnabled && onOpenBookTravel && (
            <button
              type="button"
              onClick={onOpenBookTravel}
              className="min-h-[38px] px-4 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.14em] hover:bg-[#E6CFA3] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plane className="w-3.5 h-3.5" />
              <span>Book travel</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#B8925A]/25 bg-[#14050A]/65 p-4 space-y-1.5 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3] inline-flex items-center gap-1.5">
            <Plane className="w-3.5 h-3.5 shrink-0" />
            <span>Nearest Airport</span>
          </p>
          <p className="text-sm font-medium text-[#F5EDE1] leading-snug">
            {travel.nearest_airport}
          </p>
        </div>

        <div className="rounded-xl border border-[#B8925A]/25 bg-[#14050A]/65 p-4 space-y-1.5 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3] inline-flex items-center gap-1.5">
            <Train className="w-3.5 h-3.5 shrink-0" />
            <span>Nearest Railway Station</span>
          </p>
          <p className="text-sm font-medium text-[#F5EDE1] leading-snug">
            {travel.nearest_railway_station}
          </p>
        </div>

        <div className="rounded-xl border border-[#B8925A]/25 bg-[#14050A]/65 p-4 space-y-1.5 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#E6CFA3] inline-flex items-center gap-1.5">
            <Bus className="w-3.5 h-3.5 shrink-0" />
            <span>Main Bus Stand</span>
          </p>
          <p className="text-sm font-medium text-[#F5EDE1] leading-snug">
            {travel.main_bus_stand}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t hairline-gold text-xs text-[#F5EDE1]/80">
        <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-[#E6CFA3]" />
            <span>
              Suggested arrival:{" "}
              <strong className="text-[#F5EDE1] font-medium">
                {travel.suggested_arrival_date}
              </strong>
            </span>
          </span>
          <span>·</span>
          <span>
            Suggested return:{" "}
            <strong className="text-[#F5EDE1] font-medium">
              {travel.suggested_return_date}
            </strong>
          </span>
        </div>
        {travel.venue_address && (
          <span className="text-[#F5EDE1]/65">{travel.venue_address}</span>
        )}
      </div>
    </div>
  );
}

export function BookTravelPanel({
  travel,
  weddingTitle,
  modes,
  providers,
  services,
  household,
  rsvp,
  onOpenRsvpTravel,
}: {
  travel: WeddingTravelInfo;
  weddingTitle: string;
  modes: TravelModesConfig;
  providers: TravelProvidersMap;
  services: TravelServiceItem[];
  household: HouseholdInfo | null;
  rsvp: GuestRsvp | null;
  onOpenRsvpTravel?: () => void;
}) {
  const enabledModes = useMemo(
    () =>
      (["flight", "train", "bus"] as BookableTravelMode[]).filter((m) => modes[m]),
    [modes]
  );

  const [selectedMode, setSelectedMode] = useState<BookableTravelMode>(
    enabledModes[0] || "flight"
  );
  const [fromCity, setFromCity] = useState("Mumbai");
  const [departDate, setDepartDate] = useState(
    travel.suggested_arrival_iso || "2026-11-27"
  );
  const [returnDate, setReturnDate] = useState(
    travel.suggested_return_iso || "2026-11-30"
  );
  const [pickupFilter, setPickupFilter] = useState<string>("all");
  const [guestNameInput, setGuestNameInput] = useState(
    household?.family_name || rsvp?.household_name || ""
  );
  const [pickupPointInput, setPickupPointInput] = useState(
    rsvp?.arrival_point || travel.nearest_airport
  );
  const [pickupTimeInput, setPickupTimeInput] = useState(
    rsvp?.arrival_time || `${travel.suggested_arrival_date}, 4:00 PM`
  );

  const activeMode: BookableTravelMode = enabledModes.includes(selectedMode)
    ? selectedMode
    : enabledModes[0] || "flight";

  const destinationForMode =
    activeMode === "flight"
      ? travel.nearest_airport_code || travel.destination_city
      : activeMode === "train"
        ? travel.nearest_railway_code || travel.destination_city
        : travel.destination_city;

  const destinationLabel =
    activeMode === "flight"
      ? travel.nearest_airport
      : activeMode === "train"
        ? travel.nearest_railway_station
        : travel.main_bus_stand;

  const activeProvider = providers[activeMode];
  const bookingUrl = buildProviderBookingUrl(activeProvider, {
    from: fromCity,
    to: destinationForMode,
    date: departDate,
  });

  const filteredServices = useMemo(() => {
    if (pickupFilter === "all") return services;
    const needle = pickupFilter.toLowerCase();
    return services.filter((s) =>
      s.pickup_points.some((p) => p.toLowerCase().includes(needle))
    );
  }, [services, pickupFilter]);

  const effectiveGuestName =
    guestNameInput.trim() || household?.family_name || rsvp?.household_name || "Wedding Guest";
  const effectivePickupPoint =
    pickupPointInput.trim() || rsvp?.arrival_point || travel.nearest_airport;
  const effectivePickupTime =
    pickupTimeInput.trim() || rsvp?.arrival_time || travel.suggested_arrival_date;

  const modeMeta: Record<
    BookableTravelMode,
    { label: string; icon: typeof Plane; hint: string }
  > = {
    bus: {
      label: "Bus",
      icon: Bus,
      hint: `Arrives at ${travel.main_bus_stand}`,
    },
    train: {
      label: "Train",
      icon: Train,
      hint: `Arrives at ${travel.nearest_railway_station}`,
    },
    flight: {
      label: "Flight",
      icon: Plane,
      hint: `Lands at ${travel.nearest_airport}`,
    },
  };

  return (
    <div className="space-y-8">
      {/* Book intercity travel */}
      <div className="glass-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b hairline-gold">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
              Plan Your Journey
            </p>
            <h3 className="mt-1.5 font-display font-light text-3xl sm:text-4xl text-[#F5EDE1]">
              Book travel to {travel.destination_city}
            </h3>
            <p className="mt-1 text-sm text-[#F5EDE1]/70">
              Destination and suggested wedding dates are pre-filled. Choose Bus, Train, or Flight to continue directly on the booking provider.
            </p>
          </div>
          {onOpenRsvpTravel && (
            <button
              type="button"
              onClick={onOpenRsvpTravel}
              className="min-h-[40px] px-4 rounded-full border border-[#B8925A]/50 text-xs uppercase tracking-[0.14em] text-[#E6CFA3] hover:bg-[#B8925A]/15 whitespace-nowrap"
            >
              Add arrival details to RSVP
            </button>
          )}
        </div>

        {enabledModes.length === 0 ? (
          <p className="text-sm text-[#F5EDE1]/70">
            No intercity travel modes are currently enabled in Flagsmith (<code className="font-mono text-xs text-[#E6CFA3]">travel_modes</code>).
          </p>
        ) : (
          <>
            {/* Mode Tabs */}
            <div className="flex flex-wrap items-center gap-2.5" role="tablist" aria-label="Travel mode">
              {(["bus", "train", "flight"] as BookableTravelMode[]).map((mode) => {
                if (!modes[mode]) return null;
                const Icon = modeMeta[mode].icon;
                const active = activeMode === mode;
                const providerName = providers[mode]?.name;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedMode(mode)}
                    className={`min-h-[44px] px-5 rounded-full border text-xs uppercase tracking-[0.16em] inline-flex items-center gap-2 transition-colors ${
                      active
                        ? "border-[#F5EDE1] bg-[#F5EDE1] text-[#14050A] font-semibold"
                        : "border-[#B8925A]/45 bg-[#14050A]/65 text-[#F5EDE1]/85 hover:border-[#E6CFA3]"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{modeMeta[mode].label}</span>
                    {providerName && (
                      <span
                        className={`text-[10px] normal-case tracking-normal ${
                          active ? "text-[#14050A]/70" : "text-[#E6CFA3]/80"
                        }`}
                      >
                        · {providerName.split(" ")[0]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Journey Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block space-y-1.5 text-xs">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">From city</span>
                <input
                  type="text"
                  value={fromCity}
                  onChange={(e) => setFromCity(e.target.value)}
                  placeholder="Enter your city (e.g. Mumbai)"
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/40 bg-[#14050A]/85 px-3.5 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                />
              </label>

              <div className="space-y-1.5 text-xs">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3] block">
                  Destination (pre-filled)
                </span>
                <div className="min-h-[44px] rounded-xl border border-[#B8925A]/25 bg-[#14050A]/55 px-3.5 py-2.5 text-sm text-[#F5EDE1]/90 flex items-center justify-between gap-2">
                  <span className="truncate">{destinationLabel}</span>
                  <span className="font-mono text-[11px] text-[#E6CFA3] shrink-0">
                    {destinationForMode}
                  </span>
                </div>
              </div>

              <label className="block space-y-1.5 text-xs">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">
                  Arrival date (suggested {travel.suggested_arrival_date})
                </span>
                <input
                  type="date"
                  value={departDate}
                  onChange={(e) => setDepartDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/40 bg-[#14050A]/85 px-3.5 text-sm font-mono text-[#F5EDE1]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="uppercase tracking-[0.14em] text-[#E6CFA3]">
                  Return date (suggested {travel.suggested_return_date})
                </span>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#B8925A]/40 bg-[#14050A]/85 px-3.5 text-sm font-mono text-[#F5EDE1]"
                />
              </label>
            </div>

            {/* Quick Origin City Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[#F5EDE1]/55">
                Popular origins:
              </span>
              {QUICK_ORIGIN_CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setFromCity(city)}
                  className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                    fromCity.toLowerCase() === city.toLowerCase()
                      ? "border-[#E6CFA3] bg-[#B8925A]/20 text-[#E6CFA3]"
                      : "border-[#B8925A]/30 text-[#F5EDE1]/75 hover:border-[#B8925A]"
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>

            {/* Provider Action Row */}
            <div className="rounded-2xl border border-[#B8925A]/35 bg-[#14050A]/70 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium text-[#F5EDE1]">
                  {fromCity.trim() || "Your city"} &rarr; {destinationLabel}
                </p>
                <p className="text-xs text-[#F5EDE1]/70">
                  {modeMeta[activeMode].hint} · Onward {departDate} · Return {returnDate}
                </p>
                <p className="text-[11px] text-[#E6CFA3]/85">
                  Booking happens on {activeProvider?.name || "the external provider"}. HaanJi never takes payment or sells tickets.
                </p>
              </div>

              {bookingUrl ? (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[46px] px-6 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#E6CFA3] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  <span>Book on {activeProvider?.name}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-xs text-[#C98A8A]">
                  Provider link unavailable in current config.
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Local Pickup Services from Travel Partners */}
      <div className="glass-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b hairline-gold">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
              Local Pickup · Partner Cabs &amp; Tempo Travellers
            </p>
            <h3 className="mt-1.5 font-display font-light text-3xl text-[#F5EDE1]">
              Airport, railway &amp; hotel transfers
            </h3>
            <p className="mt-1 text-sm text-[#F5EDE1]/70">
              Verified local wedding travel operators in Bengaluru. Tap WhatsApp to enquire directly with your arrival details pre-filled.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { id: "all", label: "All points" },
              { id: "BLR", label: "BLR Airport" },
              { id: "SBC", label: "KSR Bengaluru (SBC)" },
              { id: "Majestic", label: "Majestic Bus Stand" },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setPickupFilter(chip.id)}
                className={`min-h-[36px] px-3.5 rounded-full border text-xs transition-colors ${
                  pickupFilter === chip.id
                    ? "border-[#E6CFA3] bg-[#B8925A]/20 text-[#E6CFA3] font-medium"
                    : "border-[#B8925A]/30 text-[#F5EDE1]/75 hover:border-[#B8925A]"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pre-fill controls for WhatsApp enquiry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-[#B8925A]/25 bg-[#14050A]/55 p-4 text-xs">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[#E6CFA3]">
              Your name / family (for WhatsApp)
            </span>
            <input
              type="text"
              value={guestNameInput}
              onChange={(e) => setGuestNameInput(e.target.value)}
              placeholder={household?.family_name || "e.g. Sharma Family"}
              className="w-full min-h-[38px] rounded-lg border border-[#B8925A]/30 bg-[#14050A]/80 px-3 text-xs text-[#F5EDE1]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[#E6CFA3]">
              Pickup point
            </span>
            <select
              value={pickupPointInput}
              onChange={(e) => setPickupPointInput(e.target.value)}
              className="w-full min-h-[38px] rounded-lg border border-[#B8925A]/30 bg-[#14050A]/80 px-3 text-xs text-[#F5EDE1]"
            >
              <option value={travel.nearest_airport}>{travel.nearest_airport}</option>
              <option value={travel.nearest_railway_station}>
                {travel.nearest_railway_station}
              </option>
              <option value={travel.main_bus_stand}>{travel.main_bus_stand}</option>
              <option value="Taj MG Road">Taj MG Road</option>
              <option value="The Tamarind Tree, Kanakapura Road">
                The Tamarind Tree, Kanakapura Road
              </option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[#E6CFA3]">
              Arrival date &amp; time
            </span>
            <input
              type="text"
              value={pickupTimeInput}
              onChange={(e) => setPickupTimeInput(e.target.value)}
              placeholder="e.g. 27 Nov, 4:15 PM"
              className="w-full min-h-[38px] rounded-lg border border-[#B8925A]/30 bg-[#14050A]/80 px-3 text-xs text-[#F5EDE1]"
            />
          </label>
        </div>

        {filteredServices.length === 0 ? (
          <p className="text-sm text-[#F5EDE1]/65 py-4">
            No local pickup services match that pickup point yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredServices.map((svc) => {
              const waUrl = buildLocalPickupWhatsAppUrl(svc, {
                guestName: effectiveGuestName,
                arrivalPoint: effectivePickupPoint,
                arrivalTime: effectivePickupTime,
                weddingTitle,
              });
              return (
                <article
                  key={svc.id}
                  className="rounded-2xl border border-[#B8925A]/35 bg-[#14050A]/75 p-5 flex flex-col justify-between gap-4 min-w-0"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3]">
                            {svc.vendor_name}
                          </span>
                          {svc.is_featured && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E6CFA3]/55 bg-[#B8925A]/20 text-[10px] uppercase tracking-[0.14em] text-[#E6CFA3]">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>Featured</span>
                            </span>
                          )}
                        </div>
                        <h4 className="mt-1 font-display text-2xl font-light text-[#F5EDE1] leading-snug">
                          {svc.name}
                        </h4>
                      </div>
                      <span className="font-mono text-lg font-semibold tabular-nums text-[#E6CFA3] shrink-0">
                        {formatInrTravel(svc.price_inr)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#F5EDE1]/80">
                      <span className="inline-flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-[#E6CFA3]" />
                        <span>{svc.vehicle}</span>
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Users className="w-3.5 h-3.5 text-[#8FB39A]" />
                        <span>{svc.seats} seats</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {svc.pickup_points.map((pt) => (
                        <span
                          key={pt}
                          className="px-2.5 py-0.5 rounded-md border border-[#B8925A]/25 bg-[#2B0A12]/40 text-[11px] text-[#F5EDE1]/75"
                        >
                          {pt}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t hairline-gold flex items-center justify-between gap-3">
                    <span className="text-[11px] text-[#F5EDE1]/60">
                      Direct operator enquiry · Pay operator directly
                    </span>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-4 rounded-full border border-[#8FB39A]/60 bg-[#8FB39A]/15 text-[#F5EDE1] text-xs font-medium hover:bg-[#8FB39A]/25 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#8FB39A]" />
                      <span>Enquire on WhatsApp</span>
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
