#!/usr/bin/env python3
"""Phase 2: fix remaining issues after initial cleanup."""
import json
import ssl
import urllib.request
import urllib.error

URL = "https://gmigxjrvypqjakvualil.supabase.co"
KEY = "sb_publishable_bNXLWbJVGS5Dp2FUPywFkQ_9Cg_mPTu"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def api(method, path, body=None):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"},
        data=json.dumps(body).encode() if body else None,
    )
    try:
        with urllib.request.urlopen(req, context=CTX) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"  ERROR {e.code}: {body}")
        return None

def get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    try:
        with urllib.request.urlopen(req, context=CTX) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  GET ERROR {e.code}: {e.read().decode()[:200]}")
        return []

# ============================================================
# STEP 1: Delete order_items for junk dish "123", then delete the dish
# ============================================================
print("=== Fix: Delete junk dish '123' ===")
junk_dish = "b3069337-38ff-49b9-884c-a6a469d3ff3c"
ois = get(f"order_items?select=id&product_id=eq.{junk_dish}")
print(f"  Found {len(ois)} order_items referencing '123'")
for oi in ois:
    api("DELETE", f"order_item_modifiers?order_item_id=eq.{oi['id']}")
    api("DELETE", f"order_items?id=eq.{oi['id']}")
api("DELETE", f"recipe_items?product_id=eq.{junk_dish}")
api("DELETE", f"product_modifier_groups?product_id=eq.{junk_dish}")
api("DELETE", f"products?id=eq.{junk_dish}")
print("  Done")

# ============================================================
# STEP 2: Sync products.stock_quantity from stock_items
# ============================================================
print("\n=== Fix: Sync products.stock_quantity ===")

# Get stock sums
stock = get("stock_items?select=product_id,quantity")
from collections import defaultdict
stock_sum = defaultdict(float)
for s in stock:
    stock_sum[s["product_id"]] += float(s["quantity"])

print(f"  Stock sums for {len(stock_sum)} products")

# Update each product
for pid, total in stock_sum.items():
    api("PATCH", f"products?id=eq.{pid}", {"stock_quantity": round(total, 3)})

print("  Done")

# ============================================================
# VERIFY
# ============================================================
print("\n=== FINAL VERIFICATION ===")
ingredients = get("products?select=id,name,stock_quantity,unit&type=eq.ingredient&is_active=eq.true&order=name.asc")
print(f"\nIngredients ({len(ingredients)}):")
for p in ingredients:
    print(f"  {p['name']:<25s} stock={p.get('stock_quantity','?'):>8} {p.get('unit','')}")

dishes = get("products?select=id,name,type,is_active&type=eq.dish&is_active=eq.true&order=name.asc")
print(f"\nDishes ({len(dishes)}):")

recipes = get("recipe_items?select=product_id")
recipe_dish_ids = set(r["product_id"] for r in recipes)

for d in dishes:
    has_recipe = "🍳" if d["id"] in recipe_dish_ids else "⚠️"
    print(f"  {has_recipe} {d['name']}")

print("\n=== ALL DONE ===")
