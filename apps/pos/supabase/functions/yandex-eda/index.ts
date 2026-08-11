// @ts-nocheck
// Yandex Eda Phase 1A + 1B integration.
// Single Edge Function with internal routing. Style mirrors `glovo-inbound`.
//
// Phase 1A endpoints (see https://yandex.ru/dev/eda-vendor/doc/ru/ref/):
//   POST /security/oauth/token              — OAuth2 client_credentials
//   GET  /restaurants                        — list venues
//   GET  /restaurants/availability           — { id, enabled }[]
//   GET  /menu/{restaurantId}/composition    — full catalog (v2 vendor JSON)
//   GET  /menu/{restaurantId}/availability   — items[] / modifiers[] (empty in v1A)
//   GET  /menu/{restaurantId}/promos         — promos[] (empty in v1A)
//
// Phase 1B endpoints (order intake):
//   POST   /order                            — ingest new Yandex order (CARD or CASH)
//   GET    /order/{eatsId}                   — fetch saved order in vendor shape
//   GET    /order/{eatsId}/status            — fetch lifecycle status
//   PUT    /order/{eatsId}/status            — Yandex pushes lifecycle transitions
//   DELETE /order/{eatsId}                   — cancellation (refund paid / restock active)
//
// All non-OAuth routes require `Authorization: Bearer <token>` issued by
// /security/oauth/token. Mutating routes additionally require scope=write.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TOKEN_TTL_SECONDS = 3600;
const COMPOSITION_CONTENT_TYPE = "application/vnd.eats.menu.composition.v2+json";
const AVAILABILITY_CONTENT_TYPE = "application/vnd.eats.menu.availability.v2+json";
const ORDER_CONTENT_TYPE = "application/vnd.eats.order.v2+json";
const ORDER_STATUS_CONTENT_TYPE = "application/vnd.eats.order.status.v2+json";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

const hexFromBuffer = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
};

const sha256Hex = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return hexFromBuffer(digest);
};

const timingSafeEqual = (a: string, b: string): boolean => {
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
};

const extractAuthToken = (header: string): string => {
  const trimmed = header.trim();
  if (!trimmed) return "";
  const bearer = /^Bearer\s+/i;
  return bearer.test(trimmed) ? trimmed.replace(bearer, "").trim() : trimmed;
};

const randomToken = (): string => {
  // 256 bits of entropy as hex.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Response factory — enforces the exact contract Yandex expects for each shape.
// ─────────────────────────────────────────────────────────────────────────────

const okJson = (body: unknown, contentType = "application/json") =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": contentType },
  });

// 400: free-form JSON object. We use it for OAuth + payload validation errors.
const badRequest = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

// 401: { reason: string } per Yandex spec.
const unauthorized = (reason: string) =>
  new Response(JSON.stringify({ reason }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

// 404: free-form. Used for unknown routes / unknown restaurantId.
const notFound = (reason: string) =>
  new Response(JSON.stringify({ reason }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });

const methodNotAllowed = () =>
  new Response(JSON.stringify({ reason: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "GET, POST" },
  });

// 500: `[{ code: number, description: string }]` per Yandex spec.
const serverError = (code: number, description: string) =>
  new Response(JSON.stringify([{ code, description }]), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });

// ─────────────────────────────────────────────────────────────────────────────
// OAuth — POST /security/oauth/token
// ─────────────────────────────────────────────────────────────────────────────

type OAuthForm = {
  clientId: string;
  clientSecret: string;
  grantType: string;
  scope: string | null;
};

const parseOAuthBody = async (req: Request): Promise<OAuthForm | null> => {
  const contentType = (req.headers.get("Content-Type") ?? "").toLowerCase();
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      return {
        clientId: (params.get("client_id") ?? "").trim(),
        clientSecret: params.get("client_secret") ?? "",
        grantType: (params.get("grant_type") ?? "").trim(),
        scope: params.get("scope"),
      };
    }
    if (contentType.includes("application/json")) {
      const body = await req.json();
      return {
        clientId: String(body.client_id ?? "").trim(),
        clientSecret: String(body.client_secret ?? ""),
        grantType: String(body.grant_type ?? "").trim(),
        scope: body.scope == null ? null : String(body.scope),
      };
    }
  } catch {
    return null;
  }
  return null;
};

