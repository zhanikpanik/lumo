#!/usr/bin/env python3
"""Phase 3: Fix units on a few ingredients."""
import json, ssl, urllib.request, urllib.error

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
        print(f"  ERROR {e.code}: {e.read().decode()[:200]}")
        return None

print("=== Fix units ===")

# Fix product units
unit_fixes = [
    ("38be8a23-3eb4-4b57-b8b9-5c4fbca3e652", "л"),   # Молоко -> литры
    ("0c741e6a-43ac-4d2a-8379-0062f4eb0191", "л"),   # Масло оливковое -> литры
    ("974d73e1-6d75-4aaf-9e3a-22ea07d8aa23", "л"),   # Молоко кокосовое -> литры
    ("c4644952-185f-4e51-b808-e062431ad346", "л"),   # Молоко миндальное -> литры
]

for pid, unit in unit_fixes:
    api("PATCH", f"products?id=eq.{pid}", {"unit": unit})
    api("PATCH", f"stock_items?product_id=eq.{pid}", {"unit": unit})
    print(f"  Fixed unit to {unit}")

print("\n=== Final check ===")
import urllib.request as ur
req = ur.Request(f"{URL}/rest/v1/products?select=name,stock_quantity,unit&type=eq.ingredient&is_active=eq.true&order=name.asc", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
with ur.urlopen(req, context=CTX) as resp:
    data = json.loads(resp.read())
for p in data:
    print(f"  {p['name']:<25s} {p['stock_quantity']:>6} {p['unit']}")

print("\nDone!")
