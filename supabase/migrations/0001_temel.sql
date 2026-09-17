-- Creatographers: temel yapı (cumartesi kapsamı)
-- Giriş ve katılma isteği (karar 95), roller (86), etkinlik ve temalar (26, 29, 32, 33, 72),
-- kare yükleme (3, 41, 92, 93), isim gizliliği sunucuda (9).
--
-- Kural: istemci hiçbir şeye güvenilerek yazılmıyor. Rol değişikliği, istek kararı ve
-- kurucu olma yalnız security definer fonksiyonlardan geçiyor; tablolara doğrudan yazma
-- izni sadece kişinin kendi satırı ve aşamanın izin verdiği an için var.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Üyeler
-- ---------------------------------------------------------------------------
create table public.uyeler (
  id          uuid primary key references auth.users(id) on delete cascade,
  ad          text not null check (char_length(btrim(ad)) between 2 and 60),
  eposta      text not null,
  rol         text not null default 'uye' check (rol in ('kurucu', 'yonetici', 'uye')),
  afis_izni   boolean not null default true,          -- karar 41, varsayılan işaretli
  hosgeldin_goruldu boolean not null default false,  -- karar 95, ilk giriş ekranı
  katildi_at  timestamptz not null default now()
);

-- Tek kurucu (karar 86)
create unique index uyeler_tek_kurucu on public.uyeler ((rol)) where rol = 'kurucu';

-- ---------------------------------------------------------------------------
-- Katılma istekleri (karar 95)
-- ---------------------------------------------------------------------------
create table public.istekler (
  id          uuid primary key default gen_random_uuid(),
  kullanici   uuid not null references auth.users(id) on delete cascade,
  eposta      text not null,
  ad          text not null check (char_length(btrim(ad)) between 2 and 60),
  notu        text check (notu is null or char_length(notu) <= 280),
  durum       text not null default 'bekliyor' check (durum in ('bekliyor', 'onay', 'red')),
  olusturma   timestamptz not null default now(),
  karar_at    timestamptz,
  karar_veren uuid references auth.users(id)
);

-- Aynı anda tek bekleyen istek
create unique index istekler_tek_bekleyen on public.istekler (kullanici) where durum = 'bekliyor';

-- ---------------------------------------------------------------------------
-- Etkinlikler ve temalar
-- ---------------------------------------------------------------------------
create table public.etkinlikler (
  id              uuid primary key default gen_random_uuid(),
  bulusma_gunu    date not null,
  yukleme_baslar  timestamptz not null,
  yukleme_biter   timestamptz not null,  -- varsayılan +48 saat (karar 32)
  oylama_biter    timestamptz not null,  -- varsayılan +72 saat (karar 33)
  iptal           boolean not null default false,
  kuran           uuid not null references auth.users(id),
  olusturma       timestamptz not null default now(),
  check (yukleme_biter > yukleme_baslar),
  check (oylama_biter > yukleme_biter)
);

create table public.temalar (
  id          uuid primary key default gen_random_uuid(),
  etkinlik    uuid not null references public.etkinlikler(id) on delete cascade,
  ad          text not null check (char_length(btrim(ad)) between 1 and 40),
  sira        smallint not null check (sira between 1 and 3),   -- karar 72, en fazla 3
  bulusmada   boolean not null default true,                     -- karar 29
  unique (etkinlik, sira)
);

-- Aşama saatten hesaplanır, zamanlayıcı gerekmez. Yönetici erken açmak ya da uzatmak
-- için bitiş saatlerini değiştirir (karar 26).
create or replace function public.asama(e public.etkinlikler)
returns text language sql stable as $$
  select case
    when e.iptal                     then 'iptal'
    when now() < e.yukleme_baslar    then 'baslamadi'
    when now() < e.yukleme_biter     then 'yukleme'
    when now() < e.oylama_biter      then 'oylama'
    else 'sonuc'
  end
$$;

