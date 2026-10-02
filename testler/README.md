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
node testler/bayes.mjs                        # sıralamada düzeltilmiş (Bayes) puan: iki tablo, ağırlık, eşik, boş sezon (0021)
node testler/kazananlar.mjs                   # arşivdeki kazanan adları, Wrapped'den önce gizli; senin karen / senin yerin kartları
node testler/webkit.mjs                       # iPhone motorunda taşma ve üst üste binme (siralama.mjs'den sonra)
node testler/kart.mjs                         # kart sistemi denetimi, 390 ve 320px (siralama.mjs'den sonra; karar 118, 119)
node testler/eski-safari.mjs                  # iOS 16 Safari'de kare yükleme (iPhone X): çözme geri yolu, çevirme bilgisi
node testler/bildirim.mjs                     # bildirimler: abonelik, planlayıcı (aşama, 12/2 saat, gece kuralı), gönderim anı doğrulaması (karar 120)
node testler/gonderici.mjs                    # Edge Function çekirdeği: gönderme, 404/410'da abonelik silme, deneme sayısı (veritabanı ister)
node testler/sw.mjs                           # service worker: bildirimi gösterme, dokununca yalnız uygulama içi adres (veritabanı istemez)
node testler/bildirim-ekran.mjs               # bildirim kartı, Ayarlar anahtarı, bekleme ekranı, Aşama sayısı; cihaz durumları taklitle
node testler/oneri.mjs                        # tema önerisi: 3 sınırı, birleşme, geri çekme, bağlama, iptalde havuza (karar 121)
node testler/oneri-ekran.mjs                  # tema önerisi ekranları: kart, form, Önerilerin, havuz, Kurulum'da seçim
node testler/imza.mjs                         # imzalı adresler oturumda yeniden kullanılıyor, çıkışta boşalıyor (egress)
node testler/onizleme.mjs                     # önizleme kopyası depo kuralları: toplu çıkarılanın önizlemesi oylamada gizli (0020)
node testler/onizleme-yukle.mjs               # yüklemede 720 px önizleme, değiştirince/kaldırınca iki dosya da gidiyor
node testler/yon.mjs                          # eski Safari: çevirme ölçümü ve elle çevirme; dikey kare dosyaya ezik kaydedilmiyor
node testler/oran.mjs                         # her ekranda kareler beş boyutta oranı bozulmadan çiziliyor (Oylama basıklığı, 2026-09-30)
node testler/onar.mjs                         # scripts/onar-sunmus.mjs onarım betiği, yerel veritabanında
node testler/basari-seviye.mjs                # başarı seviyeleri, beş eşik (veritabanı istemez)
node testler/basarilar.mjs                    # başarı sayıları: yalnız sonucu açık etkinlik, çıkarılan kare sayılmaz (karar 115)
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
