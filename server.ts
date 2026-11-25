import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { createServer as createViteServer } from "vite";
import { alerter } from "./server/alerter.ts";
import { translateAnnouncement } from "./server/brain.ts";
import { capabilities } from "./server/capabilities.ts";
import {
  HOST_KEY,
  OPS_TOKEN,
  PERSONAS,
  SESSION_HMAC_SECRET,
  VALID_FUNCTION_IDS,
} from "./server/config.ts";
import { flags } from "./server/flags.ts";
import { sharedLimiter } from "./server/limiter.ts";
import { metrics } from "./server/metrics.ts";
import {
  createOpsRouter,
  getSanitizedOpsState,
  surgeController,
} from "./server/routes_ops.ts";
import { store } from "./server/store.ts";
import {
  runCausalLoopProof,
  runGoldenSetEvaluation,
  runTrackAUnitTests,
  runTrackBUnitTests,
} from "./server/tests/runner.ts";
import type {
  FunctionId,
  RsvpPatch,
  ShopGender,
  ShopProductType,
  TestCaseResult,
  VendorPlan,
} from "./server/types.ts";
import { AudioValidationError, worker } from "./server/worker.ts";

const PORT = Number(process.env.PORT || 3000);

function safeEqual(aStr: string, bStr: string): boolean {
  const a = Buffer.from(aStr, "utf8");
  const b = Buffer.from(bStr, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

let hostDeskLocked = false;
let hostSessionVersion = 1;
let claimedHostKeyRecord: { salt: string; hash: string } | null = null;

function hashHostKey(plain: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 32).toString("hex");
  return { salt, hash };
}

function verifyClaimedHostKey(plain: string, rec: { salt: string; hash: string }): boolean {
  const derived = crypto.scryptSync(plain, rec.salt, 32).toString("hex");
  return safeEqual(derived, rec.hash);
}

function hasEnvHostKey(): boolean {
  return Boolean(process.env.HAANJI_HOST_KEY?.trim());
}

function verifyHostKey(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  const envKey = process.env.HAANJI_HOST_KEY?.trim();
  if (envKey) {
    return safeEqual(trimmed, envKey);
  }
  if (claimedHostKeyRecord && verifyClaimedHostKey(trimmed, claimedHostKeyRecord)) {
    return true;
  }
  return safeEqual(trimmed, HOST_KEY);
}

function signHostCookie(): string {
  const payload = `host:v${hostSessionVersion}:${Date.now()}`;
  const sig = crypto
    .createHmac("sha256", SESSION_HMAC_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

function verifyHostCookie(cookieVal: string | undefined): boolean {
  if (!cookieVal) return false;
  const idx = cookieVal.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = cookieVal.slice(0, idx);
  const sig = cookieVal.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", SESSION_HMAC_SECRET)
    .update(payload)
    .digest("hex");
  if (!safeEqual(sig, expected)) return false;
  const match = /^host:v(\d+):(\d+)$/.exec(payload);
  if (!match) return false;
  const ver = Number(match[1]);
  const issuedAt = Number(match[2]);
  if (ver !== hostSessionVersion) return false;
  if (Date.now() - issuedAt > 24 * 60 * 60 * 1000) return false;
  return true;
}

function isHttpsRequest(req: express.Request): boolean {
  if (req.secure) return true;
  const proto = String(req.header("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  return proto === "https";
}

function setHostSessionCookie(req: express.Request, res: express.Response, token: string | null): void {
  const secureAttrs = isHttpsRequest(req)
    ? "Secure; SameSite=None; Partitioned"
    : "SameSite=Lax";
  if (token === null) {
    res.setHeader(
      "Set-Cookie",
      `haanji_host_session=; Path=/; HttpOnly; ${secureAttrs}; Max-Age=0`
    );
    return;
  }
  res.setHeader(
    "Set-Cookie",
    `haanji_host_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${secureAttrs}; Max-Age=86400`
  );
}

function checkSameOrigin(req: express.Request, res: express.Response): boolean {
  const origin = req.header("origin");
  if (!origin) return true;
  const expectedHost = (req.header("x-forwarded-host") || req.header("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  try {
    const parsedOrigin = new URL(origin);
    if (expectedHost && parsedOrigin.host.toLowerCase() === expectedHost) {
      return true;
    }
  } catch {
    // invalid origin
  }
  if (req.header("x-requested-with") === "fetch") {
    return true;
  }
  res.status(403).json({ error: "Cross-origin request blocked" });
  return false;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return out;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  alerter.startBackgroundLoop(5000);

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      service: "haanji",
      level: flags.degradationLevel(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/capabilities", async (req, res) => {
    try {
      const refresh = req.query.refresh === "1" || req.query.refresh === "true";
      const caps = await capabilities.getCapabilities(refresh);
      res.json(caps);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Guest Routes ---
  app.get("/api/card", (req, res) => {
    const gid = String(req.query.gid || "guest-anon");
    const hCode = req.query.h ? String(req.query.h) : null;
    const card = store.getCard();
    const level = flags.degradationLevel();
    // Triggers experiment exposure for non-load gids
    flags.persona(gid);
    const voiceRolloutIncluded = flags.isGuestInVoiceRollout(gid);
    const langParam = String(req.query.lang || "en-IN");
    const voicePaused =
      level > 0 || !flags.voiceReplyEnabled(langParam) || !voiceRolloutIncluded;

    let household = hCode ? store.getHousehold(hCode) : null;
    if (household && gid && !gid.startsWith("load-") && gid !== "drawer") {
      store.linkHouseholdToGid(household.code, gid);
    }

    const shopEnabled = flags.shopEnabled();
    const shopFeaturedSlot = flags.shopFeaturedSlotEnabled();
    const shopPlacement = flags.shopPlacement(gid, shopEnabled);
    const weddingId = card.wedding.id || "w_demo";
    const travelEnabled = flags.travelEnabled(weddingId);
    const travelModes = flags.travelModes();
    const travelProviders = flags.travelProviders();
    const travelFeaturedVendor = flags.travelFeaturedVendorEnabled();

    res.json({
      card,
      level,
      household,
      elder_mode_default: flags.elderModeDefault({
        age_band: household?.age_band,
      }),
      voice_rollout_included: voiceRolloutIncluded,
      voice_rollout_pct: flags.getVoiceRolloutState().pct,
      voice_paused: voicePaused,
      shop_enabled: shopEnabled,
      shop_featured_slot: shopFeaturedSlot,
      shop_placement: shopPlacement,
      travel_enabled: travelEnabled,
      travel_modes: travelModes,
      travel_providers: travelProviders,
      travel_featured_vendor: travelFeaturedVendor,
      rsvp: store.getRsvp(gid),
      announcements: store.getAnnouncements(),
    });
  });

  app.get("/api/travel", (req, res) => {
    const card = store.getCard();
    const weddingId = card.wedding.id || "w_demo";
    const pickupPoint = String(req.query.pickupPoint || "").trim();
    const travelEnabled = flags.travelEnabled(weddingId);
    const travelModes = flags.travelModes();
    const travelProviders = flags.travelProviders();
    const featuredFirst = flags.travelFeaturedVendorEnabled();
    const services = store.getTravelServices(
      {
        weddingId,
        pickupPoint: pickupPoint || undefined,
      },
      { featuredFirst }
    );

    res.json({
      wedding_id: weddingId,
      wedding_title: card.wedding.title,
      travel_enabled: travelEnabled,
      travel_modes: travelModes,
      travel_providers: travelProviders,
      travel_featured_vendor: featuredFirst,
      travel: card.travel ?? null,
      services,
    });
  });

  app.get("/api/shop", (req, res) => {
    const fnRaw = String(req.query.function || req.query.fn || "").trim().toLowerCase();
    const typeRaw = String(req.query.type || "").trim().toLowerCase();
    const genderRaw = String(req.query.gender || "").trim().toLowerCase();
    const gid = String(req.query.gid || "").trim();

    if (fnRaw && !VALID_FUNCTION_IDS.includes(fnRaw as FunctionId)) {
      res.status(400).json({ error: `Invalid function filter: ${fnRaw}` });
      return;
    }
    if (typeRaw && typeRaw !== "buy" && typeRaw !== "rent") {
      res.status(400).json({ error: `Invalid type filter: ${typeRaw}` });
      return;
    }
    if (genderRaw && genderRaw !== "women" && genderRaw !== "men" && genderRaw !== "unisex") {
      res.status(400).json({ error: `Invalid gender filter: ${genderRaw}` });
      return;
    }

    const card = store.getCard();
    const shopEnabled = flags.shopEnabled();
    const featuredFirst = flags.shopFeaturedSlotEnabled();
    const placementArm = gid ? flags.shopPlacement(gid, shopEnabled) : "inline";
    const products = store.getShopProducts(
      {
        fn: fnRaw ? (fnRaw as FunctionId) : undefined,
        type: typeRaw ? (typeRaw as ShopProductType) : undefined,
        gender: genderRaw ? (genderRaw as ShopGender) : undefined,
        weddingId: card.wedding.id,
      },
      { featuredFirst }
    );

    res.json({
      shop_enabled: shopEnabled,
      shop_featured_slot: featuredFirst,
      placement_arm: placementArm,
      wedding_id: card.wedding.id,
      wedding_title: card.wedding.title,
      products,
    });
  });

  app.post("/api/shop/click", (req, res) => {
    const { gid, productId, action } = (req.body || {}) as {
      gid?: string;
      productId?: string;
      action?: string;
    };
    const guestId = (gid || "").trim() || `anon-${Date.now()}`;
    const tracked = flags.trackShopClick(
      guestId,
      `${action || "click"}${productId ? `:${productId}` : ""}`
    );
    res.json({
      ok: true,
      ...tracked,
      summary: flags.getShopExperimentSummary(),
    });
  });

  app.post("/api/turn", (req, res) => {
    try {
      const body = req.body as {
        gid?: string;
        householdCode?: string;
        text?: string;
        audioBase64?: string;
        audioMime?: string;
        audioBytes?: number;
        audioDurationSeconds?: number;
        languageHint?: string;
        executionMode?: "live" | "replay";
      };
      const gid = (body.gid || "").trim() || `anon-${Date.now()}`;
      if (!body.text && !body.audioBase64) {
        res.status(400).json({ error: "Either text or audioBase64 is required." });
        return;
      }
      const queued = worker.enqueueTurn({
        gid,
        householdCode: body.householdCode,
        text: body.text,
        audioBase64: body.audioBase64,
        audioMime: body.audioMime,
        audioBytes: body.audioBytes,
        audioDurationSeconds: body.audioDurationSeconds,
        languageHint: body.languageHint,
        executionMode: body.executionMode || "live",
      });
      res.json(queued);
    } catch (err) {
      if (err instanceof AudioValidationError) {
        res.status(413).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/turn/:jobId", (req, res) => {
    const job = worker.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  app.get("/api/rsvp/:gid", (req, res) => {
    res.json({ rsvp: store.getRsvp(req.params.gid) });
  });

  app.post("/api/rsvp/:gid", (req, res) => {
    try {
      const patch = req.body as RsvpPatch & { householdCode?: string };
      const result = store.applyRsvpPatch(req.params.gid, patch, {
        confirmed: true,
        householdCode: patch.householdCode,
      });
      if (result.becameCompleteFirstTime) {
        flags.trackRsvpCompleted(req.params.gid);
      }
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/rsvp/:gid/confirm", (req, res) => {
    const result = store.confirmRsvp(req.params.gid);
    if (!result) {
      res.status(404).json({ error: "No pending RSVP found for guest." });
      return;
    }
    if (result.becameCompleteFirstTime) {
      flags.trackRsvpCompleted(req.params.gid);
    }
    res.json(result);
  });

  // --- Judge Mode Public Read-Only Telemetry ---
  app.get("/api/judge/state", (_req, res) => {
    const ops = getSanitizedOpsState();
    res.json({
      counters: store.getJudgeCounters(),
      caterer: store.getCatererSummary(),
      level: ops.level,
      rpm_60s: ops.rpm_60s,
      rate429_pct_60s: ops.rate429_pct_60s,
      timeseries: ops.timeseries,
      alerter_status: ops.alerter.status,
      scale_comparison: ops.scale_comparison,
      flags_map: ops.flags_map,
    });
  });

  // --- Host Routes (unlocked by default; locking enforces constant-time/scrypt HOST_KEY or signed session) ---
  function checkHostAuth(req: express.Request, res: express.Response): boolean {
    if (req.method !== "GET" && req.method !== "HEAD" && !checkSameOrigin(req, res)) {
      return false;
    }
    const key = String(req.query.k || req.header("x-host-key") || "").trim();
    if (key) {
      if (verifyHostKey(key)) {
        return true;
      }
      res.status(403).json({ error: "Forbidden: invalid host key", locked: hostDeskLocked });
      return false;
    }
    if (!hostDeskLocked) {
      return true;
    }
    const authHeader = String(req.header("authorization") || "");
    if (authHeader.startsWith("Bearer ")) {
      const bearerToken = authHeader.slice(7).trim();
      if (verifyHostCookie(bearerToken)) {
        return true;
      }
    }
    const cookies = parseCookies(req.header("cookie"));
    if (verifyHostCookie(cookies.haanji_host_session)) {
      return true;
    }
    res.status(403).json({
      error: "Host Desk is locked. Enter your Host Key to unlock.",
      locked: true,
    });
    return false;
  }

  // Lock the Host Desk using the configured HAANJI_HOST_KEY (or claim & scrypt-hash on first lock)
  app.post("/api/host/lock", (req, res) => {
    if (!checkSameOrigin(req, res)) return;
    const suppliedKey = String((req.body as { key?: string })?.key || "").trim();
    if (!suppliedKey) {
      res.status(400).json({ error: "Enter a Host Key to lock the Host Desk" });
      return;
    }
    if (hasEnvHostKey()) {
      if (!verifyHostKey(suppliedKey)) {
        res.status(403).json({ error: "Invalid host key" });
        return;
      }
    } else if (claimedHostKeyRecord) {
      if (!verifyClaimedHostKey(suppliedKey, claimedHostKeyRecord)) {
        res.status(403).json({ error: "Invalid host key" });
        return;
      }
    } else {
      if (suppliedKey.length < 8) {
        res.status(400).json({ error: "Host key must be at least 8 characters" });
        return;
      }
      claimedHostKeyRecord = hashHostKey(suppliedKey);
    }
    hostDeskLocked = true;
    hostSessionVersion += 1;
    setHostSessionCookie(req, res, null);
    res.json({ ok: true, locked: true });
  });

  // Unlock the Host Desk with valid Host Key: unlocks desk and issues signed session token + HttpOnly cookie
  app.post("/api/host/unlock", (req, res) => {
    if (!checkSameOrigin(req, res)) return;
    const suppliedKey = String((req.body as { key?: string })?.key || "").trim();
    if (!suppliedKey) {
      res.status(403).json({ error: "Host key required" });
      return;
    }
    if (!verifyHostKey(suppliedKey)) {
      res.status(403).json({ error: "Invalid host key" });
      return;
    }
    hostDeskLocked = false;
    const token = signHostCookie();
    setHostSessionCookie(req, res, token);
    res.json({ ok: true, locked: false, token });
  });

  app.get("/api/host/state", (req, res) => {
    if (!checkHostAuth(req, res)) return;
    const ops = getSanitizedOpsState();
    const card = store.getCard();
    const weddingId = card.wedding.id || "w_demo";
    res.json({
      caterer: store.getCatererSummary(),
      arrivals: store.getArrivalsSummary(),
      rsvps: store.getAllRsvps(),
      households: store.getAllHouseholds(),
      unanswered: store.getUnanswered(),
      experiment: flags.getExperimentSummary(),
      shop_enabled: flags.shopEnabled(),
      shop_featured_slot: flags.shopFeaturedSlotEnabled(),
      shop_experiment: flags.getShopExperimentSummary(),
      travel_enabled: flags.travelEnabled(weddingId),
      travel_modes: flags.travelModes(),
      travel_featured_vendor: flags.travelFeaturedVendorEnabled(),
      flagsmith_unreachable: flags.isUnreachable(),
      host_desk_locked: hostDeskLocked,
      host_key_configured: hasEnvHostKey() || Boolean(claimedHostKeyRecord),
      card,
      announcements: store.getAnnouncements(),
      ops_chip: {
        level: ops.level,
        rpm_60s: ops.rpm_60s,
        sarvam_429_last_60s: ops.sarvam_429_last_60s,
        rate429_pct_60s: ops.rate429_pct_60s,
        alerter_status: ops.alerter.status,
      },
    });
  });

  app.post("/api/host/shop-toggle", (req, res) => {
    if (!checkHostAuth(req, res)) return;
    const enabled = Boolean((req.body as { enabled?: boolean })?.enabled);
    flags.setShopEnabled(enabled, "host");
    res.json({
      ok: true,
      shop_enabled: flags.shopEnabled(),
      flagsmith_unreachable: flags.isUnreachable(),
    });
  });

  app.post("/api/host/travel-toggle", (req, res) => {
    if (!checkHostAuth(req, res)) return;
    const enabled = Boolean((req.body as { enabled?: boolean })?.enabled);
    const weddingId = store.getCard().wedding.id || "w_demo";
    flags.setTravelEnabled(enabled, weddingId, "host");
    res.json({
      ok: true,
      wedding_id: weddingId,
      travel_enabled: flags.travelEnabled(weddingId),
      flagsmith_unreachable: flags.isUnreachable(),
    });
  });

  app.get("/api/host/arrivals/csv", (req, res) => {
    if (!checkHostAuth(req, res)) return;
    const arrivals = store.getArrivalsSummary();
    const escapeCsv = (val: string | number | null | undefined) => {
      const s = String(val ?? "");
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return JSON.stringify(safe);
    };
    const lines = [
      "arrival_date,arrival_point,arrival_time,travel_mode,household,headcount,confirmed,gid",
      ...arrivals.groups.flatMap((g) =>
        g.parties.map((p) =>
          [
            escapeCsv(g.arrival_date),
            escapeCsv(g.arrival_point),
            escapeCsv(p.arrival_time || ""),
            escapeCsv(p.travel_mode || ""),
            escapeCsv(p.household),
            p.headcount,
            p.confirmed ? "yes" : "pending",
            escapeCsv(p.gid),
          ].join(",")
        )
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="haanji-arrivals.csv"');
    res.send(lines.join("\n"));
  });

  app.get("/api/host/csv/:fnId", (req, res) => {
    if (!checkHostAuth(req, res)) return;
    const fnId = req.params.fnId as FunctionId;
    const rows = store
      .getAllRsvps()
      .filter((r) => r.attending !== false && r.functions.includes(fnId));
    const lines = [
      "gid,household,headcount,veg,jain,nonveg,no_onion_garlic,needs_room,confirmed",
      ...rows.map((r) =>
        [
          r.gid,
          JSON.stringify(r.household_name || r.household_code || "Walk-in"),
          r.headcount ?? `${r.headcount_range?.[0]}-${r.headcount_range?.[1]}`,
          r.diet.veg,
          r.diet.jain,
          r.diet.nonveg,
          r.diet.no_onion_garlic,
          r.needs_room ? "yes" : "no",
          r.confirmed ? "yes" : "pending",
        ].join(",")
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="haanji-${fnId}.csv"`);
    res.send(lines.join("\n"));
  });

  app.post("/api/host/add-to-card", (req, res) => {
    if (!checkHostAuth(req, res)) return;
    const { id, answer } = req.body as { id?: string; answer?: string };
    if (!id || !answer?.trim()) {
      res.status(400).json({ error: "id and answer are required" });
      return;
    }
    const updated = store.resolveUnansweredAndAddToCard(id, answer.trim());
    if (!updated) {
      res.status(404).json({ error: "Unanswered question not found" });
      return;
    }
    res.json({ ok: true, item: updated, faqs: store.getCard().faqs });
  });

  app.post("/api/host/announcement", async (req, res) => {
    if (!checkHostAuth(req, res)) return;
    const { text } = req.body as { text?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: "Announcement text is required" });
      return;
    }
    try {
      const translations = await translateAnnouncement(text.trim());
      const ann = store.addAnnouncement(text.trim(), translations, {
        sender_name: "Sharma & Reddy Family",
        sender_type: "host",
      });
      res.json({ ok: true, announcement: ann });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Partner Routes (HaanJi for Business at /partner) ---
  async function buildPartnerState(vendorId: string) {
    const vendor = store.getVendor(vendorId);
    if (!vendor) return null;

    const flagEval = await flags.flagsForVendor(vendor.id, {
      business_type: vendor.business_type,
      plan: vendor.plan,
    });
    const card = store.getCard();
    const confirmedCaterer = store.getConfirmedOnlyCatererSummary();
    const linkedWeddings = [
      {
        id: card.wedding.id,
        title: card.wedding.title,
        subtitle: card.wedding.subtitle,
        dates: card.wedding.dates,
        city: card.wedding.city,
        status: "active" as const,
        confirmed_parties: confirmedCaterer.confirmed_parties,
      },
      ...(flagEval.flags.b2b_multi_wedding
        ? [
            {
              id: "w_kapoor_dec",
              title: "Kapoor & Nair Celebration",
              subtitle: "Rohan & Meera · Mysuru",
              dates: "12–13 December 2026",
              city: "Mysuru, Karnataka",
              status: "upcoming" as const,
              confirmed_parties: 24,
            },
            {
              id: "w_iyer_jan",
              title: "Subramanian & Rao Wedding",
              subtitle: "Vikram & Divya · Bengaluru",
              dates: "16–17 January 2027",
              city: "Bengaluru, Karnataka",
              status: "upcoming" as const,
              confirmed_parties: 18,
            },
          ]
        : []),
    ];

    const featuredFirst = flags.shopFeaturedSlotEnabled();
    const travelFeaturedFirst = flags.travelFeaturedVendorEnabled();
    return {
      vendor,
      flag_evaluation: flagEval,
      caterer: flagEval.flags.b2b_live_headcount ? confirmedCaterer : null,
      card,
      announcements: store.getAnnouncements(),
      weddings: linkedWeddings,
      shop_featured_slot: featuredFirst,
      products: store.getShopProducts({ vendorId: vendor.id }, { featuredFirst }),
      travel_featured_vendor: travelFeaturedFirst,
      travel_services: store.getTravelServices(
        { vendorId: vendor.id },
        { featuredFirst: travelFeaturedFirst }
      ),
    };
  }

  app.get("/api/partner/vendors", (_req, res) => {
    res.json({
      wedding_id: store.getCard().wedding.id,
      wedding_title: store.getCard().wedding.title,
      vendors: store.getVendors(),
    });
  });

  app.get("/api/partner/state", async (req, res) => {
    const vendorId = String(req.query.vendorId || "").trim();
    if (!vendorId) {
      res.status(400).json({ error: "vendorId query parameter is required" });
      return;
    }
    try {
      const payload = await buildPartnerState(vendorId);
      if (!payload) {
        res.status(404).json({ error: "Partner business not found" });
        return;
      }
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/partner/plan", async (req, res) => {
    const { vendorId, plan } = (req.body || {}) as {
      vendorId?: string;
      plan?: string;
    };
    if (!vendorId || (plan !== "free" && plan !== "pro")) {
      res.status(400).json({ error: "vendorId and plan ('free' | 'pro') are required" });
      return;
    }
    const updated = store.setVendorPlan(vendorId, plan as VendorPlan);
    if (!updated) {
      res.status(404).json({ error: "Partner business not found" });
      return;
    }
    try {
      const payload = await buildPartnerState(vendorId);
      res.json({ ok: true, ...payload });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/partner/broadcast", async (req, res) => {
    const { vendorId, text } = (req.body || {}) as {
      vendorId?: string;
      text?: string;
    };
    if (!vendorId || !text?.trim()) {
      res.status(400).json({ error: "vendorId and broadcast text are required" });
      return;
    }
    const vendor = store.getVendor(vendorId);
    if (!vendor) {
      res.status(404).json({ error: "Partner business not found" });
      return;
    }
    try {
      const flagEval = await flags.flagsForVendor(vendor.id, {
        business_type: vendor.business_type,
        plan: vendor.plan,
      });
      if (!flagEval.flags.b2b_vendor_broadcast) {
        res.status(403).json({
          error: "Vendor broadcast requires the b2b_vendor_broadcast Pro flag.",
        });
        return;
      }
      const trimmed = text.trim().slice(0, 320);
      const translations = await translateAnnouncement(trimmed);
      const ann = store.addAnnouncement(trimmed, translations, {
        sender_name: vendor.name,
        sender_type: vendor.business_type,
      });
      res.json({ ok: true, announcement: ann, announcements: store.getAnnouncements() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/partner/csv/:fnId", async (req, res) => {
    const vendorId = String(req.query.vendorId || "").trim();
    const fnId = req.params.fnId as FunctionId;
    if (!vendorId) {
      res.status(400).json({ error: "vendorId query parameter is required" });
      return;
    }
    if (!VALID_FUNCTION_IDS.includes(fnId)) {
      res.status(400).json({ error: "Invalid wedding function ID" });
      return;
    }
    const vendor = store.getVendor(vendorId);
    if (!vendor) {
      res.status(404).json({ error: "Partner business not found" });
      return;
    }
    const flagEval = await flags.flagsForVendor(vendor.id, {
      business_type: vendor.business_type,
      plan: vendor.plan,
    });
    if (!flagEval.flags.b2b_csv_export) {
      res.status(403).json({ error: "CSV export requires the b2b_csv_export Pro flag." });
      return;
    }
    const rows = store
      .getAllRsvps()
      .filter((r) => r.confirmed && r.attending !== false && r.functions.includes(fnId));
    const lines = [
      "gid,household,headcount,veg,jain,nonveg,no_onion_garlic,needs_room,confirmed",
      ...rows.map((r) =>
        [
          r.gid,
          JSON.stringify(r.household_name || r.household_code || "Walk-in"),
          r.headcount ?? 0,
          r.diet.veg,
          r.diet.jain,
          r.diet.nonveg,
          r.diet.no_onion_garlic,
          r.needs_room ? "yes" : "no",
          "yes",
        ].join(",")
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="haanji-partner-${fnId}.csv"`
    );
    res.send(lines.join("\n"));
  });

  function isSafeExternalUrl(url: string): boolean {
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  function isSafeImagePath(img: string): boolean {
    const trimmed = img.trim();
    if (!trimmed) return true;
    if (trimmed.startsWith("/assets/")) return true;
    return isSafeExternalUrl(trimmed);
  }

  app.get("/api/partner/products", (req, res) => {
    const vendorId = String(req.query.vendorId || "").trim();
    if (!vendorId) {
      res.status(400).json({ error: "vendorId query parameter is required" });
      return;
    }
    const vendor = store.getVendor(vendorId);
    if (!vendor) {
      res.status(404).json({ error: "Partner business not found" });
      return;
    }
    const featuredFirst = flags.shopFeaturedSlotEnabled();
    res.json({
      vendor_id: vendor.id,
      shop_featured_slot: featuredFirst,
      products: store.getShopProducts({ vendorId: vendor.id }, { featuredFirst }),
    });
  });

  app.post("/api/partner/products", (req, res) => {
    const body = (req.body || {}) as {
      vendorId?: string;
      name?: string;
      image?: string;
      price_inr?: number;
      type?: ShopProductType;
      function_ids?: FunctionId[];
      colour_tags?: string[];
      gender?: ShopGender;
      buy_url?: string;
      whatsapp_number?: string;
      delivers_by?: string;
    };
    const vendorId = (body.vendorId || "").trim();
    if (!vendorId || !body.name?.trim()) {
      res.status(400).json({ error: "vendorId and product name are required" });
      return;
    }
    const vendor = store.getVendor(vendorId);
    if (!vendor) {
      res.status(404).json({ error: "Partner business not found" });
      return;
    }
    const buyUrl = (body.buy_url || "").trim();
    if (!buyUrl || !isSafeExternalUrl(buyUrl)) {
      res.status(400).json({ error: "A valid http(s) buy_url is required" });
      return;
    }
    if (body.image && !isSafeImagePath(body.image)) {
      res.status(400).json({ error: "Image must be an /assets/... path or http(s) URL" });
      return;
    }
    const price = Number(body.price_inr);
    if (!Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: "price_inr must be a positive number" });
      return;
    }
    const fnIds = Array.isArray(body.function_ids)
      ? body.function_ids.filter((f): f is FunctionId => VALID_FUNCTION_IDS.includes(f))
      : [];
    if (fnIds.length === 0) {
      res.status(400).json({ error: "Select at least one wedding function" });
      return;
    }
    const whatsappDigits = String(body.whatsapp_number || "").replace(/[^\d]/g, "");
    if (whatsappDigits.length < 10) {
      res.status(400).json({ error: "Enter a valid WhatsApp number with country code (e.g. 919845011221)" });
      return;
    }
    const colourTags = Array.isArray(body.colour_tags)
      ? body.colour_tags.map((t) => String(t).trim()).filter(Boolean)
      : [];

    const created = store.createShopProduct(vendorId, {
      name: body.name.trim(),
      image: body.image?.trim() || "/assets/shop/mehendi-anarkali.webp",
      price_inr: price,
      type: body.type === "rent" ? "rent" : "buy",
      function_ids: fnIds,
      colour_tags: colourTags,
      gender: body.gender === "men" || body.gender === "unisex" ? body.gender : "women",
      buy_url: buyUrl,
      whatsapp_number: whatsappDigits,
      delivers_by: (body.delivers_by || "").trim() || "26 Nov 2026",
    });
    const featuredFirst = flags.shopFeaturedSlotEnabled();
    res.status(201).json({
      ok: true,
      product: created,
      products: store.getShopProducts({ vendorId }, { featuredFirst }),
    });
  });

  app.put("/api/partner/products/:productId", (req, res) => {
    const productId = req.params.productId;
    const body = (req.body || {}) as {
      vendorId?: string;
      name?: string;
      image?: string;
      price_inr?: number;
      type?: ShopProductType;
      function_ids?: FunctionId[];
      colour_tags?: string[];
      gender?: ShopGender;
      buy_url?: string;
      whatsapp_number?: string;
      delivers_by?: string;
    };
    const vendorId = (body.vendorId || "").trim();
    if (!vendorId) {
      res.status(400).json({ error: "vendorId is required" });
      return;
    }
    if (body.buy_url !== undefined && !isSafeExternalUrl(body.buy_url)) {
      res.status(400).json({ error: "buy_url must be a valid http(s) URL" });
      return;
    }
    if (body.image !== undefined && !isSafeImagePath(body.image)) {
      res.status(400).json({ error: "Image must be an /assets/... path or http(s) URL" });
      return;
    }
    if (body.price_inr !== undefined) {
      const p = Number(body.price_inr);
      if (!Number.isFinite(p) || p <= 0) {
        res.status(400).json({ error: "price_inr must be a positive number" });
        return;
      }
    }
    if (body.whatsapp_number !== undefined) {
      const digits = String(body.whatsapp_number).replace(/[^\d]/g, "");
      if (digits.length < 10) {
        res.status(400).json({ error: "Enter a valid WhatsApp number with country code" });
        return;
      }
    }
    const updated = store.updateShopProduct(productId, vendorId, {
      name: body.name,
      image: body.image,
      price_inr: body.price_inr,
      type: body.type,
      function_ids: body.function_ids,
      colour_tags: body.colour_tags,
      gender: body.gender,
      buy_url: body.buy_url,
      whatsapp_number: body.whatsapp_number,
      delivers_by: body.delivers_by,
    });
    if (!updated) {
      res.status(404).json({ error: "Product not found for this partner" });
      return;
    }
    const featuredFirst = flags.shopFeaturedSlotEnabled();
    res.json({
      ok: true,
      product: updated,
      products: store.getShopProducts({ vendorId }, { featuredFirst }),
    });
  });

  app.get("/api/partner/travel-services", (req, res) => {
    const vendorId = String(req.query.vendorId || "").trim();
    if (!vendorId) {
      res.status(400).json({ error: "vendorId query parameter is required" });
      return;
    }
    const vendor = store.getVendor(vendorId);
    if (!vendor) {
      res.status(404).json({ error: "Partner business not found" });
      return;
    }
    const featuredFirst = flags.travelFeaturedVendorEnabled();
    res.json({
      vendor_id: vendor.id,
      travel_featured_vendor: featuredFirst,
      services: store.getTravelServices({ vendorId: vendor.id }, { featuredFirst }),
    });
  });

  app.post("/api/partner/travel-services", (req, res) => {
    const body = (req.body || {}) as {
      vendorId?: string;
      name?: string;
      vehicle?: string;
      seats?: number;
      price_inr?: number;
      pickup_points?: string[];
      whatsapp_number?: string;
    };
    const vendorId = (body.vendorId || "").trim();
    if (!vendorId || !body.name?.trim() || !body.vehicle?.trim()) {
      res.status(400).json({ error: "vendorId, service name, and vehicle are required" });
      return;
    }
    const vendor = store.getVendor(vendorId);
    if (!vendor) {
      res.status(404).json({ error: "Partner business not found" });
      return;
    }
    const seats = Number(body.seats);
    if (!Number.isFinite(seats) || seats < 1 || seats > 60) {
      res.status(400).json({ error: "seats must be between 1 and 60" });
      return;
    }
    const price = Number(body.price_inr);
    if (!Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: "price_inr must be a positive number" });
      return;
    }
    const pickupPoints = Array.isArray(body.pickup_points)
      ? body.pickup_points.map((p) => String(p).trim()).filter(Boolean)
      : [];
    if (pickupPoints.length === 0) {
      res.status(400).json({ error: "Specify at least one pickup point" });
      return;
    }
    const whatsappDigits = String(body.whatsapp_number || "").replace(/[^\d]/g, "");
    if (whatsappDigits.length < 10) {
      res.status(400).json({
        error: "Enter a valid WhatsApp number with country code (e.g. 919845077881)",
      });
      return;
    }

    const created = store.createTravelService(vendorId, {
      name: body.name.trim(),
      vehicle: body.vehicle.trim(),
      seats,
      price_inr: price,
      pickup_points: pickupPoints,
      whatsapp_number: whatsappDigits,
    });
    const featuredFirst = flags.travelFeaturedVendorEnabled();
    res.status(201).json({
      ok: true,
      service: created,
      services: store.getTravelServices({ vendorId }, { featuredFirst }),
    });
  });

  app.put("/api/partner/travel-services/:serviceId", (req, res) => {
    const serviceId = req.params.serviceId;
    const body = (req.body || {}) as {
      vendorId?: string;
      name?: string;
      vehicle?: string;
      seats?: number;
      price_inr?: number;
      pickup_points?: string[];
      whatsapp_number?: string;
    };
    const vendorId = (body.vendorId || "").trim();
    if (!vendorId) {
      res.status(400).json({ error: "vendorId is required" });
      return;
    }
    if (body.seats !== undefined) {
      const s = Number(body.seats);
      if (!Number.isFinite(s) || s < 1 || s > 60) {
        res.status(400).json({ error: "seats must be between 1 and 60" });
        return;
      }
    }
    if (body.price_inr !== undefined) {
      const p = Number(body.price_inr);
      if (!Number.isFinite(p) || p <= 0) {
        res.status(400).json({ error: "price_inr must be a positive number" });
        return;
      }
    }
    if (body.whatsapp_number !== undefined) {
      const digits = String(body.whatsapp_number).replace(/[^\d]/g, "");
      if (digits.length < 10) {
        res.status(400).json({ error: "Enter a valid WhatsApp number with country code" });
        return;
      }
    }
    const updated = store.updateTravelService(serviceId, vendorId, {
      name: body.name,
      vehicle: body.vehicle,
      seats: body.seats,
      price_inr: body.price_inr,
      pickup_points: body.pickup_points,
      whatsapp_number: body.whatsapp_number,
    });
    if (!updated) {
      res.status(404).json({ error: "Travel service not found for this partner" });
      return;
    }
    const featuredFirst = flags.travelFeaturedVendorEnabled();
    res.json({
      ok: true,
      service: updated,
      services: store.getTravelServices({ vendorId }, { featuredFirst }),
    });
  });

  // --- Ops Routes (/ops/* requires X-Ops-Token except /ops/metrics) ---
  app.use("/ops", createOpsRouter());
  app.get("/metrics", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(metrics.exportPrometheusText());
  });

  // Server-side Ops Proxy for the in-app Ops Control Plane UI (keeps OPS_TOKEN off client)
  app.get("/api/ops-proxy/state", (_req, res) => {
    res.json({
      ...getSanitizedOpsState(),
      voice_reply: {
        "hi-IN": flags.voiceReplyEnabled("hi-IN"),
        "en-IN": flags.voiceReplyEnabled("en-IN"),
        "kn-IN": flags.voiceReplyEnabled("kn-IN"),
        "ta-IN": flags.voiceReplyEnabled("ta-IN"),
      },
    });
  });

  app.post("/api/ops-proxy/degrade", (req, res) => {
    try {
      const { level, rpm_budget, actor, reason } = req.body as {
        level?: number;
        rpm_budget?: number | null;
        actor?: string;
        reason?: string;
      };
      const out = flags.adminSetDegradation(
        Number(level ?? 0),
        rpm_budget === undefined ? null : rpm_budget,
        actor || "ops_ui",
        reason || "Manual control plane override"
      );
      res.json({ ok: true, ...out, state: getSanitizedOpsState() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/ops-proxy/surge", (req, res) => {
    try {
      const { rate_per_min, seconds } = (req.body || {}) as {
        rate_per_min?: number;
        seconds?: number;
      };
      const surge = surgeController.start(
        Number(rate_per_min || 100),
        Number(seconds || 180)
      );
      res.json({ ok: true, surge });
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status || 500;
      res.status(code).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/ops-proxy/surge/stop", (_req, res) => {
    res.json({ ok: true, surge: surgeController.stop() });
  });

  app.post("/api/ops-proxy/approve", (req, res) => {
    const { workflow_id, approver } = (req.body || {}) as {
      workflow_id?: string;
      approver?: string;
    };
    if (!workflow_id) {
      res.status(400).json({ error: "workflow_id required" });
      return;
    }
    try {
      const wf = alerter.approveWorkflow(workflow_id, approver || "priya.sharma@haanji.in");
      res.json({ ok: true, workflow: wf, state: getSanitizedOpsState() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/ops-proxy/reject", (req, res) => {
    const { workflow_id, actor } = (req.body || {}) as {
      workflow_id?: string;
      actor?: string;
    };
    if (!workflow_id) {
      res.status(400).json({ error: "workflow_id required" });
      return;
    }
    try {
      const wf = alerter.rejectWorkflow(workflow_id, actor || "priya.sharma@haanji.in");
      res.json({ ok: true, workflow: wf, state: getSanitizedOpsState() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/ops-proxy/simulate-outage", (req, res) => {
    flags.setUnreachable(Boolean((req.body as { unreachable?: boolean })?.unreachable));
    res.json({ ok: true, flagsmith_unreachable: flags.isUnreachable() });
  });

  app.post("/api/ops-proxy/dead-webhook", (req, res) => {
    alerter.setDeadWebhookMode(Boolean((req.body as { dead?: boolean })?.dead));
    res.json({ ok: true, dead_webhook_mode: alerter.isDeadWebhookMode() });
  });

  app.post("/api/ops-proxy/voice-toggle", (req, res) => {
    const { language, enabled } = req.body as { language?: string; enabled?: boolean };
    if (!language) {
      res.status(400).json({ error: "language required" });
      return;
    }
    flags.setVoiceReplyForLang(language, Boolean(enabled));
    res.json({ ok: true, language, enabled: Boolean(enabled) });
  });

  app.post("/api/ops-proxy/elder-default", (req, res) => {
    flags.setElderModeDefault(Boolean((req.body as { enabled?: boolean })?.enabled));
    res.json({ ok: true, rel_elder_mode_default: flags.elderModeDefault() });
  });

  app.post("/api/ops-proxy/voice-rollout", (req, res) => {
    const pct = Number((req.body as { pct?: number })?.pct ?? 100);
    const updated = flags.setVoiceRolloutPct(pct);
    res.json({ ok: true, pct: updated, state: getSanitizedOpsState() });
  });

  app.post("/api/ops-proxy/shop-toggle", (req, res) => {
    const enabled = Boolean((req.body as { enabled?: boolean })?.enabled);
    flags.setShopEnabled(enabled, "ops_ui");
    res.json({ ok: true, shop_enabled: flags.shopEnabled(), state: getSanitizedOpsState() });
  });

  app.post("/api/ops-proxy/shop-featured-toggle", (req, res) => {
    const enabled = Boolean((req.body as { enabled?: boolean })?.enabled);
    flags.setShopFeaturedSlot(enabled);
    res.json({
      ok: true,
      shop_featured_slot: flags.shopFeaturedSlotEnabled(),
      state: getSanitizedOpsState(),
    });
  });

  app.post("/api/ops-proxy/travel-toggle", (req, res) => {
    const { enabled, weddingId } = (req.body || {}) as {
      enabled?: boolean;
      weddingId?: string;
    };
    const wid = (weddingId || "w_demo").trim() || "w_demo";
    flags.setTravelEnabled(Boolean(enabled), wid, "ops_ui");
    res.json({
      ok: true,
      wedding_id: wid,
      travel_enabled: flags.travelEnabled(wid),
      state: getSanitizedOpsState(),
    });
  });

  app.post("/api/ops-proxy/travel-mode-toggle", (req, res) => {
    const { mode, enabled } = (req.body || {}) as {
      mode?: string;
      enabled?: boolean;
    };
    if (mode !== "bus" && mode !== "train" && mode !== "flight") {
      res.status(400).json({ error: "mode must be 'bus', 'train', or 'flight'" });
      return;
    }
    const travel_modes = flags.setTravelMode(mode, Boolean(enabled));
    res.json({ ok: true, travel_modes, state: getSanitizedOpsState() });
  });

  app.post("/api/ops-proxy/travel-featured-toggle", (req, res) => {
    const enabled = Boolean((req.body as { enabled?: boolean })?.enabled);
    flags.setTravelFeaturedVendor(enabled);
    res.json({
      ok: true,
      travel_featured_vendor: flags.travelFeaturedVendorEnabled(),
      state: getSanitizedOpsState(),
    });
  });

  app.post("/api/ops-proxy/travel-providers", (req, res) => {
    const travel_providers = flags.setTravelProviders(req.body || {});
    res.json({ ok: true, travel_providers, state: getSanitizedOpsState() });
  });

  app.post("/api/ops-proxy/sync-flags", async (_req, res) => {
    const syncRes = await flags.syncFromFlagsmith();
    capabilities.invalidateCache();
    res.json({ ok: true, ...syncRes, state: getSanitizedOpsState() });
  });

  app.post("/api/ops-proxy/muhurat-demo", (_req, res) => {
    const demo = surgeController.startMuhuratDemo();
    res.json({
      ok: true,
      flagsmith_before: demo.flagsmith_before,
      surge: demo.surge,
      state: getSanitizedOpsState(),
    });
  });

  app.post("/api/ops-proxy/end-surge", (_req, res) => {
    const surge = surgeController.stop();
    flags.adminSetDegradation(0, 40, "ops_end_surge", "End surge restored Level 0");
    res.json({ ok: true, surge, state: getSanitizedOpsState() });
  });

  app.post("/api/ops-proxy/reset", (_req, res) => {
    surgeController.stop();
    metrics.reset();
    alerter.reset();
    sharedLimiter.reset();
    flags.adminSetDegradation(0, 40, "ops_reset", "Reset to nominal baseline");
    res.json({ ok: true, state: getSanitizedOpsState() });
  });

  app.post("/api/demo/reset", (_req, res) => {
    surgeController.stop();
    metrics.reset();
    alerter.reset();
    sharedLimiter.reset();
    flags.resetForTests();
    store.resetDemoState();
    capabilities.invalidateCache();
    res.json({ ok: true });
  });

  // --- Testing App Endpoints ---
  app.post("/api/tests/track-a-unit", async (_req, res) => {
    const results = await runTrackAUnitTests();
    res.json({
      suite: "Track A Unit",
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      results,
    });
  });

  app.post("/api/tests/golden", async (req, res) => {
    try {
      const mode = (req.body as { mode?: "replay" | "live" })?.mode === "live" ? "live" : "replay";
      const report = await runGoldenSetEvaluation(mode);
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/tests/track-b-unit", async (_req, res) => {
    const results = await runTrackBUnitTests();
    res.json({
      suite: "Track B Ops Unit",
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      results,
    });
  });

  app.post("/api/tests/causal-loop", async (_req, res) => {
    const report = await runCausalLoopProof();
    res.json(report);
  });

  app.post("/api/tests/api-security", async (_req, res) => {
    const base = `http://127.0.0.1:${PORT}`;
    const results: TestCaseResult[] = [];

    const check = async (id: string, name: string, fn: () => Promise<string>) => {
      const t0 = performance.now();
      try {
        const details = await fn();
        results.push({
          id,
          suite: "API & Security Scan",
          name,
          passed: true,
          duration_ms: Number((performance.now() - t0).toFixed(2)),
          details,
        });
      } catch (err) {
        results.push({
          id,
          suite: "API & Security Scan",
          name,
          passed: false,
          duration_ms: Number((performance.now() - t0).toFixed(2)),
          details: err instanceof Error ? err.message : String(err),
        });
      }
    };

    await check("SEC-1", "POST /api/turn responds in < 300ms with {job_id, level}", async () => {
      const t0 = performance.now();
      const r = await fetch(`${base}/api/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gid: "sec-test-1",
          text: "Sangeet kitne baje hai?",
          executionMode: "replay",
        }),
      });
      const dt = performance.now() - t0;
      const j = (await r.json()) as { job_id?: string; level?: number };
      if (!r.ok || !j.job_id || typeof j.level !== "number" || dt >= 300) {
        throw new Error(`Unexpected response: status=${r.status}, dt=${dt.toFixed(1)}ms`);
      }
      return `Returned job_id=${j.job_id}, level=${j.level} in ${dt.toFixed(1)}ms.`;
    });

    await check("SEC-2", "GET /api/host/state returns 403 without valid key, 200 with valid key", async () => {
      const bad = await fetch(`${base}/api/host/state?k=wrong`);
      if (bad.status !== 403) throw new Error(`Expected 403, got ${bad.status}`);
      const good = await fetch(`${base}/api/host/state?k=${encodeURIComponent(HOST_KEY)}`);
      if (good.status !== 200) throw new Error(`Expected 200, got ${good.status}`);
      const txt = await good.text();
      if (txt.includes(OPS_TOKEN)) throw new Error("OPS_TOKEN leaked in /api/host/state!");
      return "403 on bad key; 200 on valid key; zero OPS_TOKEN in host proxy response.";
    });

    await check("SEC-3", "GET /ops/state returns 401 without X-Ops-Token; /ops/metrics stays open", async () => {
      const unauth = await fetch(`${base}/ops/state`);
      if (unauth.status !== 401) throw new Error(`Expected 401, got ${unauth.status}`);
      const auth = await fetch(`${base}/ops/state`, {
        headers: { "X-Ops-Token": OPS_TOKEN },
      });
      if (auth.status !== 200) throw new Error(`Expected 200 with token, got ${auth.status}`);
      const met = await fetch(`${base}/ops/metrics`);
      if (met.status !== 200) throw new Error(`Expected 200 on /ops/metrics, got ${met.status}`);
      return "Enforced 401 on /ops/state; authenticated 200; /ops/metrics reachable.";
    });

    await check("SEC-4", "Secret-leak & literal fallback token scan across API + src/", async () => {
      const secrets = [OPS_TOKEN, HOST_KEY, process.env.GEMINI_API_KEY].filter(
        (s): s is string => Boolean(s && s.length > 8 && s !== "MY_GEMINI_API_KEY")
      );
      const endpoints = [
        `${base}/healthz`,
        `${base}/api/card?gid=scan`,
        `${base}/api/judge/state`,
        `${base}/api/host/state?k=${encodeURIComponent(HOST_KEY)}`,
        `${base}/api/ops-proxy/state`,
      ];
      for (const url of endpoints) {
        const txt = await (await fetch(url)).text();
        for (const sec of secrets) {
          if (txt.includes(sec)) throw new Error(`Secret leaked in ${url}`);
        }
      }
      const targets = [path.resolve(process.cwd(), "src")];
      const distAssets = path.resolve(process.cwd(), "dist", "assets");
      if (fs.existsSync(distAssets)) {
        targets.push(distAssets);
      }
      let scannedFiles = 0;
      for (const dir of targets) {
        const files = fs.readdirSync(dir, { recursive: true }) as string[];
        for (const f of files) {
          const full = path.join(dir, f);
          if (fs.statSync(full).isFile() && /\.(ts|tsx|js)$/.test(full)) {
            scannedFiles += 1;
            const content = fs.readFileSync(full, "utf8");
            if (/sk_[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_-]{10,}|ser\.[A-Za-z0-9]{10,}|haanji-host-demo-2026/.test(content)) {
              throw new Error(`Literal secret or token fallback matched in ${f}`);
            }
            if (dir === distAssets && content.includes("GEMINI_API_KEY")) {
              throw new Error(`Server env var GEMINI_API_KEY leaked in built bundle ${f}`);
            }
          }
        }
      }
      return `Scanned ${endpoints.length} live endpoints and ${scannedFiles} client/bundle files: 0 secret or literal token leaks.`;
    });

    await check("SEC-5", "Consumer Guest UI isolation: zero developer internals in GuestConcierge.tsx", async () => {
      const guestPath = path.resolve(process.cwd(), "src", "components", "GuestConcierge.tsx");
      const src = fs.readFileSync(guestPath, "utf8").toLowerCase();
      const banned = ["replay engine", "prompt injection", "executionmode", "persona arm"];
      for (const b of banned) {
        if (src.includes(b)) {
          throw new Error(`Developer term "${b}" found in consumer GuestConcierge.tsx`);
        }
      }
      return "Verified GuestConcierge.tsx contains zero developer test/persona/replay UI terms.";
    });

    await check("SEC-6", "/api/capabilities, 3x Muhurat Rush loop & /api/demo/reset succeed cleanly", async () => {
      const capRes = await fetch(`${base}/api/capabilities`);
      if (!capRes.ok) throw new Error(`/api/capabilities returned ${capRes.status}`);
      const capJson = (await capRes.json()) as {
        live_ai?: unknown;
        flagsmith?: unknown;
        nudgebee?: unknown;
        sarvam_reason?: unknown;
      };
      if (
        typeof capJson.live_ai !== "boolean" ||
        typeof capJson.flagsmith !== "boolean" ||
        typeof capJson.nudgebee !== "boolean" ||
        typeof capJson.sarvam_reason !== "string"
      ) {
        throw new Error("Invalid /api/capabilities shape");
      }

      for (let i = 1; i <= 3; i++) {
        const startRes = await fetch(`${base}/api/ops-proxy/muhurat-demo`, { method: "POST" });
        if (!startRes.ok) throw new Error(`Muhurat Rush run #${i} failed: ${startRes.status}`);
        const endRes = await fetch(`${base}/api/ops-proxy/end-surge`, { method: "POST" });
        if (!endRes.ok) throw new Error(`End surge #${i} failed: ${endRes.status}`);
      }

      const resetRes = await fetch(`${base}/api/demo/reset`, { method: "POST" });
      if (!resetRes.ok) throw new Error(`/api/demo/reset failed: ${resetRes.status}`);

      return "/api/capabilities valid; Muhurat Rush start/end passed 3x consecutively; /api/demo/reset ok.";
    });

    res.json({
      suite: "API & Security Scan",
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      results,
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`HaanJi server listening on http://0.0.0.0:${PORT}`);
    void capabilities.logStartupCapabilities();
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
