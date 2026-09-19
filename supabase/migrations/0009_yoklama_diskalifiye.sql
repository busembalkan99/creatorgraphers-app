-- Yoklama ve diskalifiye (karar 103)
--
-- Yoklama: yönetici buluşmada, yükleme açılmadan gelenleri işaretler. Yoklama alınınca
-- yalnız gelenler kare yükler, serbest temaya da. Yoklama alınmadıysa herkes yükler
-- (unutulursa kulüp beklemesin); yönetici sonradan gelmeyenlerin karelerini çıkarır.
-- Oylamaya herkes katılır.
--
-- Diskalifiye: yönetici ya da kurucu bir kareyi yarışmadan çıkarır, nedenini yazar.
-- Sonuç açıldıktan sonra da olur, geri alınabilir. Çıkarılan kare oylamadan, sonuçtan,
-- sıralamadan ve profilden düşer; oyları silinmez, sayılmaz. Nedeni yalnız sahibi ve
-- yöneticiler görür, başkası hiçbir iz görmez.
--
-- Diskalifiye ayrı tabloda: karenin sütunu olsaydı sahibi kendi satırını güncelleyip
-- kaydı silebilirdi. Bu tabloya doğrudan yazma izni kimsede yok, yalnız fonksiyonlar yazar.
--
-- İsimsizlik (karar 9) oylama bitene kadar yönetici için de geçerli. Yoklama ve gelmeyenleri
-- toplu çıkarma yalnız oylama açılana kadar: oylamada yoklamayı "X hariç herkes" diye
-- yeniden yazıp toplu çıkaran yönetici, akıştan düşen karelerden X'in karelerini
-- öğrenirdi (güvenlik incelemesi, 2026-09-19). Aynı nedenle toplu çıkarılan kare sonuç
-- açılana kadar yöneticiye hiç verilmiyor, kimliği de: yüklemede kimlikleri not edip
-- geri alan yönetici oylamada onları resimlerle eşleştirirdi (ikinci inceleme). Toplu
-- çıkarmanın geri alınışı kare kare değil, yoklamayı düzeltmek: gelmiş işaretlenenin
-- kareleri kendiliğinden döner.

-- ---------------------------------------------------------------------------
-- Yoklama
-- ---------------------------------------------------------------------------
alter table public.etkinlikler add column yoklama_at timestamptz;

create table public.yoklama (
  etkinlik  uuid not null references public.etkinlikler(id) on delete cascade,
  uye       uuid not null references auth.users(id) on delete cascade,
  primary key (etkinlik, uye)
);
alter table public.yoklama enable row level security;
revoke all on public.yoklama from anon;
create policy yoklama_oku on public.yoklama for select
  using (public.yonetici_mi() or uye = auth.uid());

-- Buluşma günü Türkiye saatiyle
create or replace function gizli.bugun() returns date
language sql stable as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

-- Yönetici için liste: bugünkü üyeler, gelenler işaretli. Yoklama alınmadıysa hepsi boş.
create or replace function public.yoklama_listesi(p_etkinlik uuid)
returns table (uye uuid, ad text, geldi boolean)
language sql stable security definer set search_path = public as $$
  select u.id, u.ad, exists (select 1 from public.yoklama y where y.etkinlik = p_etkinlik and y.uye = u.id)
  from public.uyeler u
  where public.yonetici_mi() and u.cikarildi_at is null
  order by u.ad collate "tr-TR-x-icu"
$$;