create or replace function public.etkinlik_asamasi(p_etkinlik uuid)
returns text language sql stable security definer set search_path = public as $$
  select public.asama(e) from public.etkinlikler e where e.id = p_etkinlik
$$;

-- ---------------------------------------------------------------------------
-- Kareler (karar 3: tema başına kişi başı 1)
-- ---------------------------------------------------------------------------
create table public.kareler (
  id            uuid primary key default gen_random_uuid(),
  tema          uuid not null references public.temalar(id) on delete cascade,
  sahip         uuid not null references auth.users(id) on delete cascade,
  dosya         text not null unique,       -- depodaki yol, kişiyi içermez
  genislik      int  not null check (genislik > 0),
  yukseklik     int  not null check (yukseklik > 0),
  cekim_gunu    date,                        -- makinenin yerel günü, saat dilimi yok
  cekim_zamani  timestamp without time zone,
  kamera        text,                        -- karar 24: saklanır, oylamada gösterilmez
  objektif      text,
  odak          text,
  diyafram      text,
  enstantane    text,
  iso           text,
  yukleme_at    timestamptz not null default now(),
  unique (tema, sahip)
);

-- Karar 92: buluşmada çekilen temada tarih zorunlu ve buluşma günü ±1 gün.
-- Karar 93: yalnız yükleme açıkken eklenir, değişir, silinir.
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

create trigger kare_kontrol
  before insert or update or delete on public.kareler
  for each row execute function public.kare_kontrol();

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------
create or replace function public.uye_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uyeler where id = auth.uid())
$$;

create or replace function public.yonetici_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uyeler where id = auth.uid() and rol in ('kurucu', 'yonetici'))
$$;

create or replace function public.kurucu_mu()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uyeler where id = auth.uid() and rol = 'kurucu')
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.uyeler      enable row level security;
alter table public.istekler    enable row level security;
alter table public.etkinlikler enable row level security;
alter table public.temalar     enable row level security;
alter table public.kareler     enable row level security;

-- Üyeler: üyeler birbirinin yalnız adını ve rolünü görür. E-posta ve kişisel ayarlar
-- kişinin kendisine (ben()) ve yöneticiye (uye_listesi()) açık.
-- Kişi yalnız kendi afiş iznini ve hoş geldin işaretini değiştirir.
create policy uyeler_oku on public.uyeler for select using (public.uye_mi());
create policy uyeler_kendi on public.uyeler for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke select, insert, update, delete on public.uyeler from anon, authenticated;
grant select (id, ad, rol, katildi_at) on public.uyeler to authenticated;
grant update (afis_izni, hosgeldin_goruldu) on public.uyeler to authenticated;

-- Tablolara anonim erişim yok
revoke all on public.istekler, public.etkinlikler, public.temalar, public.kareler from anon;

-- İstekler: kişi kendi isteklerini görür ve yeni istek bırakır; yönetici hepsini görür.
create policy istekler_oku on public.istekler for select
  using (kullanici = auth.uid() or public.yonetici_mi());
create policy istekler_birak on public.istekler for insert
  with check (
    kullanici = auth.uid()
    and durum = 'bekliyor'
    and eposta = (auth.jwt() ->> 'email')
    and not public.uye_mi()
  );

-- Etkinlik ve tema: üyeler okur, yönetici yazar.
create policy etkinlik_oku on public.etkinlikler for select using (public.uye_mi());
create policy etkinlik_yaz on public.etkinlikler for insert with check (public.yonetici_mi() and kuran = auth.uid());
create policy etkinlik_degis on public.etkinlikler for update using (public.yonetici_mi()) with check (public.yonetici_mi());

create policy tema_oku on public.temalar for select using (public.uye_mi());
create policy tema_yaz on public.temalar for insert with check (public.yonetici_mi());
create policy tema_degis on public.temalar for update using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy tema_sil on public.temalar for delete using (public.yonetici_mi());

