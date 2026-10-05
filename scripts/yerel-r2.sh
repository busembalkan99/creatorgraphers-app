#!/bin/bash
# Yerelde R2'nin yerine yerel Supabase'in S3 servisi (karar 127). MinIO imajları artık indirilemiyor
# (Docker Hub kaldırıldı, quay yetki istiyor). Ayrı kova: r2-yerel. Erişim değerleri yerel CLI varsayılanları;
# .env.yerel'e yazılıyor (gitignore), ekrana basılmıyor.
set -e
cd "$(dirname "$0")/.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET|S3_PROTOCOL_REGION)=')"
curl -s -o /dev/null -X POST "$API_URL/storage/v1/bucket" -H "authorization: Bearer $SERVICE_ROLE_KEY" -H 'content-type: application/json' \
  -d '{"id":"r2-yerel","name":"r2-yerel","public":false}' || true
cat > supabase/functions/.env.yerel <<EOT
R2_ADRES=$API_URL/storage/v1/s3
R2_IC_ADRES=http://host.docker.internal:54321/storage/v1/s3
R2_KOVA=r2-yerel
R2_BOLGE=$S3_PROTOCOL_REGION
R2_ACCESS_KEY_ID=$S3_PROTOCOL_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=$S3_PROTOCOL_ACCESS_KEY_SECRET
EOT
echo "Yerel R2 hazır: kova r2-yerel, ayarlar supabase/functions/.env.yerel"