-- Yoklamayı kaydeder, önceki işaretlerin yerine geçer. Buluşma gününden oylama açılana
-- kadar: yükleme sürerken düzeltilebilir, oylamada değişmez (yukarıdaki not).
create or replace function public.yoklama_kaydet(p_etkinlik uuid, p_gelenler uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare e public.etkinlikler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  select * into e from public.etkinlikler where id = p_etkinlik for update;
  if e.id is null or e.iptal then raise exception 'etkinlik_yok' using errcode = 'P0001'; end if;
  if gizli.bugun() < e.bulusma_gunu then raise exception 'bulusma_olmadi' using errcode = 'P0001'; end if;
  if public.asama(e) not in ('baslamadi', 'yukleme') then
    raise exception 'oylama_basladi' using errcode = 'P0001';
  end if;
  delete from public.yoklama where etkinlik = p_etkinlik;
  insert into public.yoklama (etkinlik, uye)
    select p_etkinlik, u.id from public.uyeler u
    where u.id = any (coalesce(p_gelenler, '{}')) and u.cikarildi_at is null;
  update public.etkinlikler set yoklama_at = now() where id = p_etkinlik;
  -- Toplu çıkarmanın geri alınışı: artık gelmiş sayılanın kareleri yarışmaya döner
  delete from public.diskalifiye d
   using public.kareler k, public.temalar t
   where d.kare = k.id and k.tema = t.id and t.etkinlik = p_etkinlik and d.toplu
     and exists (select 1 from public.yoklama y where y.etkinlik = p_etkinlik and y.uye = k.sahip);
end $$;

-- Üyenin kendi durumu: yükleme ekranı buluşma temasını buna göre kilitler
create or replace function public.yoklamam(p_etkinlik uuid)
returns table (alindi boolean, geldim boolean)
language sql stable security definer set search_path = public as $$
  select e.yoklama_at is not null,
         exists (select 1 from public.yoklama y where y.etkinlik = e.id and y.uye = auth.uid())
  from public.etkinlikler e
  where e.id = p_etkinlik and public.uye_mi()
$$;

-- ---------------------------------------------------------------------------
-- Diskalifiye
-- ---------------------------------------------------------------------------
create table public.diskalifiye (
  kare    uuid primary key references public.kareler(id) on delete cascade,
  neden   text not null check (char_length(btrim(neden)) between 1 and 140),
  eden    uuid references auth.users(id) on delete set null,
  zaman   timestamptz not null default now(),
  toplu   boolean not null default false   -- gelmeyenleri çıkarma ile mi
);
alter table public.diskalifiye enable row level security;
revoke all on public.diskalifiye from anon;
-- Sahibi kendi karesinin nedenini okur, yöneticiler hepsini. Yazma yok.
create policy diskalifiye_oku on public.diskalifiye for select
  using (public.yonetici_mi()
         or exists (select 1 from public.kareler k where k.id = kare and k.sahip = auth.uid()));

create or replace function gizli.cikarildi(p_kare uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diskalifiye d where d.kare = p_kare)
$$;

-- Yöneticinin tek kare çıkarması. Kareyi oylama ya da sonuç ekranında görüyor, kimin
-- olduğunu bilmesi gerekmiyor.
create or replace function public.kare_cikar(p_kare uuid, p_neden text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.etkinlikler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_neden, ''))) not between 1 and 140 then
    raise exception 'neden_gerekli' using errcode = 'P0001';
  end if;
  select e2.* into e from public.etkinlikler e2
    join public.temalar t on t.etkinlik = e2.id
    join public.kareler k on k.tema = t.id
   where k.id = p_kare;
  if e.id is null then raise exception 'kare_yok' using errcode = 'P0001'; end if;
  if e.iptal then raise exception 'etkinlik_yok' using errcode = 'P0001'; end if;
  insert into public.diskalifiye (kare, neden, eden) values (p_kare, btrim(p_neden), auth.uid())
  on conflict (kare) do update set neden = excluded.neden, eden = excluded.eden, zaman = now();
end $$;