-- Kareler: yükleme boyunca herkes yalnız kendi karesini görür (karar 7, 9).
-- Oylama ekranı karelere sahibi olmadan, ayrı bir fonksiyonla erişecek (sonraki adım).
create policy kare_oku on public.kareler for select using (sahip = auth.uid());
create policy kare_ekle on public.kareler for insert with check (sahip = auth.uid() and public.uye_mi());
create policy kare_degis on public.kareler for update using (sahip = auth.uid()) with check (sahip = auth.uid());
create policy kare_sil on public.kareler for delete using (sahip = auth.uid());

-- Tema başına kare sayısı (kimin yüklediği değil). Üyelere de açık; yalnız sayı.
create or replace function public.yukleme_sayilari(p_etkinlik uuid)
returns table (tema uuid, adet bigint)
language sql stable security definer set search_path = public as $$
  select t.id, count(k.id)
  from public.temalar t left join public.kareler k on k.tema = t.id
  where t.etkinlik = p_etkinlik and public.uye_mi()
  group by t.id
$$;

-- ---------------------------------------------------------------------------
-- Fonksiyonlar
-- ---------------------------------------------------------------------------

-- Kulübün ilk kurulumu: kurucu yokken ilk çağıran kurucu olur. Bir kez çalışır.
create or replace function public.kulubu_kur(p_ad text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'giris_yok'; end if;
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.uyeler where rol = 'kurucu') then
    raise exception 'kurucu_var';
  end if;
  insert into public.uyeler (id, ad, eposta, rol)
  values (auth.uid(), btrim(p_ad), auth.jwt() ->> 'email', 'kurucu');
end $$;

create or replace function public.kurucu_var()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uyeler where rol = 'kurucu')
$$;

-- Kişinin kendi tam satırı (üye değilse boş döner)
create or replace function public.ben()
returns setof public.uyeler language sql stable security definer set search_path = public as $$
  select * from public.uyeler where id = auth.uid()
$$;

-- Yönetici için tam üye listesi
create or replace function public.uye_listesi()
returns setof public.uyeler language sql stable security definer set search_path = public as $$
  select * from public.uyeler where public.yonetici_mi() order by katildi_at
$$;

-- Yöneticinin istek kararı (karar 95)
create or replace function public.istek_karar(p_istek uuid, p_onay boolean)
returns void language plpgsql security definer set search_path = public as $$
declare i public.istekler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  select * into i from public.istekler where id = p_istek for update;
  if i.id is null or i.durum <> 'bekliyor' then raise exception 'istek_yok'; end if;
  update public.istekler
     set durum = case when p_onay then 'onay' else 'red' end,
         karar_at = now(), karar_veren = auth.uid()
   where id = p_istek;
  if p_onay then
    insert into public.uyeler (id, ad, eposta) values (i.kullanici, i.ad, i.eposta)
    on conflict (id) do nothing;
  end if;
end $$;

-- Kartta "Daha önce N kez reddedildi"
create or replace function public.bekleyen_istekler()
returns table (id uuid, ad text, eposta text, notu text, olusturma timestamptz, onceki_red bigint)
language sql stable security definer set search_path = public as $$
  select i.id, i.ad, i.eposta, i.notu, i.olusturma,
         (select count(*) from public.istekler r where r.kullanici = i.kullanici and r.durum = 'red')
  from public.istekler i
  where i.durum = 'bekliyor' and public.yonetici_mi()
  order by i.olusturma
$$;

