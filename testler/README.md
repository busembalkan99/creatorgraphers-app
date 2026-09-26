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
node testler/ekranlar.mjs                     # ekranların veri hâlleri (siralama.mjs'den sonra)
node testler/zaman.mjs                        # Türkçe saat ve yıl ekleri (veritabanı istemez)
node testler/kare.mjs                         # kare bilgisinin okunması: okuyucu inmezse, bozuk makine bilgisi (veritabanı istemez)
node testler/yoklama.mjs                      # yoklama ve yarışmadan çıkarma, sunucu kuralları
node testler/davranis-yoklama.mjs             # aynı özelliğin davranış testi, üç kişiyle ekranda
node testler/oy-ilerleme.mjs                  # yöneticinin gördüğü oylama ilerlemesi, sunucu kuralları
node testler/wrapped.mjs                      # sonuç açılışının sayıları ve izlendi kaydı, sunucu kuralları
node testler/davranis-wrapped.mjs             # Wrapped ekranda: kart kümesi, gezinme, kişisel kartın altı durumu
node testler/paylasim.mjs                     # paylaşım kartının kontakt şeridi: afiş izni, sunucu kuralları
node testler/davranis-paylas.mjs              # paylaşım ekranı: dört düzen, indirilen PNG, kimde düğme var
node testler/serbest.mjs                      # serbest (ekstra) etkinlik: sezon ağırlığı, Serbest tablosu, ekranlar
node testler/kazananlar.mjs                   # arşivdeki kazanan adları, Wrapped'den önce gizli; senin karen / senin yerin kartları
node testler/webkit.mjs                       # iPhone motorunda taşma ve üst üste binme (siralama.mjs'den sonra)
node testler/kart.mjs                         # kart sistemi denetimi, 390 ve 320px (siralama.mjs'den sonra; karar 118, 119)
node testler/gorsel.mjs <etiket> [yol ...]    # önce/sonra ekran görüntüleri, /tmp/cgapp/ss altına
```

`ui.mjs` ve `exifjpeg.mjs` Playwright'ı `~/.local/playwright-mcp` altından alıyor.
Testler yerel veritabanını her seferinde temizler.

`kabuk.mjs` uygulamanın çerçevesini ölçer: belge kaymıyor mu, alt çubuk ekranın alt
kenarında mı, üst künye kaydırınca tepede kalıyor mu, güvenli alan payı doğru yerde mi,
link kartı ve simgeler yerinde mi. Sayfa hareketini de ölçer: ileri, geri ve sekme
geçişinin yönü, geri dönünce hiçbir karede başa dönülmemesi (her karede örnekleyerek,
bellek doluyken ve boşken), bellekteki verinin başka üyeye sızmaması, sayfa
yakınlaştırmasının kapalı olması. Fotoğraf büyütecinin jestleri `ui.mjs` içinde. Bu dosya gözle yakalanan kusurlar yüzünden var;
her kontrolün kusur konunca gerçekten kaldığı denendi.

`kartDenetim.mjs` kart sisteminin ekrandan bağımsız denetimi (köşe, iç boşluk, çizgi kalıntısı,
başlık, nefes, taşma). `kart.mjs` ekran ekran, `ui.mjs` Yükleme ve Giriş durumlarında,
`davranis-tahmin.mjs` oylama ve tahmin durumlarında çağırıyor.