const issueToken = async (req: Request): Promise<Response> => {
  const form = await parseOAuthBody(req);
  if (!form) {
    return badRequest({ error: "invalid_request", error_description: "Body must be x-www-form-urlencoded or JSON." });
  }
  if (form.grantType !== "client_credentials") {
    return badRequest({ error: "unsupported_grant_type" });
  }
  if (!form.clientId || !form.clientSecret) {
    return badRequest({ error: "invalid_request", error_description: "client_id and client_secret are required." });
  }

  const { data: client, error } = await supabase
    .from("marketplace_api_clients")
    .select("id, client_secret_hash, client_secret_salt, scopes, enabled")
    .eq("provider", "yandex_eda")
    .eq("client_id", form.clientId)
    .eq("enabled", true)
    .maybeSingle();

  if (error) {
    console.error("[yandex-eda] client_lookup_failed", { client_id: form.clientId, err: error.message });
    return serverError(100, "Internal error");
  }
  if (!client) {
    return badRequest({ error: "invalid_client" });
  }

  const expectedHash = await sha256Hex(`${client.client_secret_salt}:${form.clientSecret}`);
  if (!timingSafeEqual(expectedHash, String(client.client_secret_hash ?? ""))) {
    return badRequest({ error: "invalid_client" });
  }

  // Intersect requested scopes with what the client is allowed to use.
  const allowedScopes = Array.isArray(client.scopes) ? client.scopes.map(String) : ["read"];
  const requestedScopes = (form.scope ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const grantedScopes = requestedScopes.length === 0
    ? allowedScopes
    : requestedScopes.filter((s) => allowedScopes.includes(s));

  if (grantedScopes.length === 0) {
    return badRequest({ error: "invalid_scope" });
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);

  const { data: issued, error: issueErr } = await supabase
    .rpc("marketplace_yandex_issue_token", {
      p_client_uuid: client.id,
      p_token_hash: tokenHash,
      p_scopes: grantedScopes,
      p_ttl_seconds: TOKEN_TTL_SECONDS,
    });

  if (issueErr || !issued || (Array.isArray(issued) && issued.length === 0)) {
    console.error("[yandex-eda] issue_token_failed", {
      client_id: form.clientId,
      err: issueErr?.message,
      details: issueErr?.details,
    });
    return serverError(100, "Internal error");
  }

  return okJson({
    access_token: token,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    scope: grantedScopes.join(" "),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Auth middleware — validates bearer tokens for protected routes.
// ─────────────────────────────────────────────────────────────────────────────

type AuthContext = {
  clientUuid: string;
  organizationId: string;
  scopes: string[];
};

type RequiredScope = "read" | "write";

const authenticate = async (
  req: Request,
  requiredScope: RequiredScope = "read",
): Promise<AuthContext | Response> => {
  const provided = extractAuthToken(req.headers.get("Authorization") ?? "");
  if (!provided) {
    return unauthorized("Authorization header is missing");
  }
  const tokenHash = await sha256Hex(provided);
  const { data, error } = await supabase
    .rpc("marketplace_yandex_validate_token", { p_token_hash: tokenHash });
  if (error) {
    console.error("[yandex-eda] validate_token_failed", { err: error.message });
    return serverError(100, "Internal error");
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || !row.out_client_uuid) {
    return unauthorized("Access token has been expired. You should request a new one");
  }
  const scopes = Array.isArray(row.out_scopes) ? row.out_scopes.map(String) : [];
  if (!scopes.includes(requiredScope)) {
    return unauthorized("insufficient_scope");
  }
  return {
    clientUuid: String(row.out_client_uuid),
    organizationId: String(row.out_organization_id),
    scopes,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// /restaurants — list places for the calling organization.
// ─────────────────────────────────────────────────────────────────────────────

const listRestaurants = async (auth: AuthContext): Promise<Response> => {
  const { data, error } = await supabase
    .from("marketplace_store_bindings")
    .select("external_store_id, venues!inner(id, name, address, organization_id)")
    .eq("provider", "yandex_eda")
    .eq("enabled", true)
    .eq("venues.organization_id", auth.organizationId);

  if (error) {
    console.error("[yandex-eda] list_restaurants_failed", { err: error.message });
    return serverError(100, "Internal error");
  }

  const places = (data ?? []).map((row: Record<string, unknown>) => {
    const venue = row.venues as Record<string, unknown>;
    return {
      id: String(row.external_store_id),
      title: String(venue?.name ?? ""),
      address: String(venue?.address ?? ""),
    };
  });

  return okJson({ places });
};

const listRestaurantsAvailability = async (auth: AuthContext): Promise<Response> => {
  const { data, error } = await supabase
    .from("marketplace_store_bindings")
    .select("external_store_id, enabled, venues!inner(organization_id)")
    .eq("provider", "yandex_eda")
    .eq("venues.organization_id", auth.organizationId);

  if (error) {
    console.error("[yandex-eda] list_restaurants_availability_failed", { err: error.message });
    return serverError(100, "Internal error");
  }

  const places = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.external_store_id),
    enabled: row.enabled === true,
  }));

  return okJson({ places });
};

// ─────────────────────────────────────────────────────────────────────────────
// Menu — /menu/{restaurantId}/composition + availability + promos.
// ─────────────────────────────────────────────────────────────────────────────

type ResolvedVenue = { venueId: string; restaurantId: string };

const resolveVenueForOrg = async (
  auth: AuthContext,
  restaurantId: string,
): Promise<ResolvedVenue | null> => {
  if (!restaurantId) return null;
  const { data, error } = await supabase
    .from("marketplace_store_bindings")
    .select("venue_id, enabled, venues!inner(id, organization_id)")
    .eq("provider", "yandex_eda")
    .eq("external_store_id", restaurantId)
    .eq("venues.organization_id", auth.organizationId)
    .maybeSingle();

  if (error) {
    console.error("[yandex-eda] resolve_venue_failed", { restaurantId, err: error.message });
    return null;
  }
  if (!data || !data.venue_id) return null;
  return { venueId: String(data.venue_id), restaurantId };
};

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number | null;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  price: number | string;
  sort_order: number | null;
};

type ModifierGroupRow = {
  id: string;
  name: string;
  is_required: boolean | null;
  max_select: number | null;
};

type ModifierRow = {
  id: string;
  modifier_group_id: string;
  name: string;
  price: number | string | null;
};

type ProductModifierLink = {
  product_id: string;
  modifier_group_id: string;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

const buildComposition = async (auth: AuthContext, restaurantId: string): Promise<Response> => {
  const resolved = await resolveVenueForOrg(auth, restaurantId);
  if (!resolved) return notFound("Restaurant not found");
  const { venueId } = resolved;

  // 1) Categories
  const { data: categoriesData, error: catErr } = await supabase
    .from("categories")
    .select("id, name, sort_order")
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (catErr) {
    console.error("[yandex-eda] categories_failed", { venueId, err: catErr.message });
    return serverError(100, "Internal error");
  }
  const categoryIds = new Set<string>((categoriesData ?? []).map((c: CategoryRow) => c.id));

  // 2) Products (dishes only, active, non-zero price). Yandex pulls modifiers as
  //    separate "items" only via modifierGroups, so we keep things flat here.
  const { data: productsData, error: prodErr } = await supabase
    .from("products")
    .select("id, category_id, name, price, sort_order")
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .eq("type", "dish")
    .gt("price", 0)
    .order("sort_order", { ascending: true });
  if (prodErr) {
    console.error("[yandex-eda] products_failed", { venueId, err: prodErr.message });
    return serverError(100, "Internal error");
  }
  const products = (productsData ?? []) as ProductRow[];
  const productIds = products.map((p) => p.id);

  // 3) Product → modifier group linkage
  let links: ProductModifierLink[] = [];
  if (productIds.length > 0) {
    const { data: linksData, error: linkErr } = await supabase
      .from("product_modifier_groups")
      .select("product_id, modifier_group_id")
      .in("product_id", productIds);
    if (linkErr) {
      console.error("[yandex-eda] product_modifier_groups_failed", { venueId, err: linkErr.message });
      return serverError(100, "Internal error");
    }
    links = (linksData ?? []) as ProductModifierLink[];
  }
  const groupIds = Array.from(new Set(links.map((l) => l.modifier_group_id)));

  // 4) Modifier groups (only those referenced by our products, scoped to venue)
  let groups: ModifierGroupRow[] = [];
  if (groupIds.length > 0) {
    const { data: groupsData, error: groupsErr } = await supabase
      .from("modifier_groups")
      .select("id, name, is_required, max_select")
      .eq("venue_id", venueId)
      .in("id", groupIds);
    if (groupsErr) {
      console.error("[yandex-eda] modifier_groups_failed", { venueId, err: groupsErr.message });
      return serverError(100, "Internal error");
    }
    groups = (groupsData ?? []) as ModifierGroupRow[];
  }
  const validGroupIds = new Set(groups.map((g) => g.id));

  // 5) Modifiers (only those whose group survived the venue scope filter)
  let modifiers: ModifierRow[] = [];
  if (validGroupIds.size > 0) {
    const { data: modifiersData, error: modErr } = await supabase
      .from("modifiers")
      .select("id, modifier_group_id, name, price")
      .eq("is_active", true)
      .in("modifier_group_id", Array.from(validGroupIds));
    if (modErr) {
      console.error("[yandex-eda] modifiers_failed", { venueId, err: modErr.message });
      return serverError(100, "Internal error");
    }
    modifiers = (modifiersData ?? []) as ModifierRow[];
  }
  const modifiersByGroup = new Map<string, ModifierRow[]>();
  for (const m of modifiers) {
    const bucket = modifiersByGroup.get(m.modifier_group_id) ?? [];
    bucket.push(m);
    modifiersByGroup.set(m.modifier_group_id, bucket);
  }
  const groupById = new Map(groups.map((g) => [g.id, g] as const));
  const linksByProduct = new Map<string, string[]>();
  for (const l of links) {
    if (!validGroupIds.has(l.modifier_group_id)) continue;
    const arr = linksByProduct.get(l.product_id) ?? [];
    arr.push(l.modifier_group_id);
    linksByProduct.set(l.product_id, arr);
  }

  // ── Map to Yandex Eda v2 format ───────────────────────────────────────────
  const categories = (categoriesData ?? []).map((c: CategoryRow) => ({
    id: String(c.id),
    name: String(c.name),
    sortOrder: Number(c.sort_order ?? 100),
  }));

  const items = products
    .filter((p) => !p.category_id || categoryIds.has(p.category_id))
    .map((p) => {
      const productGroupIds = linksByProduct.get(p.id) ?? [];
      const modifierGroups = productGroupIds
        .map((gid) => {
          const g = groupById.get(gid);
          if (!g) return null;
          const items = (modifiersByGroup.get(gid) ?? []).map((m) => ({
            id: String(m.id),
            name: String(m.name),
            price: num(m.price),
            minAmount: 0,
            maxAmount: 1,
          }));
          if (items.length === 0) return null;
          const maxSelected = Number(g.max_select ?? 0);
          return {
            id: String(g.id),
            name: String(g.name),
            minSelectedModifiers: g.is_required ? 1 : 0,
            maxSelectedModifiers: maxSelected > 0 ? maxSelected : items.length,
            modifiers: items,
          };
        })
        .filter(Boolean);

      const item: Record<string, unknown> = {
        id: String(p.id),
        name: String(p.name),
        price: num(p.price),
      };
      if (p.category_id) item.categoryId = String(p.category_id);
      if (modifierGroups.length > 0) item.modifierGroups = modifierGroups;
      return item;
    });

  return okJson({ categories, items }, COMPOSITION_CONTENT_TYPE);
};

// v1A baseline — empty arrays mean "everything available".
const getAvailability = async (auth: AuthContext, restaurantId: string): Promise<Response> => {
  const resolved = await resolveVenueForOrg(auth, restaurantId);
  if (!resolved) return notFound("Restaurant not found");
  return okJson({ items: [], modifiers: [] }, AVAILABILITY_CONTENT_TYPE);
};

// v1A baseline — no promos yet.
const getPromos = async (auth: AuthContext, restaurantId: string): Promise<Response> => {
  const resolved = await resolveVenueForOrg(auth, restaurantId);
  if (!resolved) return notFound("Restaurant not found");
  return okJson({ promos: [] });
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1B — Order intake: POST / GET / PUT / DELETE /order
// ─────────────────────────────────────────────────────────────────────────────

type YandexPaymentType = "CARD" | "CASH";

type YandexItemMod = {
  externalId: string;
  name: string;
  quantity: number;
  price: number;
};

type YandexItem = {
  externalId: string;
  name: string;
  quantity: number;
  price: number;
  modifiers: YandexItemMod[];
};

type ParsedYandexOrder = {
  eatsId: string;
  restaurantId: string;
  paymentType: YandexPaymentType;
  discriminator: string | null;
  comment: string | null;
  items: YandexItem[];
  customer: Record<string, unknown> | null;
  deliveryInfo: Record<string, unknown> | null;
  paymentInfo: Record<string, unknown> | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
};

const numCoerce = (v: unknown, fallback = 0): number => {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

const moneyCoerce = (v: unknown): number => {
  const n = numCoerce(v, 0);
  return Math.round(n * 100) / 100;
};

const parseYandexOrderBody = (body: unknown): ParsedYandexOrder | null => {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const eatsId = String(root.eatsId ?? root.eats_id ?? "").trim();
  const restaurantId = String(
    root.restaurantId ?? root.restaurant_id ?? root.placeId ?? root.place_id ?? "",
  ).trim();
  if (!eatsId || !restaurantId) return null;

  const pt = String(
    root.paymentType ?? root.payment_type ?? (root.paymentInfo as any)?.paymentType ?? "",
  ).toUpperCase();
  if (pt !== "CARD" && pt !== "CASH") return null;

  const rawItems = Array.isArray(root.items) ? root.items : [];
  const items: YandexItem[] = rawItems.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const externalId = String(r.id ?? r.externalId ?? r.menuItemId ?? "").trim();
    // Yandex docs use both "modifications" and "modifiers"; accept either.
    const mods = Array.isArray(r.modifications)
      ? r.modifications
      : Array.isArray(r.modifiers)
        ? r.modifiers
        : [];
    return {
      externalId,
      name: String(r.name ?? "").trim() || `Item ${externalId}`,
      quantity: Math.max(1, Math.trunc(numCoerce(r.quantity, 1))),
      price: moneyCoerce(r.price),
      modifiers: mods.map((m) => {
        const mm = (m ?? {}) as Record<string, unknown>;
        return {
          externalId: String(mm.id ?? mm.externalId ?? "").trim(),
          name: String(mm.name ?? "").trim() || "modifier",
          quantity: Math.max(1, Math.trunc(numCoerce(mm.quantity, 1))),
          price: moneyCoerce(mm.price),
        };
      }),
    };
  });

  return {
    eatsId,
    restaurantId,
    paymentType: pt as YandexPaymentType,
    discriminator: root.discriminator == null ? null : String(root.discriminator),
    comment: root.comment == null ? null : String(root.comment) || null,
    items,
    customer: (root.customer ?? null) as Record<string, unknown> | null,
    deliveryInfo: (root.deliveryInfo ?? root.delivery_info ?? null) as
      | Record<string, unknown>
      | null,
    paymentInfo: (root.paymentInfo ?? root.payment_info ?? null) as
      | Record<string, unknown>
      | null,
    createdAt: root.createdAt == null ? null : String(root.createdAt),
    raw: root,
  };
};

const STATUS_INITIAL = "ACCEPTED_BY_RESTAURANT";
type YandexStatus =
  | "ACCEPTED_BY_RESTAURANT"
  | "COOKING"
  | "READY"
  | "TAKEN_BY_COURIER"
  | "DELIVERED"
  | "CANCELLED";

const STATUS_TRANSITIONS: Record<YandexStatus, YandexStatus[]> = {
  ACCEPTED_BY_RESTAURANT: ["COOKING", "CANCELLED"],
  COOKING: ["READY", "CANCELLED"],
  READY: ["TAKEN_BY_COURIER", "CANCELLED"],
  TAKEN_BY_COURIER: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const isYandexStatus = (s: string): s is YandexStatus =>
  s === "ACCEPTED_BY_RESTAURANT" ||
  s === "COOKING" ||
  s === "READY" ||
  s === "TAKEN_BY_COURIER" ||
  s === "DELIVERED" ||
  s === "CANCELLED";

// 400 array shape per Yandex contract.
const badStatusTransition = () =>
  new Response(
    JSON.stringify([{ code: 100, description: "Invalid status transition" }]),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );

const invalidPayload = (description = "Invalid payload") =>
  new Response(JSON.stringify([{ code: 100, description }]), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

const notFoundArr = (description = "Order not found") =>
  new Response(JSON.stringify([{ code: 404, description }]), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });

const findExistingYandexOrder = async (venueId: string, eatsId: string) => {
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, shift_id, integration_metadata, total_amount, opened_at, closed_at")
    .eq("venue_id", venueId)
    .eq("order_source", "yandex_eda")
    .eq("external_order_id", eatsId)
    .maybeSingle();
  if (error) {
    console.error("[yandex-eda] find_existing_order_failed", { eatsId, err: error.message });
    return null;
  }
  return data;
};

const saveYandexInboundEvent = async (args: {
  eventType: string;
  payload: Record<string, unknown>;
  externalOrderId: string;
  externalEventId: string;
  venueId?: string | null;
}): Promise<{ eventId: string | null; duplicate: boolean; retryAfterFailure: boolean }> => {
  const { data, error } = await supabase
    .from("marketplace_inbound_events")
    .insert({
      provider: "yandex_eda",
      external_event_id: args.externalEventId,
      event_type: args.eventType,
      venue_id: args.venueId ?? null,
      external_order_id: args.externalOrderId,
      payload: args.payload,
    })
    .select("id")
    .single();

  if (!error) {
    return { eventId: data?.id ?? null, duplicate: false, retryAfterFailure: false };
  }
  if (error.code !== "23505") throw new Error(error.message);

  const { data: existing, error: lookupError } = await supabase
    .from("marketplace_inbound_events")
    .select("id, processed_at, processing_error")
    .eq("provider", "yandex_eda")
    .eq("external_event_id", args.externalEventId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const eventId = existing?.id ?? null;
  const retryAfterFailure = Boolean(
    existing && (existing.processed_at === null || existing.processing_error !== null),
  );
  if (retryAfterFailure && eventId) {
    await supabase
      .from("marketplace_inbound_events")
      .update({ processing_error: null, payload: args.payload, venue_id: args.venueId ?? null })
      .eq("id", eventId);
    return { eventId, duplicate: false, retryAfterFailure: true };
  }
  return { eventId, duplicate: true, retryAfterFailure: false };
};

const markYandexInboundEvent = async (args: {
  eventId: string | null;
  linkedOrderId?: string | null;
  processingError?: string | null;
}) => {
  if (!args.eventId) return;
  await supabase
    .from("marketplace_inbound_events")
    .update({
      processed_at: new Date().toISOString(),
      linked_order_id: args.linkedOrderId ?? null,
      processing_error: args.processingError ?? null,
    })
    .eq("id", args.eventId);
};

const getOpenShiftId = async (venueId: string): Promise<string | null> => {
  const { data } = await supabase
    .from("shifts")
    .select("id")
    .eq("venue_id", venueId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
};

const nextOrderNumberYandex = async (venueId: string): Promise<string> => {
  const { data, error } = await supabase.rpc("marketplace_next_order_number", {
    p_venue_id: venueId,
  });
  if (error) throw new Error(`order_number_rpc_failed: ${error.message}`);
  return String(data ?? "");
};

const resolveModifierBindingsYandex = async (
  venueId: string,
  externalIds: string[],
): Promise<Map<string, string>> => {
  if (externalIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("marketplace_modifier_bindings")
    .select("external_modifier_id, modifier_id")
    .eq("venue_id", venueId)
    .eq("provider", "yandex_eda")
    .eq("enabled", true)
    .in("external_modifier_id", externalIds);
  if (error) {
    console.error("[yandex-eda] modifier_bindings_lookup_failed", {
      venueId,
      err: error.message,
    });
    return new Map();
  }
  return new Map((data ?? []).map((r) => [String(r.external_modifier_id), r.modifier_id as string]));
};

const loadAllowedModifiersPerProduct = async (
  venueId: string,
  productIds: string[],
): Promise<Map<string, Set<string>>> => {
  const result = new Map<string, Set<string>>();
  if (productIds.length === 0) return result;
  const { data, error } = await supabase
    .from("product_modifier_groups")
    .select("product_id, modifier_groups!inner(id, venue_id, modifiers!inner(id))")
    .eq("modifier_groups.venue_id", venueId)
    .in("product_id", productIds);
  if (error) {
    console.error("[yandex-eda] modifier_groups_lookup_failed", { venueId, err: error.message });
    return result;
  }
  for (const row of data ?? []) {
    const productId = row.product_id as string;
    const set = result.get(productId) ?? new Set<string>();
    const group = (row as { modifier_groups?: any }).modifier_groups;
    const groups = Array.isArray(group) ? group : group ? [group] : [];
    for (const g of groups) {
      const mods = (g as { modifiers?: Array<{ id: string }> }).modifiers ?? [];
      for (const m of mods) set.add(m.id);
    }
    result.set(productId, set);
  }
  return result;
};

const buildYandexOrderResponse = (order: {
  id: string;
  status: string;
  integration_metadata: Record<string, unknown> | null;
  total_amount: number | string | null;
  opened_at: string | null;
  closed_at: string | null;
}): Record<string, unknown> => {
  const meta = (order.integration_metadata ?? {}) as Record<string, unknown>;
  const original = (meta.original_payload ?? {}) as Record<string, unknown>;
  const yandexStatus = String(meta.yandex_status ?? STATUS_INITIAL);
  return {
    ...original,
    status: yandexStatus,
    updatedAt: new Date().toISOString(),
  };
};

const postOrder = async (auth: AuthContext, req: Request): Promise<Response> => {
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return invalidPayload("Body must be JSON");
  }

  const parsed = parseYandexOrderBody(bodyJson);
  if (!parsed) {
    return invalidPayload("Required fields missing (eatsId, restaurantId, paymentType, items)");
  }

  // Resolve venue, scoped to caller's organization (same scoping as menu APIs).
  const resolvedVenue = await resolveVenueForOrg(auth, parsed.restaurantId);
  if (!resolvedVenue) return notFoundArr("Restaurant not found");
  const venueId = resolvedVenue.venueId;

  const externalEventId = `order_create:${parsed.eatsId}`;
  let eventState: { eventId: string | null; duplicate: boolean; retryAfterFailure: boolean };
  try {
    eventState = await saveYandexInboundEvent({
      eventType: "order_create",
      payload: parsed.raw,
      externalOrderId: parsed.eatsId,
      externalEventId,
      venueId,
    });
  } catch (err) {
    console.error("[yandex-eda] inbound_event_save_failed", {
      eatsId: parsed.eatsId,
      err: (err as Error).message,
    });
    return serverError(100, "Internal error");
  }

  // Idempotent: if order with same eatsId already exists, return the saved shape.
  const existingOrder = await findExistingYandexOrder(venueId, parsed.eatsId);
  if (existingOrder && !eventState.retryAfterFailure) {
    await markYandexInboundEvent({
      eventId: eventState.eventId,
      linkedOrderId: existingOrder.id as string,
    });
    return okJson(buildYandexOrderResponse(existingOrder as any), ORDER_CONTENT_TYPE);
  }

  // Map external product ids → internal product_ids.
  const externalIds = Array.from(new Set(parsed.items.map((i) => i.externalId).filter(Boolean)));
  const { data: mappedProducts, error: mapErr } = await supabase
    .from("products")
    .select("id, external_id")
    .eq("venue_id", venueId)
    .eq("external_source", "yandex_eda")
    .in("external_id", externalIds);
  if (mapErr) {
    console.error("[yandex-eda] product_map_failed", { venueId, err: mapErr.message });
    await markYandexInboundEvent({
      eventId: eventState.eventId,
      processingError: `product_map_failed:${mapErr.message}`,
    });
    return serverError(100, "Internal error");
  }
  const productMap = new Map<string, string>(
    (mappedProducts ?? []).map((p) => [String(p.external_id), p.id as string]),
  );

  const attrExternalIds = Array.from(
    new Set(parsed.items.flatMap((i) => i.modifiers.map((m) => m.externalId).filter(Boolean))),
  );
  const modifierMap = await resolveModifierBindingsYandex(venueId, attrExternalIds);
  const allowedPerProduct = await loadAllowedModifiersPerProduct(
    venueId,
    Array.from(new Set([...productMap.values()])),
  );

  const orderId = existingOrder?.id ?? crypto.randomUUID();
  const openedAt = parsed.createdAt ?? new Date().toISOString();
  const closedAt = new Date().toISOString();
  const totalAmount = parsed.items.reduce((acc, it) => {
    const baseLine = it.price * it.quantity;
    const modsTotal = it.modifiers.reduce(
      (a, m) => a + m.price * m.quantity * it.quantity,
      0,
    );
    return acc + baseLine + modsTotal;
  }, 0);

  const shiftId = await getOpenShiftId(venueId);

  const unmappedProducts: string[] = [];
  const unmappedAttributes: string[] = [];
  const orderItemsToInsert: Array<Record<string, unknown>> = [];
  const modifierRowsToInsert: Array<Record<string, unknown>> = [];

  for (const it of parsed.items) {
    const productId = productMap.get(it.externalId);
    if (!productId) {
      if (it.externalId) unmappedProducts.push(it.externalId);
      continue;
    }
    const itemId = crypto.randomUUID();
    orderItemsToInsert.push({
      id: itemId,
      order_id: orderId,
      product_id: productId,
      product_name: it.name,
      product_price: it.price,
      quantity: it.quantity,
      guest_number: 1,
      comment: null,
    });
    const allowedForProduct = allowedPerProduct.get(productId) ?? new Set<string>();
    for (const m of it.modifiers) {
      const resolved = m.externalId ? modifierMap.get(m.externalId) ?? null : null;
      const validForProduct = resolved !== null && allowedForProduct.has(resolved);
      const finalModifierId = validForProduct ? resolved : null;
      if (m.externalId && !validForProduct) unmappedAttributes.push(m.externalId);
      modifierRowsToInsert.push({
        order_item_id: itemId,
        modifier_id: finalModifierId,
        modifier_name: m.name,
        modifier_price: m.price,
      });
    }
  }

  const status = parsed.paymentType === "CARD" ? "paid" : "active";

  const baseMetadata: Record<string, unknown> = {
    provider: "yandex_eda",
    discriminator: parsed.discriminator,
    yandex_status: STATUS_INITIAL,
    payment_type: parsed.paymentType,
    payment_info: parsed.paymentInfo ?? null,
    delivery_info: parsed.deliveryInfo ?? null,
    customer: parsed.customer ?? null,
    comment: parsed.comment ?? null,
    original_payload: parsed.raw,
    last_event: "order_create",
    received_at: closedAt,
    status_history: [
      { status: STATUS_INITIAL, at: closedAt },
    ],
  };

  // If this is a retry path: existingOrder is null but eventState.retryAfterFailure may
  // still be true. We treat retries safely by re-creating the order with the same ids.
  if (existingOrder) {
    // Idempotent path: keep existing record, refresh meta and items.
    const { error } = await supabase
      .from("orders")
      .update({
        status,
        shift_id: shiftId,
        comment: parsed.comment ?? null,
        total_amount: totalAmount,
        integration_metadata: { ...baseMetadata, ...(existingOrder.integration_metadata ?? {}) },
        closed_at: status === "paid" ? closedAt : null,
      })
      .eq("id", existingOrder.id);
    if (error) {
      await markYandexInboundEvent({
        eventId: eventState.eventId,
        processingError: `order_update_failed:${error.message}`,
      });
      console.error("[yandex-eda] order_update_failed", { err: error.message });
      return serverError(100, "Internal error");
    }
    const existingItems = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", existingOrder.id);
    const existingItemIds = (existingItems.data ?? []).map((x) => x.id as string);
    if (existingItemIds.length > 0) {
      await supabase.from("order_item_modifiers").delete().in("order_item_id", existingItemIds);
      await supabase.from("order_items").delete().eq("order_id", existingOrder.id);
    }
    // Re-point freshly minted item ids to the existing order.
    for (const it of orderItemsToInsert) it.order_id = existingOrder.id;
  } else {
    const number = await nextOrderNumberYandex(venueId);
    const { error } = await supabase.from("orders").insert({
      id: orderId,
      venue_id: venueId,
      shift_id: shiftId,
      number,
      status,
      guest_count: 1,
      order_type: "Yandex Eda",
      comment: parsed.comment ?? null,
      is_quick_check: true,
      order_source: "yandex_eda",
      external_order_id: parsed.eatsId,
      integration_metadata: baseMetadata,
      opened_at: openedAt,
      closed_at: status === "paid" ? closedAt : null,
      total_amount: totalAmount,
    });
    if (error) {
      await markYandexInboundEvent({
        eventId: eventState.eventId,
        processingError: `order_insert_failed:${error.message}`,
      });
      console.error("[yandex-eda] order_insert_failed", {
        eatsId: parsed.eatsId,
        err: error.message,
      });
      return serverError(100, "Internal error");
    }
  }

  if (orderItemsToInsert.length > 0) {
    const ins = await supabase.from("order_items").insert(orderItemsToInsert);
    if (ins.error) {
      await markYandexInboundEvent({
        eventId: eventState.eventId,
        processingError: `items_insert_failed:${ins.error.message}`,
      });
      console.error("[yandex-eda] items_insert_failed", { err: ins.error.message });
      return serverError(100, "Internal error");
    }
  }
  if (modifierRowsToInsert.length > 0) {
    const ins = await supabase.from("order_item_modifiers").insert(modifierRowsToInsert);
    if (ins.error) {
      await markYandexInboundEvent({
        eventId: eventState.eventId,
        processingError: `modifiers_insert_failed:${ins.error.message}`,
      });
      console.error("[yandex-eda] modifiers_insert_failed", { err: ins.error.message });
      return serverError(100, "Internal error");
    }
  }

  // Payment row for CARD only — keeps cash totals clean (CASH is collected from courier later).
  let paymentInserted = false;
  if (parsed.paymentType === "CARD") {
    const ins = await supabase
      .from("payments")
      .insert({
        order_id: orderId,
        venue_id: venueId,
        shift_id: shiftId,
        method: "other",
        amount: totalAmount,
        idempotency_key: `yandex_eda:${parsed.eatsId}`,
      })
      .select("id")
      .maybeSingle();
    paymentInserted = !ins.error;
    if (ins.error && ins.error.code !== "23505") {
      await markYandexInboundEvent({
        eventId: eventState.eventId,
        processingError: `payment_insert_failed:${ins.error.message}`,
      });
      console.error("[yandex-eda] payment_insert_failed", { err: ins.error.message });
      return serverError(100, "Internal error");
    }
  }

  // Stock settlement. CARD reaches status=paid → reuse pos_finalize_order_stock.
  // CASH stays active → use the marketplace-active variant.
  const { data: persisted, error: persistedErr } = await supabase
    .from("order_items")
    .select("id, product_id, quantity")
    .eq("order_id", orderId);
  if (persistedErr) {
    await markYandexInboundEvent({
      eventId: eventState.eventId,
      processingError: `items_fetch_failed:${persistedErr.message}`,
    });
    console.error("[yandex-eda] items_fetch_failed", { err: persistedErr.message });
    return serverError(100, "Internal error");
  }
  const lines = (persisted ?? []).map((it) => ({
    order_item_id: it.id as string,
    product_id: it.product_id as string,
    quantity: Number(it.quantity ?? 1),
  }));

  let stockSettlement: { ok: boolean; error?: string; duplicate?: boolean } = { ok: true };
  if (lines.length > 0) {
    if (parsed.paymentType === "CARD") {
      const { data: raw, error } = await supabase.rpc("pos_finalize_order_stock", {
        p_venue_id: venueId,
        p_order_id: orderId,
        p_occurred_at: closedAt,
        p_lines: lines,
        p_shift_id: shiftId,
        p_strict_insufficient: false,
      });
      if (error) {
        stockSettlement = { ok: false, error: error.message };
      } else {
        const r = raw as { ok?: boolean; duplicate?: boolean; error?: string } | null;
        stockSettlement = r?.ok === false
          ? { ok: false, error: r.error ?? "pos_finalize_order_stock_failed" }
          : { ok: true, duplicate: !!r?.duplicate };
      }
    } else {
      const { data: raw, error } = await supabase.rpc(
        "pos_finalize_marketplace_active_stock",
        {
          p_venue_id: venueId,
          p_order_id: orderId,
          p_occurred_at: openedAt,
          p_lines: lines,
          p_shift_id: shiftId,
        },
      );
      if (error) {
        stockSettlement = { ok: false, error: error.message };
      } else {
        const r = raw as { ok?: boolean; duplicate?: boolean; error?: string } | null;
        stockSettlement = r?.ok === false
          ? { ok: false, error: r.error ?? "pos_finalize_marketplace_active_stock_failed" }
          : { ok: true, duplicate: !!r?.duplicate };
      }
    }
  }

  const metaPatch: Record<string, unknown> = {};
  if (unmappedProducts.length > 0) metaPatch.unmapped_products = unmappedProducts;
  if (unmappedAttributes.length > 0) {
    metaPatch.unmapped_attributes = Array.from(new Set(unmappedAttributes));
  }
  if (!stockSettlement.ok) metaPatch.stock_settlement_error = stockSettlement.error;
  if (
    unmappedProducts.length > 0 ||
    unmappedAttributes.length > 0 ||
    !stockSettlement.ok
  ) {
    metaPatch.requires_review = true;
  }
  if (Object.keys(metaPatch).length > 0) {
    const { data: current } = await supabase
      .from("orders")
      .select("integration_metadata")
      .eq("id", orderId)
      .single();
    const merged = { ...(current?.integration_metadata ?? {}), ...metaPatch };
    await supabase.from("orders").update({ integration_metadata: merged }).eq("id", orderId);
  }

  await markYandexInboundEvent({ eventId: eventState.eventId, linkedOrderId: orderId });

  const finalOrder = await findExistingYandexOrder(venueId, parsed.eatsId);
  if (!finalOrder) {
    console.error("[yandex-eda] order_vanished_after_insert", { eatsId: parsed.eatsId });
    return serverError(100, "Internal error");
  }
  return okJson(buildYandexOrderResponse(finalOrder as any), ORDER_CONTENT_TYPE);
};

// ── GET /order/{eatsId} ──────────────────────────────────────────────────────

const findVenueForOrderByEatsId = async (
  auth: AuthContext,
  eatsId: string,
): Promise<{ venueId: string; order: any } | null> => {
  // Joining with marketplace_store_bindings would be ideal, but we don't store
  // the binding on the order. Use venues.organization_id as the scope guard.
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, shift_id, integration_metadata, total_amount, opened_at, closed_at, venues!inner(id, organization_id)",
    )
    .eq("order_source", "yandex_eda")
    .eq("external_order_id", eatsId)
    .eq("venues.organization_id", auth.organizationId)
    .maybeSingle();
  if (error) {
    console.error("[yandex-eda] order_lookup_failed", { eatsId, err: error.message });
    return null;
  }
  if (!data) return null;
  const venueId = (data.venues as { id: string }).id;
  return { venueId, order: data };
};

const getOrder = async (auth: AuthContext, eatsId: string): Promise<Response> => {
  const found = await findVenueForOrderByEatsId(auth, eatsId);
  if (!found) return notFoundArr("Order not found");
  return okJson(buildYandexOrderResponse(found.order), ORDER_CONTENT_TYPE);
};

const getOrderStatus = async (auth: AuthContext, eatsId: string): Promise<Response> => {
  const found = await findVenueForOrderByEatsId(auth, eatsId);
  if (!found) return notFoundArr("Order not found");
  const meta = (found.order.integration_metadata ?? {}) as Record<string, unknown>;
  const status = String(meta.yandex_status ?? STATUS_INITIAL);
  const history = Array.isArray(meta.status_history) ? meta.status_history : [];
  const lastEntry = history[history.length - 1] ?? null;
  return okJson(
    {
      status,
      comment: typeof meta.cancellation_reason === "string"
        ? String(meta.cancellation_reason)
        : null,
      updatedAt: lastEntry?.at ?? found.order.closed_at ?? found.order.opened_at ?? null,
    },
    ORDER_STATUS_CONTENT_TYPE,
  );
};

// ── PUT /order/{eatsId}/status ───────────────────────────────────────────────

const putOrderStatus = async (
  auth: AuthContext,
  req: Request,
  eatsId: string,
): Promise<Response> => {
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return invalidPayload("Body must be JSON");
  }
  const body = (bodyJson ?? {}) as Record<string, unknown>;
  const nextStatus = String(body.status ?? "").toUpperCase();
  if (!isYandexStatus(nextStatus)) {
    return invalidPayload("Unknown status");
  }

  const found = await findVenueForOrderByEatsId(auth, eatsId);
  if (!found) return notFoundArr("Order not found");
  const meta = (found.order.integration_metadata ?? {}) as Record<string, unknown>;
  const currentStatus = String(meta.yandex_status ?? STATUS_INITIAL) as YandexStatus;
  if (currentStatus === nextStatus) {
    // Idempotent no-op.
    return okJson({ status: nextStatus }, ORDER_STATUS_CONTENT_TYPE);
  }
  const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(nextStatus as YandexStatus)) {
    return badStatusTransition();
  }

  // Cancellation through PUT funnels into the same flow as DELETE.
  if (nextStatus === "CANCELLED") {
    return await cancelOrderInternal(found.venueId, found.order, "yandex_status_put_cancel");
  }

  const now = new Date().toISOString();
  const newHistory = Array.isArray(meta.status_history)
    ? [...meta.status_history, { status: nextStatus, at: now }]
    : [{ status: nextStatus, at: now }];

  const merged = {
    ...meta,
    yandex_status: nextStatus,
    last_event: `status_${nextStatus.toLowerCase()}`,
    status_history: newHistory,
  };

  const updateFields: Record<string, unknown> = { integration_metadata: merged };
  // DELIVERED is terminal for the Yandex side; reflect it on closed_at if not already set.
  if (nextStatus === "DELIVERED" && !found.order.closed_at) {
    updateFields.closed_at = now;
  }

  const { error } = await supabase
    .from("orders")
    .update(updateFields)
    .eq("id", found.order.id);
  if (error) {
    console.error("[yandex-eda] status_update_failed", { eatsId, err: error.message });
    return serverError(100, "Internal error");
  }
  return okJson({ status: nextStatus, updatedAt: now }, ORDER_STATUS_CONTENT_TYPE);
};

// ── DELETE /order/{eatsId} ───────────────────────────────────────────────────

const cancelOrderInternal = async (
  venueId: string,
  order: any,
  reason: string,
): Promise<Response> => {
  const cancelledAt = new Date().toISOString();
  const meta = (order.integration_metadata ?? {}) as Record<string, unknown>;
  const cancellationMeta = {
    ...meta,
    last_event: "order_cancelled",
    cancellation_reason: reason,
    cancelled_at: cancelledAt,
    yandex_status: "CANCELLED",
    status_history: Array.isArray(meta.status_history)
      ? [...meta.status_history, { status: "CANCELLED", at: cancelledAt }]
      : [{ status: "CANCELLED", at: cancelledAt }],
  };

  if (order.status === "cancelled") {
    // Idempotent — already cancelled.
    return okJson({ status: "CANCELLED" }, ORDER_STATUS_CONTENT_TYPE);
  }

  if (order.status === "paid") {
    const { data: raw, error } = await supabase.rpc("pos_refund_order", {
      p_venue_id: venueId,
      p_order_id: order.id,
      p_shift_id: order.shift_id ?? null,
      p_actor_user_id: null,
      p_reason: `yandex_eda:${reason}`,
      p_occurred_at: cancelledAt,
    });
    const r = raw as { ok?: boolean; error?: string } | null;
    const failed = !!error || r?.ok === false;
    if (failed) {
      const refundError = error?.message ?? r?.error ?? "refund_failed";
      const pendingMeta = {
        ...cancellationMeta,
        cancellation_pending: true,
        cancellation_error: refundError,
      };
      await supabase
        .from("orders")
        .update({ integration_metadata: pendingMeta })
        .eq("id", order.id);
      console.error("[yandex-eda] refund_pending", { orderId: order.id, refundError });
      // Per spec we still ACK; ops can recover later via dead-letter UI.
      return okJson({ status: "CANCELLED", note: "refund_pending" }, ORDER_STATUS_CONTENT_TYPE);
    }
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        closed_at: cancelledAt,
        integration_metadata: cancellationMeta,
      })
      .eq("id", order.id);
    return okJson({ status: "CANCELLED" }, ORDER_STATUS_CONTENT_TYPE);
  }

  if (order.status === "active") {
    const { data: raw, error } = await supabase.rpc(
      "pos_cancel_unpaid_marketplace_order",
      { p_venue_id: venueId, p_order_id: order.id, p_reason: reason },
    );
    const r = raw as { ok?: boolean; error?: string } | null;
    if (error || r?.ok === false) {
      const cancelErr = error?.message ?? r?.error ?? "cancel_failed";
      const pendingMeta = {
        ...cancellationMeta,
        cancellation_pending: true,
        cancellation_error: cancelErr,
      };
      await supabase
        .from("orders")
        .update({ integration_metadata: pendingMeta })
        .eq("id", order.id);
      console.error("[yandex-eda] active_cancel_failed", { orderId: order.id, cancelErr });
      return okJson({ status: "CANCELLED", note: "cancel_pending" }, ORDER_STATUS_CONTENT_TYPE);
    }
    // pos_cancel_unpaid_marketplace_order already flips status + closed_at.
    await supabase
      .from("orders")
      .update({ integration_metadata: cancellationMeta })
      .eq("id", order.id);
    return okJson({ status: "CANCELLED" }, ORDER_STATUS_CONTENT_TYPE);
  }

  // Any other status — record and ack.
  await supabase
    .from("orders")
    .update({
      status: "cancelled",
      closed_at: cancelledAt,
      integration_metadata: cancellationMeta,
    })
    .eq("id", order.id);
  return okJson({ status: "CANCELLED" }, ORDER_STATUS_CONTENT_TYPE);
};

