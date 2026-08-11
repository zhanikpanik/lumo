#!/bin/bash

# Print Bridge launcher — finds the printer on the local network
# and starts the HTTP→TCP ESC/POS gateway.
#
# Usage:
#   ./scripts/start-print-bridge.sh [printer_ip]
#
# Without args: uses EXPO_PUBLIC_PRINTER_IP from .env or defaults to 192.168.1.100

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env if present
if [ -f "$SCRIPT_DIR/.env.local" ]; then
  set -a
  source "$SCRIPT_DIR/.env.local"
  set +a
fi

PRINTER_IP="${1:-${EXPO_PUBLIC_PRINTER_IP:-192.168.1.100}}"
BRIDGE_PORT="${EXPO_PUBLIC_PRINT_BRIDGE_PORT:-3456}"

echo "🔍 Scanning for printer at $PRINTER_IP:9100..."

# Quick TCP connectivity check
if nc -z -w 2 "$PRINTER_IP" 9100 2>/dev/null; then
  echo "✅ Printer found at $PRINTER_IP:9100"
else
  echo "⚠️  Printer not found at $PRINTER_IP:9100"
  echo "   The bridge will start anyway — it will retry on each print job."
  echo ""
  echo "   To find your printer's IP:"
  echo "   1. Check your router's DHCP client list"
  echo "   2. Or scan: arp -a | grep -i xprinter"
  echo "   3. Or: nmap -sn 192.168.1.0/24 (adjust subnet)"
  echo ""
fi

echo "🚀 Starting Print Bridge on port $BRIDGE_PORT..."
echo "   Printer: $PRINTER_IP:9100"
echo ""

exec node "$SCRIPT_DIR/src/print/bridge.mjs" \
  --port "$BRIDGE_PORT" \
  --printer "$PRINTER_IP"