create or replace function public.kare_geri_al(p_kare uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  -- Toplu çıkarılan kare sonuçtan önce kare kare geri alınmaz: yoklama düzeltilir
  if exists (select 1 from public.diskalifiye d
               join public.kareler k on k.id = d.kare
               join public.temalar t on t.id = k.tema
               join public.etkinlikler e on e.id = t.etkinlik
              where d.kare = p_kare and d.toplu and public.asama(e) <> 'sonuc') then
    raise exception 'toplu_geri' using errcode = 'P0001';
  end if;
  delete from public.diskalifiye where kare = p_kare;
end $$;

-- Yoklamaya göre gelmeyenlerin kareleri (yoklamadan önce yüklenmiş olanlar). Yalnız sayı döner:
-- kimin hangi kare olduğu oylama bitene kadar yöneticiye de açılmıyor.
create or replace function gizli.gelmeyen_kareleri(p_etkinlik uuid)
returns table (kare uuid, sahip uuid)
language sql stable security definer set search_path = public as $$
  select k.id, k.sahip
  from public.kareler k
  join public.temalar t on t.id = k.tema
  join public.etkinlikler e on e.id = t.etkinlik
  where t.etkinlik = p_etkinlik and e.yoklama_at is not null
    and not exists (select 1 from public.yoklama y where y.etkinlik = e.id and y.uye = k.sahip)
    and not gizli.cikarildi(k.id)
$$;

create or replace function public.gelmeyen_ozeti(p_etkinlik uuid)
returns table (kisi bigint, kare bigint)
language sql stable security definer set search_path = public as $$
  select count(distinct g.sahip), count(*)
  from gizli.gelmeyen_kareleri(p_etkinlik) g
  join public.etkinlikler e on e.id = p_etkinlik
  where public.yonetici_mi() and public.asama(e) = 'yukleme'
$$;

create or replace function public.gelmeyenleri_cikar(p_etkinlik uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok' using errcode = 'P0001'; end if;
  if (select public.asama(e) from public.etkinlikler e where e.id = p_etkinlik) is distinct from 'yukleme' then
    raise exception 'oylama_basladi' using errcode = 'P0001';
  end if;
  insert into public.diskalifiye (kare, neden, eden, toplu)
    select g.kare, 'Buluşmaya katılmadın.', auth.uid(), true from gizli.gelmeyen_kareleri(p_etkinlik) g
  on conflict (kare) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Yöneticinin geri alabilmesi için çıkarılanlar. Sahip yok. Toplu çıkarılanlar sonuç
-- açılana kadar listede yok (yukarıdaki not), yalnız sayıları toplu_ozeti'nde.
create or replace function public.cikarilan_kareler(p_etkinlik uuid)
returns table (id uuid, tema_ad text, dosya text, genislik int, yukseklik int, neden text, zaman timestamptz)
language sql stable security definer set search_path = public as $$
  select k.id, t.ad, k.dosya, k.genislik, k.yukseklik, d.neden, d.zaman
  from public.diskalifiye d
  join public.kareler k on k.id = d.kare
  join public.temalar t on t.id = k.tema
  join public.etkinlikler e on e.id = t.etkinlik
  where t.etkinlik = p_etkinlik and public.yonetici_mi()
    and (not d.toplu or public.asama(e) = 'sonuc')
  order by t.sira, d.zaman
$$;

create or replace function public.toplu_ozeti(p_etkinlik uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.diskalifiye d
  join public.kareler k on k.id = d.kare
  join public.temalar t on t.id = k.tema
  where t.etkinlik = p_etkinlik and d.toplu and public.yonetici_mi()
$$;

-- Yönetici çıkarılan karenin dosyasını hangi aşamada olursa görebilsin. Kontrol
-- security definer: kural kullanıcının yetkisiyle çalışıyor ve yönetici kareler
-- tablosunda yalnız kendi satırlarını görüyor, doğrudan sorgu hep boş dönüyordu.
create or replace function public.cikarilan_dosya_mi(p_ad text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kareler k
                   join public.diskalifiye d on d.kare = k.id
                   join public.temalar t on t.id = k.tema
                   join public.etkinlikler e on e.id = t.etkinlik
                 where k.dosya = p_ad and (not d.toplu or public.asama(e) = 'sonuc'))
$$;
create policy kare_dosya_oku_cikarilan on storage.objects for select to authenticated
  using (bucket_id = 'kareler' and public.yonetici_mi() and public.cikarilan_dosya_mi(name));

-- Oylamada herkes etkinliğin bütün dosyalarını okuyabiliyordu (0002). Toplu çıkarılan
-- karenin dosyası sonuç açılana kadar bundan çıkıyor: klasör listelenip akışta olmayan
-- dosya açılırsa gelmeyenin karesi olduğu anlaşılırdı. Sahibi kendi dosyasını 0001'deki
-- kuralla okumaya devam ediyor.
create or replace function public.toplu_cikarilan_mi(p_ad text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kareler k
                   join public.diskalifiye d on d.kare = k.id
                   join public.temalar t on t.id = k.tema
                   join public.etkinlikler e on e.id = t.etkinlik
                 where k.dosya = p_ad and d.toplu and public.asama(e) <> 'sonuc')
$$;
drop policy kare_dosya_oku_oylama on storage.objects;
create policy kare_dosya_oku_oylama on storage.objects for select to authenticated
  using (
    bucket_id = 'kareler' and public.uye_mi()
    and public.etkinlik_asamasi(((storage.foldername(name))[1])::uuid) in ('oylama', 'sonuc')
    and not public.toplu_cikarilan_mi(name)
  );

-- ---------------------------------------------------------------------------
-- Yükleme kuralı: yoklama ve diskalifiye
-- ---------------------------------------------------------------------------
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
  -- Dosya yolu bu etkinlik ve temanın klasöründe, depoda var ve bu kişinin yüklediği
  -- bir dosya olmalı. Oylama ekranı bu yola güvenecek.
  if new.dosya not like (t.etkinlik::text || '/' || t.id::text || '/%')
     or not exists (select 1 from storage.objects o
                     where o.bucket_id = 'kareler' and o.name = new.dosya
                       and o.owner_id = auth.uid()::text) then
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

create or replace function public.oy_kontrol()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k public.kareler;
  e public.etkinlikler;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- Başkası adına oy sessizce kendi oyuna çevrilmesin, açıkça reddedilsin.
  if new.veren is distinct from auth.uid() then
    raise exception 'baska_veren' using errcode = 'P0001';
  end if;
  new.guncelleme := now();
  select * into k from public.kareler where id = new.kare;
  if k.id is null then raise exception 'kare_yok' using errcode = 'P0001'; end if;
  if k.sahip = auth.uid() then raise exception 'kendi_karen' using errcode = 'P0001'; end if;
  if gizli.cikarildi(k.id) then raise exception 'cikarildi' using errcode = 'P0001'; end if;
  select e2.* into e from public.etkinlikler e2
   join public.temalar t on t.etkinlik = e2.id
   where t.id = k.tema;
  if public.asama(e) <> 'oylama' then
    raise exception 'oylama_kapali' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.oylama_kareleri(p_etkinlik uuid)
returns table (id uuid, tema uuid, dosya text, genislik int, yukseklik int, puan smallint)
language sql stable security definer set search_path = public as $$
  select k.id, k.tema, k.dosya, k.genislik, k.yukseklik, o.puan
  from public.kareler k
  join public.temalar t on t.id = k.tema
  join public.etkinlikler e on e.id = t.etkinlik
  left join public.oylar o on o.kare = k.id and o.veren = auth.uid()
  where t.etkinlik = p_etkinlik
    and public.uye_mi()
    and public.asama(e) in ('oylama', 'sonuc')
    and k.sahip <> auth.uid()
    and not gizli.cikarildi(k.id)
  order by t.sira, md5(k.id::text || auth.uid()::text)
$$;

-- Karesi çıkarılan, o temayı oylamak zorunda değil (karar 94 ile aynı: katılmamış sayılır)
create or replace function public.oylama_durumu(p_etkinlik uuid)
returns table (tema uuid, ad text, sira smallint, toplam bigint, puanladigim bigint, zorunlu boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.ad, t.sira,
         count(k.id) filter (where k.sahip <> auth.uid()),
         count(o.kare),
         exists (select 1 from public.kareler m
                  where m.tema = t.id and m.sahip = auth.uid() and not gizli.cikarildi(m.id))
  from public.temalar t
  left join public.kareler k on k.tema = t.id and not gizli.cikarildi(k.id)
  left join public.oylar o on o.kare = k.id and o.veren = auth.uid()
  where t.etkinlik = p_etkinlik and public.uye_mi()
  group by t.id, t.ad, t.sira
  order by t.sira
$$;

-- Sonuç: çıkarılan kare sıralamaya girmez. Satırı yalnız sahibine ve yöneticilere
-- döner, nedeniyle; başkası için hiç yok.
drop function public.sonuc_kareleri(uuid);
create function public.sonuc_kareleri(p_etkinlik uuid)
returns table (
  id uuid, tema uuid, tema_ad text, tema_sira smallint,
  dosya text, genislik int, yukseklik int,
  sahip uuid, sahip_ad text, benim boolean,
  ortalama numeric, oy_sayisi bigint, sira bigint, sirali boolean,
  cekim_gunu date, kamera text, objektif text, odak text, diyafram text, enstantane text, iso text,
  cikarildi boolean, cikarma_nedeni text
)
language sql stable security definer set search_path = public as $$
  with kare as (
    select k.*, t.ad as tema_ad, t.sira as tema_sira, u.ad as uye_ad,
           avg(o.puan) as ort, count(o.kare) as oy
    from public.kareler k
    join public.temalar t on t.id = k.tema
    join public.uyeler u on u.id = k.sahip
    left join public.oylar o on o.kare = k.id
    where t.etkinlik = p_etkinlik and not gizli.cikarildi(k.id)
    group by k.id, t.ad, t.sira, u.ad
  ), sirali as (
    select kare.*,
           -- Karar 98: eşit ortalama aynı numarayı alır. rank() eşitlerden sonra
           -- numarayı atlatır (1, 1, 3) ve kesme çizgisindeki eşitleri birlikte içeri alır.
           -- Puan almamış kare sıralamaya girmez.
           case when kare.oy > 0
             then rank() over (partition by kare.tema order by kare.ort desc nulls last)
           end as yer,
           -- Karar 19: tema başına round(kare sayısı / 2,5), en fazla 5 kare sıralı gösterilir.
           greatest(1, least(5, round(count(*) over (partition by kare.tema) / 2.5))) as kac
    from kare
  )
  select x.id, x.tema, x.tema_ad, x.tema_sira, x.dosya, x.genislik, x.yukseklik,
         x.sahip, x.sahip_ad, x.benim, x.ortalama, x.oy_sayisi, x.sira, x.sirali,
         x.cekim_gunu, x.kamera, x.objektif, x.odak, x.diyafram, x.enstantane, x.iso,
         x.cikarildi, x.cikarma_nedeni
  from (
    select s.id, s.tema, s.tema_ad, s.tema_sira,
           s.dosya, s.genislik, s.yukseklik,
           s.sahip, s.uye_ad as sahip_ad, s.sahip = auth.uid() as benim,
           -- Karar 38 ve 52: sıralamaya girmeyen karenin puanını yalnız sahibi görür
           case when s.yer <= s.kac or s.sahip = auth.uid() then round(s.ort, 1) end as ortalama,
           case when s.yer <= s.kac or s.sahip = auth.uid() then s.oy end as oy_sayisi,
           case when s.yer <= s.kac or s.sahip = auth.uid() then s.yer end as sira,
           coalesce(s.yer <= s.kac, false) as sirali,
           s.cekim_gunu,
           -- Karar 24: makine bilgisi sonuçlarla birlikte açılıyor
           s.kamera, s.objektif, s.odak, s.diyafram, s.enstantane, s.iso,
           false as cikarildi, null::text as cikarma_nedeni,
           case when s.yer <= s.kac then s.yer end as dizi, s.yukleme_at
    from sirali s
    join public.etkinlikler e on e.id = p_etkinlik
    where public.uye_mi() and public.asama(e) = 'sonuc'
    union all
    select k.id, k.tema, t.ad, t.sira,
           k.dosya, k.genislik, k.yukseklik,
           k.sahip, u.ad, k.sahip = auth.uid(),
           null, null, null, false,
           k.cekim_gunu, k.kamera, k.objektif, k.odak, k.diyafram, k.enstantane, k.iso,
           true, d.neden,
           null, k.yukleme_at
    from public.diskalifiye d
    join public.kareler k on k.id = d.kare
    join public.temalar t on t.id = k.tema
    join public.uyeler u on u.id = k.sahip
    join public.etkinlikler e on e.id = t.etkinlik
    where t.etkinlik = p_etkinlik and public.uye_mi() and public.asama(e) = 'sonuc'
      and (k.sahip = auth.uid() or public.yonetici_mi())
  ) x
  -- Sıralananlar sıraya göre, eşit numaralılar alfabetik (karar 54, 98). Karar 68: geri
  -- kalanlar yükleme sırasına göre, son ayraç kare kimliği. Çıkarılanlar en sonda.
  order by x.tema_sira, x.cikarildi, x.dizi nulls last,
           case when x.dizi is not null then x.sahip_ad end collate "tr-TR-x-icu",
           x.yukleme_at, x.id
$$;

create or replace function gizli.kare_siralari()
returns table (
  id uuid, tema uuid, tema_ad text, tema_sira smallint, etkinlik uuid, bulusma_gunu date,
  sahip uuid, ort numeric, oy bigint, yer bigint, sirali boolean
)
language sql stable security definer set search_path = public as $$
  with kare as (
    select k.id, k.tema, t.ad as tema_ad, t.sira as tema_sira, t.etkinlik,
           e.bulusma_gunu, k.sahip, avg(o.puan) as ort, count(o.kare) as oy
    from public.kareler k
    join public.temalar t on t.id = k.tema
    join public.etkinlikler e on e.id = t.etkinlik
    left join public.oylar o on o.kare = k.id
    where public.asama(e) = 'sonuc' and not gizli.cikarildi(k.id)
    group by k.id, k.tema, t.ad, t.sira, t.etkinlik, e.bulusma_gunu, k.sahip
  ), s as (
    select kare.*,
           case when kare.oy > 0
             then rank() over (partition by kare.tema order by kare.ort desc nulls last)
           end as yer,
           greatest(1, least(5, round(count(*) over (partition by kare.tema) / 2.5))) as kac
    from kare
  )
  select s.id, s.tema, s.tema_ad, s.tema_sira, s.etkinlik, s.bulusma_gunu,
         s.sahip, s.ort, s.oy, s.yer, coalesce(s.yer <= s.kac, false)
  from s
$$;

create or replace function public.mudavim()
returns table (uye uuid, ad text, benim boolean, katilim bigint, pencere bigint)
language sql stable security definer set search_path = public as $$
  with son as (
    select s.etkinlik from gizli.sezonlar() s where s.tamam
    order by s.sira desc limit 6
  ),
  katilim as (
    select k.sahip as uye, count(distinct t.etkinlik) as adet
    from public.kareler k
    join public.temalar t on t.id = k.tema
    where t.etkinlik in (select etkinlik from son) and not gizli.cikarildi(k.id)
    group by k.sahip
  )
  select ka.uye, u.ad, ka.uye = auth.uid(), ka.adet, (select count(*) from son)
  from katilim ka
  join public.uyeler u on u.id = ka.uye
  where public.uye_mi() and ka.adet = (select max(adet) from katilim)
  order by u.ad collate "tr-TR-x-icu"
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema gizli from anon, public, authenticated;