const deleteOrder = async (
  auth: AuthContext,
  req: Request,
  eatsId: string,
): Promise<Response> => {
  // Body is optional per Yandex docs (sometimes carries reason/comment).
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const reason = String(body.reason ?? body.comment ?? "yandex_delete").slice(0, 200);
  const found = await findVenueForOrderByEatsId(auth, eatsId);
  if (!found) return notFoundArr("Order not found");
  return await cancelOrderInternal(found.venueId, found.order, reason);
};

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

// Supabase passes the path with the function name as the first segment
// (e.g. "/yandex-eda/security/oauth/token"). Older proxies sometimes include
// the full "/functions/v1/" prefix; handle both forms defensively.
const FUNC_PREFIX = /^(?:\/functions\/v1)?\/yandex-eda/;

const normalisePath = (pathname: string): string => {
  const stripped = pathname.replace(FUNC_PREFIX, "");
  if (!stripped) return "/";
  return stripped.replace(/\/+$/, "") || "/";
};

const compMatcher = /^\/menu\/([^/]+)\/composition$/;
const availMatcher = /^\/menu\/([^/]+)\/availability$/;
const promosMatcher = /^\/menu\/([^/]+)\/promos$/;
const orderMatcher = /^\/order\/([^/]+)$/;
const orderStatusMatcher = /^\/order\/([^/]+)\/status$/;

