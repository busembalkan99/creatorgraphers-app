# Davranış testleri

Yerel Supabase'e karşı çalışır, gerçek hesaplara dokunmaz.

```
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,mailpit,postgres-meta
npm run dev                                   # ayrı pencerede, localhost:5180
node testler/exifjpeg.mjs "$(date +%Y:%m:%d)"  # /tmp/cgapp altına test kareleri
node testler/rls.mjs                          # sunucu kuralları (75 deneme)
node testler/ui.mjs                           # ekranlar, iki kişi baştan sona (172 deneme)
```

`ui.mjs` ve `exifjpeg.mjs` Playwright'ı `~/.local/playwright-mcp` altından alıyor.
Testler yerel veritabanını her seferinde temizler.