-- Rol değiştirme: yalnız kurucu, kurucunun kendisi değişmez (karar 86)
create or replace function public.rol_degistir(p_uye uuid, p_yonetici boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.kurucu_mu() then raise exception 'yetki_yok'; end if;
  update public.uyeler
     set rol = case when p_yonetici then 'yonetici' else 'uye' end
   where id = p_uye and rol <> 'kurucu';
end $$;

-- Etkinlik kurma: etkinlik ve temaları tek seferde (karar 72: en fazla 3 tema)
create or replace function public.etkinlik_kur(
  p_bulusma date, p_yukleme_baslar timestamptz, p_yukleme_saat int, p_oylama_saat int,
  p_temalar jsonb  -- [{"ad":"Sokak","bulusmada":true}, ...]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  e_id uuid;
  n int := jsonb_array_length(p_temalar);
  i int;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  if n < 1 or n > 3 then raise exception 'tema_sayisi'; end if;
  if p_yukleme_saat < 1 or p_oylama_saat < 1 then raise exception 'sure'; end if;
  if exists (select 1 from public.etkinlikler e where public.asama(e) in ('baslamadi', 'yukleme', 'oylama')) then
    raise exception 'acik_etkinlik_var';
  end if;
  insert into public.etkinlikler (bulusma_gunu, yukleme_baslar, yukleme_biter, oylama_biter, kuran)
  values (p_bulusma, p_yukleme_baslar,
          p_yukleme_baslar + make_interval(hours => p_yukleme_saat),
          p_yukleme_baslar + make_interval(hours => p_yukleme_saat + p_oylama_saat),
          auth.uid())
  returning id into e_id;
  for i in 0 .. n - 1 loop
    insert into public.temalar (etkinlik, ad, sira, bulusmada)
    values (e_id, btrim(p_temalar -> i ->> 'ad'), i + 1,
            coalesce((p_temalar -> i ->> 'bulusmada')::boolean, true));
  end loop;
  return e_id;
end $$;

-- Aşama kontrolü: yüklemeyi uzat, oylamayı şimdi aç (karar 26)
create or replace function public.yukleme_uzat(p_etkinlik uuid, p_saat int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  update public.etkinlikler e
     set yukleme_biter = yukleme_biter + make_interval(hours => p_saat),
         oylama_biter  = oylama_biter  + make_interval(hours => p_saat)
   where e.id = p_etkinlik and public.asama(e) = 'yukleme';
end $$;

create or replace function public.oylamayi_ac(p_etkinlik uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  update public.etkinlikler e
     set oylama_biter  = now() + (oylama_biter - yukleme_biter),
         yukleme_biter = now()
   where e.id = p_etkinlik and public.asama(e) = 'yukleme';
end $$;

-- İptal: oylama açılana kadar (karar 89). Kare kayıtları silinir. Depodaki dosyalar
-- SQL'den silinemiyor (Supabase depo API'si istiyor); özel oldukları için kimse
-- göremez, temizliği ayrı bir iş olarak açık.
create or replace function public.etkinlik_iptal(p_etkinlik uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.etkinlikler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  select * into e from public.etkinlikler where id = p_etkinlik for update;
  if e.id is null or public.asama(e) not in ('baslamadi', 'yukleme') then
    raise exception 'iptal_olmaz';
  end if;
  delete from public.kareler k using public.temalar t
   where k.tema = t.id and t.etkinlik = p_etkinlik;
  update public.etkinlikler set iptal = true where id = p_etkinlik;
end $$;

-- Fonksiyon izinleri: anonim kullanıcı hiçbirini çağıramaz
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
-- Sonradan eklenecek fonksiyonlar da anonime kapalı başlasın
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------------------------------------------------------------------------
-- Depo: kareler özel, yol etkinlik/tema/rastgele-kimlik.jpg (kişi yolda yok)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kareler', 'kareler', false, 8 * 1024 * 1024, array['image/jpeg'])
on conflict (id) do nothing;

create policy kare_dosya_yukle on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kareler' and public.uye_mi()
    and public.etkinlik_asamasi(((storage.foldername(name))[1])::uuid) = 'yukleme'
  );

create policy kare_dosya_oku on storage.objects for select to authenticated
  using (bucket_id = 'kareler' and owner_id = auth.uid()::text);

create policy kare_dosya_sil on storage.objects for delete to authenticated
  using (bucket_id = 'kareler' and owner_id = auth.uid()::text);
