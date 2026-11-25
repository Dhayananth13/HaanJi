import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  Lock,
  Plane,
  Plus,
  Send,
  ShoppingBag,
  Unlock,
  Users,
} from "lucide-react";
import type { ArrivalsSummary } from "../types/haanji";

interface HouseholdRow {
  code: string;
  family_name: string;
  preferred_language: string;
  age_band: "standard" | "elder";
  invited_functions: string[];
  rsvp_status: "confirmed" | "tentative" | "pending";
  headcount: number | null;
}

interface HostStateResponse {
  caterer: {
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
  };
  households: HouseholdRow[];
  unanswered: Array<{
    id: string;
    gid: string;
    question: string;
    language: string;
    reason: string;
    created_at: string;
    resolved: boolean;
    added_answer?: string;
    answered_after_adding: number;
  }>;
  experiment: {
    arms: {
      formal: { exposures: number; completions: number; abandoned: number; conversion_rate_pct: number };
      warm: { exposures: number; completions: number; abandoned: number; conversion_rate_pct: number };
    };
    total_exposures: number;
    honest_reading: string;
    flagsmith_note: string;
  };
  ops_chip: {
    level: number;
    rpm_60s: number;
    sarvam_429_last_60s: number;
    rate429_pct_60s: number;
    alerter_status: string;
  };
  announcements: Array<{
    id: string;
    english: string;
    translations: Record<string, string>;
    created_at: string;
  }>;
  shop_enabled?: boolean;
  shop_featured_slot?: boolean;
  travel_enabled?: boolean;
  travel_featured_vendor?: boolean;
  arrivals?: ArrivalsSummary;
  flagsmith_unreachable?: boolean;
  host_desk_locked?: boolean;
  host_key_configured?: boolean;
}

function buildWhatsAppNudge(h: HouseholdRow): string {
  const link = `${window.location.origin}/?h=${h.code}`;
  if (h.preferred_language === "hi" || h.preferred_language === "hinglish") {
    return `Namaste ${h.family_name}! Sharma & Reddy shaadi ke timings, venue aur RSVP ke liye yahan tap karein: ${link}`;
  }
  if (h.preferred_language === "kn") {
    return `ನಮಸ್ಕಾರ ${h.family_name}! ಶರ್ಮಾ ಮತ್ತು ರೆಡ್ಡಿ ಮದುವೆಯ ವಿವರಗಳು ಮತ್ತು RSVP ಗಾಗಿ ಇಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ: ${link}`;
  }
  if (h.preferred_language === "ta") {
    return `வணக்கம் ${h.family_name}! சர்மா & ரெட்டி திருமண விவரங்கள் மற்றும் RSVP-க்கு இங்கே தட்டவும்: ${link}`;
  }
  return `Warm invitation to ${h.family_name}! Ask HaanJi for timings, directions, and confirm your RSVP here: ${link}`;
}

