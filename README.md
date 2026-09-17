# Creatographers

20 kişilik fotoğraf kulübünün uygulaması. Telefonda linkten açılır, ana ekrana eklenebilir.

- Arayüz: React + Vite, GitHub Pages'te
- Giriş, veritabanı, fotoğraf deposu: Supabase
- Tasarım ve kararlar: `buse-design-claude/ideations/creatographers/`

## Çalıştırma

```
npm install
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,mailpit,postgres-meta
npm run dev        # http://localhost:5180, yerel Supabase'e bağlanır (.env.development.local)
```

Yayın derlemesi `.env.local`'deki gerçek projeye bağlanır (şablon: `.env.example`).

## Veritabanı

`supabase/migrations/` altındaki SQL dosyaları. Kuralların hepsi sunucuda:
yalnız üyeler içeri girer, yükleme boyunca herkes sadece kendi karesini görür,
buluşma temasında çekim günü sunucuda da kontrol edilir, roller yalnız fonksiyonlardan değişir.

## Testler

`testler/README.md`
