-- Kare kaydı duran dosya silinemiyor (audit 2026-10-14, Must fix 4). Üye kare-adres sil'i doğrudan çağırıp
-- oylamada kendi dosyasını silebiliyordu: kare kaydı kalıyor, oylayanlar boş kare görüyordu; sonuçta kötü
-- sıralanan kare gizlenebiliyordu. Uygulama dosyayı hep kare kaydı gittikten ya da başka dosyaya geçtikten sonra
-- siliyor (Yukleme.tsx), o akış değişmiyor. Yalnız 'sil' satırı 0025'ten farklı.
create or replace function public.dosya_izni(p_yollar text[], p_islem text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(y order by s), '{}') from unnest(p_yollar) with ordinality as u(y, s)
  where auth.uid() is not null and case p_islem
    -- Depoda olmayan dosyaya adres yok (Storage'ın createSignedUrls'i de vermiyordu): önizlemesi
    -- olmayan eski karede istemci tam boya düşüyor (imza.ts onizlemesiz)
    when 'oku' then
      exists (select 1 from public.dosyalar d where d.yol = y) and (
        exists (select 1 from public.dosyalar d where d.yol = y and d.sahip = auth.uid())
        or (public.uye_mi() and public.etkinlik_asamasi(gizli.yol_etkinligi(y)) in ('oylama', 'sonuc')
            and not public.toplu_cikarilan_mi(y))
        or (public.yonetici_mi() and public.cikarilan_dosya_mi(y)))
    when 'yukle' then
      public.uye_mi() and gizli.yol_etkinligi(y) is not null
      and public.etkinlik_asamasi(gizli.yol_etkinligi(y)) = 'yukleme'
      -- Kaydı olan yola kimse yeniden yükleyemiyor, sahibi de: eski Storage kuralı yalnız eklemeye izin
      -- veriyordu, yoksa kapanıştan sonra oylanan kare değiştirilebilirdi
      and not exists (select 1 from public.dosyalar d where d.yol = y)
    when 'sil' then
      public.uye_mi() and exists (select 1 from public.dosyalar d where d.yol = y and d.sahip = auth.uid())
      and not exists (select 1 from public.kareler k where k.dosya = public.asil_dosya(y))
    else false end
$$;
