# Creatorgraphers

20 kişilik fotoğraf kulübünün uygulaması. Telefonda linkten açılır, ana ekrana eklenebilir.

- Arayüz: React + Vite, GitHub Pages'te
- Giriş, veritabanı, fotoğraf deposu: Supabase
- Tasarım ve kararlar: `buse-design-claude/ideations/creatorgraphers/`

## Ortam değişkenleri

| Değişken | Ne |
|---|---|
| `VITE_SUPABASE_URL` | Supabase proje adresi |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys > Publishable key |

Şablon `.env.example`. Dosyalar git'e girmez.

- `.env.local`: gerçek proje. `npm run build` ve `npm run dev:canli` bunu kullanır.
- `.env.development.local`: yerel Supabase (`npx supabase status` çıktısından). `npm run dev` bunu kullanır.

**service_role ya da gizli anahtar hiçbir dosyaya yazılmaz.** Tarayıcıya giden tek anahtar publishable anahtar.

## Yerelde çalıştırma

```
npm install

# gerçek projeye bağlı (Google girişi dahil)
npm run dev:canli   # http://localhost:5180

# yerel Supabase'e bağlı (testler için, Docker gerekir)
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,mailpit,postgres-meta
npm run dev         # http://localhost:5180
```

Port 5180, çünkü 5173 bu makinede başka bir projede. Supabase'de izinli adreslere
`http://localhost:5180/**` ve `https://busebalkan99.github.io/creatorgraphers-app/**` eklenmeli.

## Google girişi

`src/ekranlar/Giris.tsx` içinde `signInWithOAuth({ provider: 'google' })`. Dönüş adresi sabit değil:
`window.location.origin + import.meta.env.BASE_URL`, yani yerelde de yayında da doğru yere döner.
Adresler `#/...` ile çalıştığı ve Google ana sayfaya döndüğü için GitHub Pages'te 404 ayarı gerekmez.

Gizlilik sayfası: `public/privacy/index.html` → https://busebalkan99.github.io/creatorgraphers-app/privacy/

## Yayın

```
npm run yayinla           # derler, dist/ içeriğini yerel gh-pages dalına commit eder
git push origin gh-pages  # ayrı adım
```

GitHub > Settings > Pages: kaynak `gh-pages` dalı, kök klasör.

## Veritabanı

`supabase/migrations/` altındaki SQL dosyaları. Kuralların hepsi sunucuda:
yalnız üyeler içeri girer, yükleme boyunca herkes sadece kendi karesini görür,
buluşma temasında çekim günü sunucuda da kontrol edilir, roller yalnız fonksiyonlardan değişir.

## Testler

`testler/README.md`
