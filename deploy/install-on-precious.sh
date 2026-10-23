#!/usr/bin/env bash
# One-time installation of the SysBio site on precious.polito.it.
# Run as:  sudo bash install-on-precious.sh
# Idempotent: safe to run again.
set -euo pipefail

REPO="https://github.com/alfredobenso/sysbio-website.git"
DOCROOT="/var/www/sysbio"
OWNER="abenso"          # the user whose cron job pulls updates
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

echo "== 1/5  Apache modules (headers, rewrite, deflate, ssl)"
a2enmod -q headers rewrite deflate ssl

echo "== 2/5  Document root $DOCROOT (built site = branch 'build' of the repo)"
if [ ! -d "$DOCROOT/.git" ]; then
  mkdir -p "$DOCROOT"
  chown "$OWNER":www-data "$DOCROOT"
  sudo -u "$OWNER" git clone -q -b build --single-branch "$REPO" "$DOCROOT"
else
  sudo -u "$OWNER" git -C "$DOCROOT" pull -q
fi
chmod -R o+rX "$DOCROOT"

echo "== 3/5  Virtual host"
cp "$HERE/apache/sysbio.conf" /etc/apache2/sites-available/sysbio.conf
a2ensite -q sysbio
apache2ctl configtest

echo "== 4/5  Reload Apache"
systemctl reload apache2

echo "== 5/5  Hourly update from GitHub (crontab of $OWNER)"
CRON_LINE="17 * * * * cd $DOCROOT && git pull -q --ff-only >/dev/null 2>&1"
( sudo -u "$OWNER" crontab -l 2>/dev/null | grep -v "$DOCROOT" ; echo "$CRON_LINE" ) | sudo -u "$OWNER" crontab -

echo
echo "Done. Test before the DNS change with:"
echo "  curl -k --resolve www.sysbio.polito.it:443:130.192.16.169 https://www.sysbio.polito.it/ | head"
echo "After DNS points here:"
echo "  sudo certbot --apache -d www.sysbio.polito.it -d sysbio.polito.it"