export function HostDashboard({
  onOpenHousehold,
}: {
  onOpenHousehold?: (code: string) => void;
}) {
  const [enteredKey, setEnteredKey] = useState("");
  const [lockKeyInput, setLockKeyInput] = useState("");
  const [showLockForm, setShowLockForm] = useState(false);
  const [locking, setLocking] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [data, setData] = useState<HostStateResponse | null>(null);
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [announcementText, setAnnouncementText] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [shopToggleBusy, setShopToggleBusy] = useState(false);
  const [travelToggleBusy, setTravelToggleBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const authHeaders = useCallback(
    (includeJson = false): Record<string, string> => ({
      "X-Requested-With": "fetch",
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    }),
    [sessionToken]
  );

  const loadState = useCallback(
    async (overrideToken?: string | null) => {
      try {
        const activeToken = overrideToken !== undefined ? overrideToken : sessionToken;
        const headers: Record<string, string> = {
          "X-Requested-With": "fetch",
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        };
        const res = await fetch("/api/host/state", {
          headers,
          credentials: "include",
        });
        if (res.status === 403) {
          setLocked(true);
          setData(null);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: HostStateResponse = await res.json();
        setLocked(false);
        setData(json);
      } catch {
        setLocked(true);
      }
    },
    [sessionToken]
  );

  useEffect(() => {
    void loadState();
    const id = window.setInterval(() => {
      void loadState();
    }, 3000);
    return () => window.clearInterval(id);
  }, [loadState]);

  const lockHostDesk = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = lockKeyInput.trim();
    if (!key || locking) return;
    setLocking(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/host/lock", {
        method: "POST",
        headers: authHeaders(true),
        credentials: "include",
        body: JSON.stringify({ key }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Invalid Host Key");
      }
      setLockKeyInput("");
      setShowLockForm(false);
      setSessionToken(null);
      setData(null);
      setLocked(true);
      setActionMsg("Host Desk locked. Enter your Host Key to unlock.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLocking(false);
    }
  };

  const unlockHostSession = async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setUnlocking(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/host/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "fetch",
        },
        credentials: "include",
        body: JSON.stringify({ key: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Invalid Host Key");
      }
      const nextToken = typeof json.token === "string" ? json.token : null;
      setSessionToken(nextToken);
      setEnteredKey("");
      setActionMsg("Host Desk unlocked.");
      await loadState(nextToken);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlocking(false);
    }
  };

  const handleAddToCard = async (id: string) => {
    const answer = (draftAnswers[id] || "").trim();
    if (!answer) return;
    setErrorMsg(null);
    try {
      const res = await fetch("/api/host/add-to-card", {
        method: "POST",
        headers: authHeaders(true),
        credentials: "include",
        body: JSON.stringify({ id, answer }),
      });
      if (!res.ok) throw new Error("Failed adding FAQ to card");
      setDraftAnswers((prev) => ({ ...prev, [id]: "" }));
      setActionMsg("Added to wedding card. Next guest asking this question will get your answer.");
      await loadState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim() || broadcasting) return;
    setBroadcasting(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/host/announcement", {
        method: "POST",
        headers: authHeaders(true),
        credentials: "include",
        body: JSON.stringify({ text: announcementText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Translation broadcast failed");
      setAnnouncementText("");
      setActionMsg("Announcement translated to EN, HI, KN, and TA and sent to guest pages.");
      await loadState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBroadcasting(false);
    }
  };

  const handleToggleShop = async () => {
    if (!data || shopToggleBusy) return;
    setShopToggleBusy(true);
    setActionMsg(null);
    setErrorMsg(null);
    const nextEnabled = !data.shop_enabled;
    try {
      const res = await fetch("/api/host/shop-toggle", {
        method: "POST",
        headers: authHeaders(true),
        credentials: "include",
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update Shop the look flag");
      setActionMsg(
        json.flagsmith_unreachable
          ? "Flagsmith is currently unreachable; shop_enabled remains safely OFF."
          : json.shop_enabled
            ? "Shop the look is now ON for guests under every dress code."
            : "Shop the look is now OFF on guest pages."
      );
      await loadState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setShopToggleBusy(false);
    }
  };

  const handleToggleTravel = async () => {
    if (!data || travelToggleBusy) return;
    setTravelToggleBusy(true);
    setActionMsg(null);
    setErrorMsg(null);
    const nextEnabled = !data.travel_enabled;
    try {
      const res = await fetch("/api/host/travel-toggle", {
        method: "POST",
        headers: authHeaders(true),
        credentials: "include",
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update travel_enabled flag");
      setActionMsg(
        json.flagsmith_unreachable
          ? "Flagsmith is currently unreachable; travel_enabled remains safely OFF."
          : json.travel_enabled
            ? "Travel booking & Local Pickup is now ON for guests."
            : "Travel booking & Local Pickup is now OFF on guest pages."
      );
      await loadState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setTravelToggleBusy(false);
    }
  };

  const copyText = async (txt: string, notice: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      setActionMsg(notice);
    } catch {
      setActionMsg("Copied text ready.");
    }
  };

  const buildCatererWhatsAppBlock = () => {
    if (!data) return "";
    const fnLines = Object.values(data.caterer.by_function).map(
      (f) =>
        `- ${f.name}: ${f.confirmed_headcount} confirmed (Veg ${f.diet.veg}, Jain ${f.diet.jain}, No-Onion/Garlic ${f.diet.no_onion_garlic}, Non-Veg ${f.diet.nonveg})`
    );
    return [
      data.caterer.caterer_line,
      data.caterer.unconfirmed_line,
      `Hotel rooms requested: ${data.caterer.needs_room_count}`,
      ...fnLines,
    ].join("\n");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-10 text-[#F5EDE1]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b hairline-gold">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
            Family &amp; Catering Desk
          </p>
          <h1 className="mt-1.5 font-display text-3xl sm:text-4xl font-light text-[#F5EDE1]">
            Host Operations Desk
          </h1>
          <p className="mt-1.5 text-sm text-[#F5EDE1]/70">
            Deterministic caterer counts, Family Inbox loop, household invites, and multilingual broadcasts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data?.ops_chip && (
            <div className="px-4 py-2 rounded-full border border-[#B8925A]/30 bg-[#14050A]/65 text-xs font-mono tabular-nums text-[#F5EDE1]">
              Ops · L{data.ops_chip.level} · {data.ops_chip.rpm_60s} RPM ·{" "}
              <span
                className={
                  data.ops_chip.sarvam_429_last_60s > 0
                    ? "text-[#C98A8A] font-semibold"
                    : "text-[#8FB39A]"
                }
              >
                {data.ops_chip.sarvam_429_last_60s} 429s/60s
              </span>
            </div>
          )}

          {data && !locked && (
            <button
              type="button"
              onClick={() => {
                setShowLockForm((prev) => !prev);
                setErrorMsg(null);
              }}
              className="min-h-[40px] px-4 rounded-full border border-[#B8925A]/55 bg-[#14050A]/75 text-xs font-medium text-[#E6CFA3] hover:bg-[#B8925A]/15 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{showLockForm ? "Cancel Lock" : "Lock Host Desk"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Lock Desk Form (when unlocked and user clicks Lock Host Desk) */}
      {data && !locked && showLockForm && (
        <section className="glass-card p-5 sm:p-6 space-y-3 border-[#B8925A]/50">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-[#E6CFA3] mt-0.5 shrink-0" strokeWidth={1.5} />
            <div>
              <h2 className="font-display text-xl font-light text-[#F5EDE1]">
                Lock Host Desk with Host Key
              </h2>
              <p className="mt-1 text-xs text-[#F5EDE1]/70">
                {data.host_key_configured
                  ? "Enter your Host Key to lock the Host Desk. Once locked, all Host Desk routes require this key to unlock."
                  : "Enter your Host Key (min 8 characters) to lock the Host Desk. You will need the same key to unlock it."}
              </p>
            </div>
          </div>
          <form onSubmit={lockHostDesk} className="flex flex-wrap gap-2">
            <input
              type="password"
              value={lockKeyInput}
              onChange={(e) => setLockKeyInput(e.target.value)}
              placeholder="Enter Host Key to lock..."
              autoComplete="off"
              className="flex-1 min-w-[220px] min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3.5 font-mono text-xs text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
            />
            <button
              type="submit"
              disabled={locking || !lockKeyInput.trim()}
              className="min-h-[44px] px-5 rounded-xl bg-[#F5EDE1] text-[#14050A] text-xs font-semibold hover:bg-[#E6CFA3] disabled:opacity-45 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{locking ? "Locking..." : "Lock Now"}</span>
            </button>
          </form>
        </section>
      )}

      {/* Host Lock Gate (shown only when locked) */}
      {locked && !data && (
        <section className="max-w-lg mx-auto glass-card p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-[#E6CFA3] mt-0.5 shrink-0" strokeWidth={1.5} />
            <div>
              <h2 className="font-display text-2xl font-light text-[#F5EDE1]">
                Host Desk Locked
              </h2>
              <p className="mt-1 text-sm text-[#F5EDE1]/70">
                The Host Desk is currently locked. Enter your Host Key to unlock access to caterer totals, arrivals, and broadcasts.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlockHostSession(enteredKey);
            }}
            className="flex gap-2"
          >
            <input
              type="password"
              value={enteredKey}
              onChange={(e) => setEnteredKey(e.target.value)}
              placeholder="Enter Host Key..."
              autoComplete="off"
              className="flex-1 min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3.5 font-mono text-xs text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
            />
            <button
              type="submit"
              disabled={unlocking || !enteredKey.trim()}
              className="min-h-[44px] px-5 rounded-xl bg-[#F5EDE1] text-[#14050A] text-xs font-semibold hover:bg-[#E6CFA3] disabled:opacity-45 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>{unlocking ? "Unlocking..." : "Unlock Host Desk"}</span>
            </button>
          </form>
        </section>
      )}

      {errorMsg && (
        <div className="rounded-2xl border border-[#C98A8A]/50 bg-[#14050A]/80 px-4 py-3 text-sm text-[#C98A8A]">
          {errorMsg}
        </div>
      )}

      {actionMsg && (
        <div className="rounded-2xl border border-[#8FB39A]/40 bg-[#14050A]/75 px-4 py-3 text-sm text-[#8FB39A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {data && (
        <>
          {/* Caterer Summary */}
          <section className="glass-card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3]">
                  Deterministic Summation
                </p>
                <h2 className="mt-1.5 font-display text-2xl sm:text-3xl font-light text-[#F5EDE1]">
                  {data.caterer.caterer_line}
                </h2>
                <p className="mt-1.5 text-sm text-[#E6CFA3] font-medium">
                  {data.caterer.unconfirmed_line}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-right font-mono tabular-nums">
                <div>
                  <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-[#F5EDE1]/65">
                    Confirmed Parties
                  </p>
                  <p className="text-2xl font-light text-[#F5EDE1]">
                    {data.caterer.confirmed_parties}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-[#F5EDE1]/65">
                    Needs Room
                  </p>
                  <p className="text-2xl font-light text-[#F5EDE1]">
                    {data.caterer.needs_room_count}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-[#F5EDE1]/65">
                    Declined
                  </p>
                  <p className="text-2xl font-light text-[#F5EDE1]/65">
                    {data.caterer.declined_parties}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      buildCatererWhatsAppBlock(),
                      "Copied WhatsApp-ready caterer summary to clipboard."
                    )
                  }
                  className="min-h-[44px] px-5 rounded-full bg-[#F5EDE1] text-[#14050A] font-sans text-xs font-semibold hover:bg-[#E6CFA3] inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy WhatsApp Summary</span>
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b hairline-gold text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                    <th className="py-3 pr-4 font-medium">Function</th>
                    <th className="py-3 px-4 text-right font-medium">Confirmed</th>
                    <th className="py-3 px-4 text-right font-medium">Unconfirmed Range</th>
                    <th className="py-3 px-4 text-right font-medium">Veg</th>
                    <th className="py-3 px-4 text-right font-medium">Jain</th>
                    <th className="py-3 px-4 text-right font-medium">Non-Veg</th>
                    <th className="py-3 px-4 text-right font-medium">No Onion/Garlic</th>
                    <th className="py-3 pl-4 text-right font-medium">Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#B8925A]/15 text-sm">
                  {Object.values(data.caterer.by_function).map((fn) => (
                    <tr key={fn.id} className="hover:bg-[#B8925A]/5">
                      <td className="py-3.5 pr-4 font-medium text-[#F5EDE1]">{fn.name}</td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#8FB39A]">
                        {fn.confirmed_headcount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#E6CFA3]">
                        {fn.unconfirmed_max > 0
                          ? `+ ${fn.unconfirmed_min} to ${fn.unconfirmed_max}`
                          : "0"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F5EDE1]/75">
                        {fn.diet.veg}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F5EDE1]/75">
                        {fn.diet.jain}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F5EDE1]/75">
                        {fn.diet.nonveg}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F5EDE1]/75">
                        {fn.diet.no_onion_garlic}
                      </td>
                      <td className="py-3.5 pl-4 text-right">
                        <a
                          href={`/api/host/csv/${fn.id}`}
                          download={`haanji-${fn.id}.csv`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#B8925A]/45 text-xs text-[#E6CFA3] hover:bg-[#B8925A]/15 whitespace-nowrap"
                        >
                          <Download className="w-3 h-3" />
                          <span>CSV</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Guest Arrivals grouped by date & arrival point + CSV Export */}
          <section className="glass-card p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3] inline-flex items-center gap-1.5">
                  <Plane className="w-3.5 h-3.5" />
                  <span>Guest Arrivals Manifest</span>
                </p>
                <h2 className="mt-1.5 font-display text-2xl sm:text-3xl font-light text-[#F5EDE1]">
                  Arrivals by Date &amp; Arrival Point
                </h2>
                <p className="mt-1 text-xs text-[#F5EDE1]/70">
                  Grouped from RSVP travel details for airport, railway station, and bus stand pickup planning.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="text-right font-mono tabular-nums">
                  <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-[#F5EDE1]/65">
                    Arriving Guests
                  </p>
                  <p className="text-2xl font-light text-[#E6CFA3]">
                    {data.arrivals?.total_arriving_guests ?? 0}
                  </p>
                </div>

                <a
                  href="/api/host/arrivals/csv"
                  download="haanji-arrivals.csv"
                  className="min-h-[44px] px-5 rounded-full border border-[#B8925A]/55 bg-[#14050A]/75 text-xs uppercase tracking-[0.14em] text-[#E6CFA3] hover:bg-[#B8925A]/15 inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Arrivals CSV</span>
                </a>
              </div>
            </div>

            {(!data.arrivals || data.arrivals.groups.length === 0) ? (
              <p className="py-6 text-sm text-[#F5EDE1]/65 text-center">
                No guests have submitted travel arrival details yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b hairline-gold text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                      <th className="py-3 pr-4 font-medium">Arrival Date</th>
                      <th className="py-3 px-4 font-medium">Arrival Point</th>
                      <th className="py-3 px-4 font-medium">Modes</th>
                      <th className="py-3 px-4 text-right font-medium">Parties</th>
                      <th className="py-3 px-4 text-right font-medium">Confirmed Guests</th>
                      <th className="py-3 pl-4 font-medium">Households &amp; Times</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#B8925A]/15">
                    {data.arrivals.groups.map((grp) => (
                      <tr
                        key={`${grp.arrival_date}-${grp.arrival_point}`}
                        className="hover:bg-[#B8925A]/5 align-top"
                      >
                        <td className="py-3.5 pr-4 font-mono text-xs text-[#E6CFA3] whitespace-nowrap">
                          {grp.arrival_date}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[#F5EDE1]">
                          {grp.arrival_point}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1.5">
                            {grp.modes.map((m) => (
                              <span
                                key={m}
                                className="px-2 py-0.5 rounded-full border border-[#B8925A]/35 text-[10px] uppercase tracking-[0.14em] text-[#E6CFA3]"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F5EDE1]/80">
                          {grp.parties_count}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#8FB39A]">
                          {grp.confirmed_guests}
                          {grp.pending_guests > 0 && (
                            <span className="text-[#E6CFA3] font-normal text-xs ml-1">
                              (+{grp.pending_guests})
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 pl-4 text-xs text-[#F5EDE1]/80 space-y-1">
                          {grp.parties.map((p) => (
                            <div key={p.gid} className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-[#F5EDE1]">{p.household}</span>
                              <span className="font-mono text-[#E6CFA3]">({p.headcount})</span>
                              {p.arrival_time && (
                                <span className="text-[#F5EDE1]/65">· {p.arrival_time}</span>
                              )}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-8">
              {/* Unanswered Questions */}
              <section className="glass-card p-6 sm:p-8">
                <div className="pb-4 border-b hairline-gold">
                  <h2 className="font-display text-2xl font-light text-[#F5EDE1]">
                    Family Inbox ({data.unanswered.filter((u) => !u.resolved).length} open)
                  </h2>
                  <p className="mt-1 text-xs text-[#F5EDE1]/65">
                    Questions absent from the wedding card. Answer once to teach HaanJi immediately.
                  </p>
                </div>

                {data.unanswered.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[#F5EDE1]/65">
                    No unanswered guest questions yet.
                  </div>
                ) : (
                  <div className="divide-y divide-[#B8925A]/15">
                    {data.unanswered.map((uq) => (
                      <div key={uq.id} className="py-4 space-y-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-[#F5EDE1]">{uq.question}</p>
                          <span className="font-mono text-xs text-[#E6CFA3]/80">
                            {uq.language} · {uq.reason} ·{" "}
                            {new Date(uq.created_at).toLocaleTimeString()}
                          </span>
                        </div>

                        {uq.resolved ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <p className="text-[#8FB39A] font-medium">
                              Added to card: &ldquo;{uq.added_answer}&rdquo;
                            </p>
                            <span className="font-mono text-[#E6CFA3]">
                              Answered after adding: {uq.answered_after_adding} guests
                            </span>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={draftAnswers[uq.id] || ""}
                              onChange={(e) =>
                                setDraftAnswers((prev) => ({ ...prev, [uq.id]: e.target.value }))
                              }
                              placeholder="Type official host answer to add to wedding card..."
                              className="flex-1 min-h-[44px] rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 px-3 text-xs text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddToCard(uq.id)}
                              className="min-h-[44px] px-4 rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold hover:bg-[#E6CFA3] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Answer once</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Households */}
              <section className="glass-card p-6 sm:p-8">
                <div className="pb-4 border-b hairline-gold">
                  <h2 className="font-display text-2xl font-light text-[#F5EDE1] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#E6CFA3]" strokeWidth={1.5} />
                    <span>Households &amp; Personalized Invite Links</span>
                  </h2>
                  <p className="mt-1 text-xs text-[#F5EDE1]/65">
                    Links pre-fill family greetings and Elder Mode defaults for senior relatives.
                  </p>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b hairline-gold text-[11px] uppercase tracking-[0.14em] text-[#E6CFA3]">
                        <th className="py-2.5 pr-3 font-medium">Household</th>
                        <th className="py-2.5 px-2 font-medium">Code</th>
                        <th className="py-2.5 px-2 font-medium">Mode</th>
                        <th className="py-2.5 px-2 font-medium">Status</th>
                        <th className="py-2.5 pl-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#B8925A]/15">
                      {(data.households || []).map((h) => (
                        <tr key={h.code} className="hover:bg-[#B8925A]/5">
                          <td className="py-3 pr-3 font-medium text-[#F5EDE1]">
                            {h.family_name}
                          </td>
                          <td className="py-3 px-2 font-mono text-[#E6CFA3]">{h.code}</td>
                          <td className="py-3 px-2 text-[#F5EDE1]/70">
                            {h.preferred_language} · {h.age_band}
                          </td>
                          <td className="py-3 px-2 capitalize font-medium">
                            <span
                              className={
                                h.rsvp_status === "confirmed"
                                  ? "text-[#8FB39A]"
                                  : h.rsvp_status === "tentative"
                                    ? "text-[#E6CFA3]"
                                    : "text-[#C98A8A]"
                              }
                            >
                              {h.rsvp_status}
                              {h.headcount ? ` (${h.headcount})` : ""}
                            </span>
                          </td>
                          <td className="py-3 pl-2 text-right space-x-2 whitespace-nowrap">
                            {onOpenHousehold && (
                              <button
                                type="button"
                                onClick={() => onOpenHousehold(h.code)}
                                className="px-3 py-1.5 rounded-full border border-[#B8925A]/45 text-[#F5EDE1] hover:bg-[#B8925A]/15"
                              >
                                Preview Link
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void copyText(
                                  buildWhatsAppNudge(h),
                                  `Copied WhatsApp nudge for ${h.family_name} (${h.preferred_language}).`
                                )
                              }
                              className="px-3 py-1.5 rounded-full border border-[#B8925A]/30 bg-[#14050A]/65 text-[#E6CFA3] hover:bg-[#B8925A]/15"
                            >
                              Copy Nudge
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="lg:col-span-5 space-y-8">
              {/* Show Shop the look to guests toggle (Flagsmith shop_enabled) */}
              <section className="glass-card p-6 sm:p-8 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3] inline-flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Guest Wardrobe Discovery</span>
                    </p>
                    <h2 className="font-display text-2xl font-light text-[#F5EDE1]">
                      Show Shop the look to guests
                    </h2>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(data.shop_enabled)}
                    aria-label="Show Shop the look to guests"
                    disabled={shopToggleBusy}
                    onClick={handleToggleShop}
                    className={`min-h-[40px] px-4 rounded-full border text-xs font-mono uppercase tracking-[0.14em] transition-colors whitespace-nowrap shrink-0 ${
                      data.shop_enabled
                        ? "border-[#8FB39A] bg-[#8FB39A]/20 text-[#8FB39A] font-semibold"
                        : "border-[#B8925A]/45 bg-[#14050A]/75 text-[#E6CFA3] hover:bg-[#B8925A]/15"
                    }`}
                  >
                    {shopToggleBusy ? "Saving..." : data.shop_enabled ? "ON" : "OFF"}
                  </button>
                </div>

                <p className="text-xs text-[#F5EDE1]/75 leading-relaxed">
                  Displays curated buy &amp; rent looks matched to each ceremony&apos;s dress code on the Schedule, Wedding Card drawer, and a dedicated Shop tab. Concierge answers remain strictly grounded in the wedding card.
                </p>

                <div className="pt-3 border-t hairline-gold flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-[#E6CFA3]/90">
                    Flag: shop_enabled · Default OFF
                  </span>
                  <span className="text-[#F5EDE1]/65">
                    {data.flagsmith_unreachable
                      ? "Flagsmith unreachable — safe fallback OFF"
                      : "Safe fallback OFF if Flagsmith is unreachable"}
                  </span>
                </div>
              </section>

              {/* Show Travel & Local Pickup to guests toggle (Flagsmith travel_enabled) */}
              <section className="glass-card p-6 sm:p-8 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#E6CFA3] inline-flex items-center gap-1.5">
                      <Plane className="w-3.5 h-3.5" />
                      <span>Guest Travel &amp; Transfers</span>
                    </p>
                    <h2 className="font-display text-2xl font-light text-[#F5EDE1]">
                      Show Travel &amp; Local Pickup to guests
                    </h2>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(data.travel_enabled)}
                    aria-label="Show Travel & Local Pickup to guests"
                    disabled={travelToggleBusy}
                    onClick={handleToggleTravel}
                    className={`min-h-[40px] px-4 rounded-full border text-xs font-mono uppercase tracking-[0.14em] transition-colors whitespace-nowrap shrink-0 ${
                      data.travel_enabled
                        ? "border-[#8FB39A] bg-[#8FB39A]/20 text-[#8FB39A] font-semibold"
                        : "border-[#B8925A]/45 bg-[#14050A]/75 text-[#E6CFA3] hover:bg-[#B8925A]/15"
                    }`}
                  >
                    {travelToggleBusy ? "Saving..." : data.travel_enabled ? "ON" : "OFF"}
                  </button>
                </div>

                <p className="text-xs text-[#F5EDE1]/75 leading-relaxed">
                  Displays the Book Travel panel (redBus, ixigo, Skyscanner links via Flagsmith remote config) and local cab / tempo-traveller pickups on the guest page, plus a &ldquo;Book travel&rdquo; chip on concierge direction answers.
                </p>

                <div className="pt-3 border-t hairline-gold flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-[#E6CFA3]/90">
                    Flag: travel_enabled · Per wedding · Default OFF
                  </span>
                  <span className="text-[#F5EDE1]/65">
                    {data.flagsmith_unreachable
                      ? "Flagsmith unreachable — safe fallback OFF"
                      : "Safe fallback OFF if Flagsmith is unreachable"}
                  </span>
                </div>
              </section>

              <section className="glass-card p-6 sm:p-8">
                <h2 className="font-display text-2xl font-light text-[#F5EDE1]">
                  Voice Persona Experiment (<code className="font-mono text-sm text-[#E6CFA3]">exp_voice_persona</code>)
                </h2>
                <p className="mt-1.5 text-xs text-[#E6CFA3] font-medium">
                  {data.experiment.honest_reading}
                </p>
                <p className="mt-1 text-xs text-[#F5EDE1]/65">{data.experiment.flagsmith_note}</p>

                <div className="mt-4 divide-y divide-[#B8925A]/15 border border-[#B8925A]/20 rounded-xl bg-[#14050A]/55">
                  {(["formal", "warm"] as const).map((arm) => {
                    const m = data.experiment.arms[arm];
                    return (
                      <div key={arm} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[#F5EDE1] capitalize">
                            {arm} persona
                          </p>
                          <p className="text-xs text-[#F5EDE1]/65">
                            {arm === "formal"
                              ? "Respectful aap · Kore voice"
                              : "Family-style Hinglish · Puck voice"}
                          </p>
                        </div>
                        <div className="text-right font-mono text-xs tabular-nums">
                          <p className="text-[#E6CFA3] font-semibold">
                            {m.conversion_rate_pct}% conv
                          </p>
                          <p className="text-[#F5EDE1]/65">
                            {m.completions} / {m.exposures} gids (aband: {m.abandoned})
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="glass-card p-6 sm:p-8">
                <h2 className="font-display text-2xl font-light text-[#F5EDE1]">
                  Multilingual Host Broadcast
                </h2>
                <p className="mt-1 text-xs text-[#F5EDE1]/65">
                  Write in English; HaanJi translates to Hindi, Kannada, and Tamil for guest pages.
                </p>
                <form onSubmit={handleBroadcast} className="mt-4 space-y-3">
                  <textarea
                    rows={3}
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="e.g., Sangeet doors open at 7:15 PM; shuttle vans depart Taj MG Road at 6:45 PM."
                    className="w-full rounded-xl border border-[#B8925A]/35 bg-[#14050A]/80 p-3 text-sm text-[#F5EDE1] placeholder:text-[#F5EDE1]/40"
                  />
                  <button
                    type="submit"
                    disabled={broadcasting || !announcementText.trim()}
                    className="w-full min-h-[44px] rounded-full bg-[#F5EDE1] text-[#14050A] text-xs font-semibold uppercase tracking-[0.14em] hover:bg-[#E6CFA3] disabled:opacity-45 inline-flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{broadcasting ? "Translating & Broadcasting..." : "Broadcast to Guests"}</span>
                  </button>
                </form>

                {data.announcements.length > 0 && (
                  <div className="mt-4 pt-4 border-t hairline-gold space-y-2 text-xs">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#E6CFA3]">
                      Last sent translations
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 bg-[#14050A]/65 rounded-xl p-3.5 border border-[#B8925A]/20 text-[#F5EDE1]/85 indic-relaxed">
                      <p><strong>EN:</strong> {data.announcements[0].english}</p>
                      <p><strong>HI:</strong> {data.announcements[0].translations?.hi}</p>
                      <p><strong>KN:</strong> {data.announcements[0].translations?.kn}</p>
                      <p><strong>TA:</strong> {data.announcements[0].translations?.ta}</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
