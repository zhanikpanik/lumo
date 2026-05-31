// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type GlovoDispatched = {
  order_id: string;
  store_id: string;
  order_time?: string;
  special_requirements?: string | null;
  allergy_info?: string | null;
  estimated_total_price?: number | null;
  products?: Array<{
    id: string;
    name?: string;
    price?: number;
    quantity?: number;
    attributes?: Array<{
      id?: string;
      name?: string;
      price?: number;
      quantity?: number;
    }>;
  }>;
};

type GlovoCancelled = {
  order_id: string;
  store_id: string;
  cancel_reason?: string;
  payment_strategy?: string;
};

type EventType = "order_dispatched" | "order_cancelled";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GLOVO_WEBHOOK_TOKEN = Deno.env.get("GLOVO_WEBHOOK_TOKEN") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

// Constant-time string comparison to thwart timing attacks on the shared token.
const timingSafeEqual = (a: string, b: string): boolean => {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  // Compare against a fixed-length view of the longer string so the loop count
  // does not leak which input is longer.
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const toMoney = (value?: number | null): number => Number(((value ?? 0) / 100).toFixed(2));

const parseEventType = (payload: Record<string, unknown>): EventType | null => {
  if (typeof payload.cancel_reason === "string") return "order_cancelled";
  if (Array.isArray(payload.products)) return "order_dispatched";
  return null;
};

const parseIsoOrNow = (value?: string | null): string => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const nextOrderNumber = async (venueId: string): Promise<string> => {
  const { data, error } = await supabase.rpc("marketplace_next_order_number", {
    p_venue_id: venueId,
  });
  if (error) throw new Error(`order_number_rpc_failed: ${error.message}`);
  return String(data ?? "");
};

const resolveModifierBindings = async (
  venueId: string,
  externalIds: string[],
): Promise<Map<string, string>> => {
  if (externalIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("marketplace_modifier_bindings")
    .select("external_modifier_id, modifier_id")
    .eq("venue_id", venueId)
    .eq("provider", "glovo")
    .eq("enabled", true)
    .in("external_modifier_id", externalIds);
  if (error) {
    console.error("[glovo-inbound] modifier_bindings_lookup_failed", {
      venueId,
      error: error.message,
    });
    return new Map();
  }
  return new Map((data ?? []).map((r) => [String(r.external_modifier_id), r.modifier_id as string]));
};

// product_id → set of modifier_ids that are actually attached to the product via
// product_modifier_groups. Used to drop linkages that pos_finalize_order_stock
// would otherwise reject as invalid_order_item_modifiers.
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
    console.error("[glovo-inbound] modifier_groups_lookup_failed", {
      venueId,
      error: error.message,
    });
    return result;
  }

  for (const row of data ?? []) {
    const productId = row.product_id as string;
    const set = result.get(productId) ?? new Set<string>();
    const group = (row as { modifier_groups?: { modifiers?: Array<{ id: string }> } | Array<unknown> }).modifier_groups;
    const groups = Array.isArray(group) ? group : group ? [group] : [];
    for (const g of groups) {
      const mods = (g as { modifiers?: Array<{ id: string }> }).modifiers ?? [];
      for (const m of mods) set.add(m.id);
    }
    result.set(productId, set);
  }
  return result;
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

const saveInboundEvent = async (args: {
  eventType: EventType;
  payload: Record<string, unknown>;
  externalOrderId: string;
  externalEventId: string;
  venueId?: string | null;
}): Promise<{ eventId: string | null; duplicate: boolean; retryAfterFailure: boolean }> => {
  const { data, error } = await supabase
    .from("marketplace_inbound_events")
    .insert({
      provider: "glovo",
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

  // Already ingested — decide whether to re-run processing or short-circuit.
  const { data: existing, error: lookupError } = await supabase
    .from("marketplace_inbound_events")
    .select("id, processed_at, processing_error")
    .eq("provider", "glovo")
    .eq("external_event_id", args.externalEventId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  const eventId = existing?.id ?? null;
  // Previously failed (no processed_at OR processing_error set): allow another attempt
  // so transient errors don't permanently strand the event.
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

const markInboundEvent = async (args: {
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

const resolveVenue = async (externalStoreId: string): Promise<string | null> => {
  const { data } = await supabase
    .from("marketplace_store_bindings")
    .select("venue_id")
    .eq("provider", "glovo")
    .eq("external_store_id", externalStoreId)
    .eq("enabled", true)
    .maybeSingle();
  return data?.venue_id ?? null;
};

type DispatchResult = {
  orderId: string;
  unmappedProducts: string[];
  shiftId: string | null;
  paymentInserted: boolean;
  stockSettlement: { ok: boolean; error?: string; duplicate?: boolean };
};

const upsertOrderFromDispatch = async (
  venueId: string,
  payload: GlovoDispatched,
): Promise<DispatchResult> => {
  const externalOrderId = payload.order_id;
  const totalAmount = toMoney(payload.estimated_total_price);
  const commentParts = [payload.special_requirements, payload.allergy_info].filter(Boolean);
  const openedAt = parseIsoOrNow(payload.order_time);
  const closedAt = new Date().toISOString();
  const comment = commentParts.length > 0 ? commentParts.join(" | ") : null;

  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("venue_id", venueId)
    .eq("order_source", "glovo")
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  const shiftId = await getOpenShiftId(venueId);
  const number = existing ? undefined : await nextOrderNumber(venueId);
  const orderId = existing?.id ?? crypto.randomUUID();

  const baseMetadata: Record<string, unknown> = {
    provider: "glovo",
    raw_order: payload,
    last_event: "order_dispatched",
    received_at: closedAt,
    auto_paid: true,
  };

  if (existing) {
    const { error } = await supabase
      .from("orders")
      .update({
        status: "paid",
        shift_id: shiftId,
        comment,
        total_amount: totalAmount,
        integration_metadata: baseMetadata,
        closed_at: closedAt,
      })
      .eq("id", orderId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("orders").insert({
      id: orderId,
      venue_id: venueId,
      shift_id: shiftId,
      number,
      status: "paid",
      guest_count: 1,
      order_type: "Glovo",
      comment,
      is_quick_check: true,
      order_source: "glovo",
      external_order_id: externalOrderId,
      integration_metadata: baseMetadata,
      opened_at: openedAt,
      closed_at: closedAt,
      total_amount: totalAmount,
    });
    if (error) throw new Error(error.message);
  }

  const existingItems = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId);

  const existingItemIds = (existingItems.data ?? []).map((x) => x.id as string);
  if (existingItemIds.length > 0) {
    await supabase.from("order_item_modifiers").delete().in("order_item_id", existingItemIds);
    await supabase.from("order_items").delete().eq("order_id", orderId);
  }

  const products = payload.products ?? [];
  const externalIds = Array.from(new Set(products.map((p) => String(p.id)).filter(Boolean)));
  const { data: mappedProducts } = await supabase
    .from("products")
    .select("id, external_id")
    .eq("venue_id", venueId)
    .eq("external_source", "glovo")
    .in("external_id", externalIds);

  const map = new Map<string, string>((mappedProducts ?? []).map((p) => [String(p.external_id), p.id as string]));

  const attrExternalIds = Array.from(
    new Set(
      products
        .flatMap((p) => (Array.isArray(p.attributes) ? p.attributes : []))
        .map((a) => (a?.id != null ? String(a.id) : ""))
        .filter(Boolean),
    ),
  );
  const modifierMap = await resolveModifierBindings(venueId, attrExternalIds);
  const allowedPerProduct = await loadAllowedModifiersPerProduct(
    venueId,
    Array.from(new Set([...map.values()])),
  );

  const unmappedProducts: string[] = [];
  const unmappedAttributes: string[] = [];
  const orderItems: Array<Record<string, unknown>> = [];
  const modifierRows: Array<Record<string, unknown>> = [];

  for (const p of products) {
    const extId = String(p.id);
    const productId = map.get(extId);
    if (!productId) {
      unmappedProducts.push(extId);
      continue;
    }

    const itemId = crypto.randomUUID();
    orderItems.push({
      id: itemId,
      order_id: orderId,
      product_id: productId,
      product_name: p.name ?? `Glovo item ${extId}`,
      product_price: toMoney(p.price),
      quantity: Number(p.quantity ?? 1),
      guest_number: 1,
      comment: null,
    });

    const allowedForProduct = allowedPerProduct.get(productId) ?? new Set<string>();
    const attrs = Array.isArray(p.attributes) ? p.attributes : [];
    for (const a of attrs) {
      const attrExtId = a?.id != null ? String(a.id) : "";
      const resolvedId = attrExtId ? modifierMap.get(attrExtId) ?? null : null;
      const validForProduct = resolvedId !== null && allowedForProduct.has(resolvedId);
      const finalModifierId = validForProduct ? resolvedId : null;
      if (attrExtId && !validForProduct) unmappedAttributes.push(attrExtId);
      modifierRows.push({
        order_item_id: itemId,
        modifier_id: finalModifierId,
        modifier_name: a.name ?? attrExtId ?? "attr",
        modifier_price: toMoney(a.price),
      });
    }
  }

  if (orderItems.length > 0) {
    const insertRes = await supabase.from("order_items").insert(orderItems);
    if (insertRes.error) throw new Error(insertRes.error.message);
  }
  if (modifierRows.length > 0) {
    const modRes = await supabase.from("order_item_modifiers").insert(modifierRows);
    if (modRes.error) throw new Error(modRes.error.message);
  }

  // Idempotent "Glovo settles externally" payment so the order participates in shift
  // revenue/total_orders but does not inflate cash totals (method='other').
  const paymentIdempotencyKey = `glovo:${externalOrderId}`;
  const paymentInsert = await supabase
    .from("payments")
    .insert({
      order_id: orderId,
      venue_id: venueId,
      shift_id: shiftId,
      method: "other",
      amount: totalAmount,
      idempotency_key: paymentIdempotencyKey,
    })
    .select("id")
    .maybeSingle();
  const paymentInserted = !paymentInsert.error;
  if (paymentInsert.error && paymentInsert.error.code !== "23505") {
    throw new Error(`payment_insert_failed: ${paymentInsert.error.message}`);
  }

  // Build stock-settlement lines from the items we just persisted. The RPC reads modifiers
  // straight from order_item_modifiers, so we only need product/qty here.
  const { data: persistedItems, error: itemsFetchError } = await supabase
    .from("order_items")
    .select("id, product_id, quantity")
    .eq("order_id", orderId);
  if (itemsFetchError) throw new Error(`items_fetch_failed: ${itemsFetchError.message}`);

  const lines = (persistedItems ?? []).map((it) => ({
    order_item_id: it.id as string,
    product_id: it.product_id as string,
    quantity: Number(it.quantity ?? 1),
  }));

  let stockSettlement: { ok: boolean; error?: string; duplicate?: boolean } = { ok: true };
  if (lines.length > 0) {
    const { data: stockRaw, error: stockErr } = await supabase.rpc("pos_finalize_order_stock", {
      p_venue_id: venueId,
      p_order_id: orderId,
      p_occurred_at: closedAt,
      p_lines: lines,
      p_shift_id: shiftId,
      // Don't block Glovo orders on insufficient stock — record and continue.
      p_strict_insufficient: false,
    });
    if (stockErr) {
      stockSettlement = { ok: false, error: stockErr.message };
    } else {
      const raw = stockRaw as { ok?: boolean; duplicate?: boolean; error?: string } | null;
      stockSettlement = raw?.ok === false
        ? { ok: false, error: raw.error ?? "pos_finalize_order_stock_failed" }
        : { ok: true, duplicate: !!raw?.duplicate };
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

  return { orderId, unmappedProducts, shiftId, paymentInserted, stockSettlement };
};

type CancelResult = {
  orderId: string | null;
  refundAttempted: boolean;
  refundError?: string;
  refundDuplicate?: boolean;
};

const handleCancelled = async (
  venueId: string,
  payload: GlovoCancelled,
): Promise<CancelResult> => {
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, shift_id, integration_metadata")
    .eq("venue_id", venueId)
    .eq("order_source", "glovo")
    .eq("external_order_id", payload.order_id)
    .maybeSingle();

  if (!order) return { orderId: null, refundAttempted: false };

  const cancelledAt = new Date().toISOString();
  const cancellation = {
    reason: payload.cancel_reason ?? null,
    payment_strategy: payload.payment_strategy ?? null,
    cancelled_at: cancelledAt,
  };

  // If order was auto-paid, route through the refund RPC to reverse cash ledger + stock.
  if (order.status === "paid") {
    const { data: refundRaw, error: refundErr } = await supabase.rpc("pos_refund_order", {
      p_venue_id: venueId,
      p_order_id: order.id,
      p_shift_id: order.shift_id ?? null,
      p_actor_user_id: null,
      p_reason: `glovo:${payload.cancel_reason ?? "unspecified"}`,
      p_occurred_at: cancelledAt,
    });

    const raw = refundRaw as { ok?: boolean; duplicate?: boolean; error?: string } | null;
    const failed = !!refundErr || (raw?.ok === false);
    const refundError = refundErr?.message ?? raw?.error;

    if (failed) {
      // Refund failed (e.g. shift_not_open) — keep order as paid, leave a marker for ops.
      const metadata = {
        ...(order.integration_metadata ?? {}),
        cancellation,
        cancellation_pending: true,
        cancellation_error: refundError ?? "refund_failed",
        last_event: "order_cancelled",
      };
      await supabase
        .from("orders")
        .update({ integration_metadata: metadata })
        .eq("id", order.id);
      return {
        orderId: order.id as string,
        refundAttempted: true,
        refundError: refundError ?? "refund_failed",
      };
    }

    // Refund succeeded — pos_refund_order leaves the order in 'active' so POS can
    // cancel-the-refund. For Glovo cancellations there is no UI workflow, so we
    // also flip the order into the terminal 'cancelled' state ourselves.
    const metadata = {
      ...(order.integration_metadata ?? {}),
      cancellation,
      last_event: "order_cancelled",
    };
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        closed_at: cancelledAt,
        integration_metadata: metadata,
      })
      .eq("id", order.id);
    return {
      orderId: order.id as string,
      refundAttempted: true,
      refundDuplicate: !!raw?.duplicate,
    };
  }

  // Non-paid (e.g. unmapped earlier and stayed in some other status): just record cancel.
  const metadata = {
    ...(order.integration_metadata ?? {}),
    cancellation,
    last_event: "order_cancelled",
  };
  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      closed_at: cancelledAt,
      integration_metadata: metadata,
    })
    .eq("id", order.id);
  if (error) throw new Error(error.message);

  return { orderId: order.id as string, refundAttempted: false };
};

serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  if (GLOVO_WEBHOOK_TOKEN) {
    const provided = extractAuthToken(req.headers.get("Authorization") ?? "");
    if (!provided || !timingSafeEqual(provided, GLOVO_WEBHOOK_TOKEN)) {
      return json(401, { ok: false, error: "unauthorized" });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const eventType = parseEventType(payload);
  const externalOrderId = String(payload.order_id ?? "");
  const externalStoreId = String(payload.store_id ?? "");
  if (!eventType || !externalOrderId || !externalStoreId) {
    return json(400, { ok: false, error: "invalid_payload" });
  }

  const externalEventId = eventType === "order_cancelled"
    ? `${eventType}:${externalOrderId}:${String(payload.cancel_reason ?? "none")}`
    : `${eventType}:${externalOrderId}`;

  let eventId: string | null = null;
  try {
    const venueId = await resolveVenue(externalStoreId);
    const eventSaved = await saveInboundEvent({
      eventType,
      payload,
      externalOrderId,
      externalEventId,
      venueId,
    });

    if (eventSaved.duplicate) {
      return json(200, { ok: true, duplicate: true });
    }
    eventId = eventSaved.eventId;
    const retried = eventSaved.retryAfterFailure;

    if (!venueId) {
      await markInboundEvent({
        eventId,
        processingError: "unknown_store_binding",
      });
      return json(202, { ok: true, accepted: true, warning: "unknown_store_binding", retried });
    }

    if (eventType === "order_dispatched") {
      const dispatched = payload as unknown as GlovoDispatched;
      const result = await upsertOrderFromDispatch(venueId, dispatched);
      const processingError = result.stockSettlement.ok
        ? null
        : `stock_settlement:${result.stockSettlement.error}`;
      await markInboundEvent({
        eventId,
        linkedOrderId: result.orderId,
        processingError,
      });
      return json(200, {
        ok: true,
        event_type: eventType,
        order_id: result.orderId,
        unmapped_products: result.unmappedProducts,
        auto_paid: true,
        payment_inserted: result.paymentInserted,
        stock_settlement: result.stockSettlement,
        shift_id: result.shiftId,
        retried,
      });
    }

    const cancelled = payload as unknown as GlovoCancelled;
    const cancelResult = await handleCancelled(venueId, cancelled);
    let processingError: string | null = null;
    if (!cancelResult.orderId) processingError = "order_not_found_for_cancel";
    else if (cancelResult.refundError) processingError = `refund:${cancelResult.refundError}`;
    await markInboundEvent({
      eventId,
      linkedOrderId: cancelResult.orderId,
      processingError,
    });
    return json(200, {
      ok: true,
      event_type: eventType,
      linked_order_id: cancelResult.orderId,
      refund_attempted: cancelResult.refundAttempted,
      refund_error: cancelResult.refundError ?? null,
      refund_duplicate: cancelResult.refundDuplicate ?? false,
      retried,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    console.error("[glovo-inbound] processing_failed", {
      event_id: eventId,
      external_event_id: externalEventId,
      external_order_id: externalOrderId,
      external_store_id: externalStoreId,
      event_type: eventType,
      error: message,
    });
    await markInboundEvent({
      eventId,
      processingError: message,
    });
    return json(500, { ok: false, error: message, event_id: eventId });
  }
});
