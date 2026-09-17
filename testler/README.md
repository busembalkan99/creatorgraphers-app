# Davranış testleri

Yerel Supabase'e karşı çalışır, gerçek hesaplara dokunmaz.

```
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,mailpit,postgres-meta
npm run dev                                   # ayrı pencerede, localhost:5180
node testler/exifjpeg.mjs "$(date +%Y:%m:%d)"  # /tmp/cgapp altına test kareleri
node testler/rls.mjs                          # sunucu kuralları
node testler/siralama.mjs                     # sezon sıralaması, profil, çekim tarifi
node testler/ui.mjs                           # ekranlar, iki kişi baştan sona
node testler/kabuk.mjs                        # telefon kabuğu (siralama.mjs'den sonra)
```

`ui.mjs` ve `exifjpeg.mjs` Playwright'ı `~/.local/playwright-mcp` altından alıyor.
Testler yerel veritabanını her seferinde temizler.

`kabuk.mjs` uygulamanın çerçevesini ölçer: belge kaymıyor mu, alt çubuk ekranın alt
kenarında mı, üst künye kaydırınca tepede kalıyor mu, güvenli alan payı doğru yerde mi,
link kartı ve simgeler yerinde mi. Bu dosya gözle yakalanan kusurlar yüzünden var;
her kontrolün kusur konunca gerçekten kaldığı denendi.
