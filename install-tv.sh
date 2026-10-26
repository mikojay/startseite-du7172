#!/bin/bash
# Packages the Startseite app, signs it with the "startseite" certificate profile,
# installs it on the TV and opens it. Changes no TV startup or Home settings.
# Usage: bash install-tv.sh <TV-IP>
set -e
cd "$(dirname "$0")"

if [ -z "${1:-}" ]; then
  echo "Fehler: TV-IP erforderlich, z. B. bash install-tv.sh 192.168.168.XXX" >&2
  exit 1
fi
TV="$1"
SERIAL="$TV:26101"
TOOLS="$HOME/tizen-studio/tools"
TIZEN="$TOOLS/ide/bin/tizen"
SDB="$TOOLS/sdb"
PROFILE="startseite"
APP_ID="JschHome01.Startseite"

[ -x "$TIZEN" ] || { echo "Tizen CLI nicht gefunden unter $TIZEN"; exit 1; }
[ -f app/config.xml ] || { echo "Ordner 'app' fehlt. Skript im CleanFrame-Ordner ausführen."; exit 1; }

echo "== 1/4 Paket bauen und signieren"
rm -rf dist && mkdir -p dist/build
cp -R app/. dist/build/
find dist/build -name '.DS_Store' -delete
"$TIZEN" package -t wgt -s "$PROFILE" -o "$PWD/dist" -- "$PWD/dist/build"
WGT=$(ls dist/*.wgt 2>/dev/null | head -1)
[ -n "$WGT" ] || { echo "Kein .wgt erstellt. Ausgabe oben prüfen."; exit 1; }
echo "Paket: $WGT"

echo "== 2/4 Mit dem Fernseher verbinden ($TV)"
"$SDB" connect "$TV"

echo "== 3/4 Installieren"
REMOTE="/home/owner/share/tmp/sdk_tools/startseite-$(date +%s).wgt"
"$SDB" -s "$SERIAL" push "$WGT" "$REMOTE"
OUT=$("$SDB" -s "$SERIAL" shell 0 vd_appinstall "$APP_ID" "$REMOTE" 2>&1 || true)
echo "$OUT" | tail -5
if ! echo "$OUT" | grep -q "install completed"; then
  echo "Installation nicht bestätigt. Versuche Alternative (tizen install) ..."
  "$TIZEN" install -n "$(basename "$WGT")" -s "$SERIAL" -- dist
fi

echo "== 4/4 Starten"
"$SDB" -s "$SERIAL" shell 0 execute "$APP_ID"
echo "Fertig. Schau auf den Fernseher."
