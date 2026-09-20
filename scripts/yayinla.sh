#!/usr/bin/env bash
# Derler ve dist/ içeriğini yerel gh-pages dalına bir commit olarak koyar.
# Göndermez: gönderme ayrı bir adım (git push origin gh-pages), yayın öncesi
# güvenlik kontrolleri her gönderimde ayrıca çalışsın diye.
set -euo pipefail
cd "$(dirname "$0")/.."

grep -Eq '^VITE_SUPABASE_PUBLISHABLE_KEY=.+' .env.local 2>/dev/null || {
  echo ".env.local içinde VITE_SUPABASE_PUBLISHABLE_KEY boş. Önce onu doldur." >&2; exit 1; }

npm run build
touch dist/.nojekyll

YER="$(mktemp -d)/gh-pages"
git fetch origin gh-pages 2>/dev/null || true
if git show-ref --verify --quiet refs/heads/gh-pages; then
  git worktree add "$YER" gh-pages
elif git show-ref --verify --quiet refs/remotes/origin/gh-pages; then
  git worktree add -b gh-pages "$YER" origin/gh-pages
else
  git worktree add --orphan -b gh-pages "$YER"
fi
trap 'git worktree remove --force "$YER" >/dev/null 2>&1 || true' EXIT

# Önceki yayınların betikleri kalır: uygulaması açık olan kişi eski adla istiyor. Silinince
# okuyucu (full.esm-*.js) inmiyor, yükleme "çekim tarihi yok" diye reddediliyordu (2026-09-20).
ESKI="$(mktemp -d)"
cp "$YER"/assets/*.js "$YER"/assets/*.css "$ESKI/" 2>/dev/null || true
find "$YER" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R dist/. "$YER/"
cp -n "$ESKI"/* "$YER/assets/" 2>/dev/null || true
git -C "$YER" add -A
if git -C "$YER" diff --cached --quiet; then
  echo "Değişiklik yok, yayın aynı."
  exit 0
fi
git -C "$YER" commit -q -m "yayin: $(git rev-parse --short HEAD)"
echo "gh-pages dalına commit atıldı. Göndermek için: git push origin gh-pages"