serve(async (req) => {
  let path = "/";
  try {
    path = normalisePath(new URL(req.url).pathname);
  } catch (err) {
    console.error("[yandex-eda] url_parse_failed", { err: (err as Error)?.message });
    return serverError(100, "Internal error");
  }

  try {
    // OAuth — unauthenticated.
    if (path === "/security/oauth/token") {
      if (req.method !== "POST") return methodNotAllowed();
      return await issueToken(req);
    }

    // POST /order — order intake (write scope).
    if (path === "/order") {
      if (req.method !== "POST") return methodNotAllowed();
      const authResult = await authenticate(req, "write");
      if (authResult instanceof Response) return authResult;
      return await postOrder(authResult, req);
    }

    // /order/{eatsId}/status — GET (read) or PUT (write).
    let m = path.match(orderStatusMatcher);
    if (m) {
      const eatsId = decodeURIComponent(m[1]);
      if (req.method === "GET") {
        const authResult = await authenticate(req, "read");
        if (authResult instanceof Response) return authResult;
        return await getOrderStatus(authResult, eatsId);
      }
      if (req.method === "PUT") {
        const authResult = await authenticate(req, "write");
        if (authResult instanceof Response) return authResult;
        return await putOrderStatus(authResult, req, eatsId);
      }
      return methodNotAllowed();
    }

    // /order/{eatsId} — GET (read) or DELETE (write).
    m = path.match(orderMatcher);
    if (m) {
      const eatsId = decodeURIComponent(m[1]);
      if (req.method === "GET") {
        const authResult = await authenticate(req, "read");
        if (authResult instanceof Response) return authResult;
        return await getOrder(authResult, eatsId);
      }
      if (req.method === "DELETE") {
        const authResult = await authenticate(req, "write");
        if (authResult instanceof Response) return authResult;
        return await deleteOrder(authResult, req, eatsId);
      }
      return methodNotAllowed();
    }

    // Menu / restaurant endpoints — all read-only.
    if (req.method !== "GET") return methodNotAllowed();
    const authResult = await authenticate(req, "read");
    if (authResult instanceof Response) return authResult;
    const auth = authResult;

    if (path === "/restaurants") return await listRestaurants(auth);
    if (path === "/restaurants/availability") return await listRestaurantsAvailability(auth);

    m = path.match(compMatcher);
    if (m) return await buildComposition(auth, decodeURIComponent(m[1]));

    m = path.match(availMatcher);
    if (m) return await getAvailability(auth, decodeURIComponent(m[1]));

    m = path.match(promosMatcher);
    if (m) return await getPromos(auth, decodeURIComponent(m[1]));

    return notFound("Route not found");
  } catch (err) {
    console.error("[yandex-eda] unhandled_error", {
      path,
      method: req.method,
      err: (err as Error)?.message,
      stack: (err as Error)?.stack,
    });
    return serverError(100, "Internal error");
  }
});
