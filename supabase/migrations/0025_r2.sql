-- 0025: kareler Cloudflare R2'de (karar 127). Depo kuralları (0001, 0002, 0007, 0009, 0020) dosya_izni'ne
-- birebir taşındı; kapı Edge Function kare-adres. Sahiplik dosyalar'da (R2 yükleyeni tutmuyor).
-- Geçişte kare_kontrol hem dosyalar'ı hem storage.objects'i kabul ediyor (0026'da kalkacak). Tekrar uygulanabilir.

create table if not exists public.dosyalar (
  yol text primary key,
  sahip uuid not null references auth.users(id) on delete cascade,
  etkinlik uuid not null references public.etkinlikler(id) on delete cascade,
  boyut int not null default 0,
  olusturma timestamptz not null default now()
);
alter table public.dosyalar enable row level security;
revoke all on public.dosyalar from anon, authenticated;

-- Yol <etkinlik>/<tema>/<ad>.jpg ya da .k.jpg; tema o etkinliğin
create or replace function gizli.yol_etkinligi(p_yol text) returns uuid
language sql stable security definer set search_path = public as $$
  select t.etkinlik from public.temalar t
   where p_yol ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9A-Za-z-]+(\.k)?\.jpg$'
     and t.id = split_part(p_yol, '/', 2)::uuid
     and t.etkinlik = split_part(p_yol, '/', 1)::uuid
$$;

create or replace function public.dosya_izni(p_yollar text[], p_islem text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(y order by s), '{}') from unnest(p_yollar) with ordinality as u(y, s)
  where auth.uid() is not null and case p_islem
    when 'oku' then
      exists (select 1 from public.dosyalar d where d.yol = y and d.sahip = auth.uid())
      or (public.uye_mi() and public.etkinlik_asamasi(gizli.yol_etkinligi(y)) in ('oylama', 'sonuc')
          and not public.toplu_cikarilan_mi(y))
      or (public.yonetici_mi() and public.cikarilan_dosya_mi(y))
    when 'yukle' then
      public.uye_mi() and gizli.yol_etkinligi(y) is not null
      and public.etkinlik_asamasi(gizli.yol_etkinligi(y)) = 'yukleme'
      and not exists (select 1 from public.dosyalar d where d.yol = y and d.sahip <> auth.uid())
    when 'sil' then
      public.uye_mi() and exists (select 1 from public.dosyalar d where d.yol = y and d.sahip = auth.uid())
    else false end
$$;

create or replace function public.dosya_kaydet(p_yol text, p_boyut int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if cardinality(public.dosya_izni(array[p_yol], 'yukle')) = 0 then raise exception 'yetki_yok'; end if;
  if p_boyut > 8 * 1024 * 1024 then raise exception 'buyuk'; end if;
  insert into public.dosyalar (yol, sahip, etkinlik, boyut)
  values (p_yol, auth.uid(), gizli.yol_etkinligi(p_yol), p_boyut)
  on conflict (yol) do update set boyut = excluded.boyut where dosyalar.sahip = auth.uid();
end $$;

create or replace function public.dosya_kaydi_sil(p_yollar text[]) returns text[]
language sql security definer set search_path = public as $$
  with s as (delete from public.dosyalar where yol = any(public.dosya_izni(p_yollar, 'sil')) returning yol)
  select coalesce(array_agg(yol), '{}') from s
$$;

revoke execute on function public.dosya_izni(text[], text), public.dosya_kaydet(text, int), public.dosya_kaydi_sil(text[]) from public, anon;
grant execute on function public.dosya_izni(text[], text), public.dosya_kaydet(text, int), public.dosya_kaydi_sil(text[]) to authenticated;
revoke execute on function gizli.yol_etkinligi(text) from public, anon, authenticated;

-- 0009'daki kare_kontrol, yalnız "dosya var ve senin" koşulu dosyalar'a bakıyor (geçişte storage.objects de)
create or replace function public.kare_kontrol()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t public.temalar;
  e public.etkinlikler;
  hedef uuid := coalesce(new.tema, old.tema);
begin
  -- Kullanıcı oturumu olmayan işlemler (servis anahtarıyla yapılanlar, hesap silinince
  -- zincirleme silme) bu kurala takılmaz; kural üyenin kendi işlemleri için.
  -- Yöneticinin tema silmesi kullanıcı oturumuyla çalışır, yani kapalı aşamada tema silinemez.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select * into t from public.temalar where id = hedef;
  select * into e from public.etkinlikler where id = t.etkinlik;
  if public.asama(e) <> 'yukleme' then
    raise exception 'yukleme_kapali' using errcode = 'P0001';
  end if;
  -- Çıkarılan kare sahibince değişmez ve silinmez: yoksa silip yenisini koymak
  -- diskalifiyeyi boşa çıkarırdı. Yöneticinin silmesi serbest: etkinlik iptali ve
  -- tema silme kareleri onun oturumuyla siliyor.
  if gizli.cikarildi(old.id) and (tg_op = 'UPDATE' or (tg_op = 'DELETE' and not public.yonetici_mi())) then
    raise exception 'cikarildi' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.tema <> old.tema then
    raise exception 'tema_degismez' using errcode = 'P0001';
  end if;
  -- Dosya yolu bu etkinlik ve temanın klasöründe, R2'de (dosyalar) var ve bu kişinin yüklediği
  -- bir dosya olmalı. Oylama ekranı bu yola güvenecek.
  if new.dosya not like (t.etkinlik::text || '/' || t.id::text || '/%')
     or not (exists (select 1 from public.dosyalar d where d.yol = new.dosya and d.sahip = auth.uid())
             -- Geçiş (karar 127): Supabase Storage'daki dosya da kabul; 0026'da kalkıyor
             or exists (select 1 from storage.objects o where o.bucket_id = 'kareler' and o.name = new.dosya
                          and o.owner_id = auth.uid()::text)) then
    raise exception 'dosya_yok' using errcode = 'P0001';
  end if;
  -- Karar 103: yoklama alındıysa yalnız gelenler yükler, serbest temaya da
  if e.yoklama_at is not null
     and not exists (select 1 from public.yoklama y where y.etkinlik = e.id and y.uye = auth.uid()) then
    raise exception 'yoklamada_yok' using errcode = 'P0001';
  end if;
  if t.bulusmada then
    if new.cekim_gunu is null then
      raise exception 'tarih_yok' using errcode = 'P0001';
    end if;
    if abs(new.cekim_gunu - e.bulusma_gunu) > 1 then
      raise exception 'tarih_tutmuyor' using errcode = 'P0001';
    end if;
  end if;
  new.sahip := auth.uid();
  -- Yükleme saatini sunucu koyar: galeri sırası (karar 68) ve gelmeyen sayımı ona bakıyor,
  -- üye geçmiş bir saat yazarak ikisini de oynatabilirdi
  new.yukleme_at := case when tg_op = 'INSERT' then now() else old.yukleme_at end;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Çıkarılan kare her sayımdan düşer
-- ---------------------------------------------------------------------------
create or replace function public.yukleme_sayilari(p_etkinlik uuid)
returns table (tema uuid, adet bigint)
language sql stable security definer set search_path = public as $$
  select t.id, count(k.id)
  from public.temalar t
  left join public.kareler k on k.tema = t.id and not gizli.cikarildi(k.id)
  where t.etkinlik = p_etkinlik and public.uye_mi()
  group by t.id
$$;
