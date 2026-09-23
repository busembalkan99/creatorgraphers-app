-- Tahmin oyunu (karar 76, 106, 107)
--
-- Oylamasını bitiren üye isteğe bağlı bir oyun oynar: birkaç kare, her birinde "bunu kim
-- çekti?". Başlatmak o etkinlikteki puanlarını kilitler. Doğru cevaplar, skor ve tanınma
-- sayısı sonuçlar açılınca görünür.
--
-- Karar 106 (değişmeyenler): kaçıran sonradan oynayamaz · tanınma satırını herkes görür ·
-- skor Profil'de birikir, yalnız kişiye görünür · tanınma alt sınırı kişi sayısının üçte
-- biri · soru sayısı kare sayısına göre, en çok 10.
--
-- Karar 107 (A'): adaylar HER SORUDA AYNI, etkinliğe kare veren herkes, oyuncunun kendisi
-- hariç. Soru seçimi her oyuncuya tamamen rastgele, başkalarının oyununa bakmadan.
--
-- İsimsizlik (karar 9). Önceki tasarımın güvenlik incelemesi (2026-09-23 gecesi) şunu gösterdi:
-- adayları kareye göre seçen her kural, kümelerini birleştiren bir gruba sahipliği sızdırıyor
-- (temada kişi başına tek kare olunca eşleştirme bulmacası çözülüyor). Bu dosyanın kuralları:
--
--  * Aday listesi kareye bağlı değil. Kimin hangi soruda aday olduğu hiçbir şey söylemiyor,
--    çünkü herkes her soruda aday. Kişiler listelerini karşılaştırsa da yalnız birbirlerinin
--    adını görürler.
--  * Soru seçimi başkasının oyununa bakmıyor. "Az sorulan kare önce" gibi bir kural, bir
--    karenin az sorulmasından sahibinin oyuna başladığını ele veriyordu.
--  * Aday havuzu oylama boyunca değişmiyor: kare veren herkes, yalnız yoklamayla toplu
--    çıkarılanlar (gelmeyenler) hariç. Tek tek çıkarılan karenin sahibi havuzda kalıyor; düşseydi
--    listeden kaybolan isim o karenin sahibini söylerdi. Toplu çıkarma yalnız yüklemede
--    yapılıyor ve sonuçtan önce geri alınamıyor (0009, 0013), kare de oylamada silinemiyor;
--    havuz bu yüzden kendiliğinden donuk. Tek istisna hesabını silen üye: kareleri silinir,
--    adı listeden düşer; kimin kulüpten ayrıldığı zaten herkesin bildiği şey.
--  * Doğru cevap oylama sürerken HİÇ dönmüyor, "doğru/yanlış" işareti de.
--  * Skor, tanınma sayısı ve Profil toplamı yalnız sonuçlanmış etkinliklerden hesaplanıyor.
--  * Tablolara uygulamanın doğrudan erişimi yok; her şey aşağıdaki fonksiyonlardan geçiyor.

-- ---------------------------------------------------------------------------
-- 0011'in bıraktığı ayrıcalıklar (Cowork 2026-09-23 notu). PostgREST'ten çağrılamıyor,
-- yani açık değil; ama "bu tablolara uygulama yalnız okur" kuralı tam olsun.
-- ---------------------------------------------------------------------------
revoke references, trigger, truncate on public.etkinlikler, public.temalar from authenticated;

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------
create table if not exists public.tahmin_oyun (
  etkinlik    uuid not null references public.etkinlikler(id) on delete cascade,
  uye         uuid not null references auth.users(id) on delete cascade,
  basladi     timestamptz not null default now(),
  gonderildi  timestamptz,
  primary key (etkinlik, uye)
);

create table if not exists public.tahmin_soru (
  etkinlik      uuid not null,
  uye           uuid not null,
  sira          smallint not null,
  kare          uuid not null references public.kareler(id) on delete cascade,
  cevap         uuid,                          -- verdiği isim; geçtiyse ya da daha cevaplamadıysa boş
  gecti         boolean not null default false,
  cevap_zamani  timestamptz,
  primary key (etkinlik, uye, sira),
  unique (uye, kare),
  foreign key (etkinlik, uye) references public.tahmin_oyun (etkinlik, uye) on delete cascade
);

alter table public.tahmin_oyun enable row level security;
alter table public.tahmin_soru enable row level security;
-- Politika yok: yetkisi olan bile satır göremez. Yetki de yok. Yalnız fonksiyonlar.
revoke all on public.tahmin_oyun, public.tahmin_soru from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Yardımcılar (gizli şema: uygulamadan çağrılamaz)
-- ---------------------------------------------------------------------------

-- Sorulabilecek kareler: şu an çıkarılmamış olanlar. Oylamada çıkarılan kare artık sorulmuyor
-- ve sayılmıyor; sahibi yine aday havuzunda kalıyor (aşağıda).
create or replace function gizli.tahmin_kareleri(p_etkinlik uuid)
returns table (kare uuid, sahip uuid)
language sql stable security definer set search_path = public as $$
  select k.id, k.sahip
    from public.kareler k
    join public.temalar t on t.id = k.tema
   where t.etkinlik = p_etkinlik
     and not gizli.cikarildi(k.id)
$$;

-- Aday havuzu (karar 107): etkinliğe kare veren herkes, yoklamayla toplu çıkarılan kareler
-- hariç. Tek tek çıkarılan karenin sahibi kalıyor. Kulüpten çıkarılmış üye de kalıyor,
-- kareleri etkinlikte kalıyor.
create or replace function gizli.tahmin_havuzu(p_etkinlik uuid)
returns table (uye uuid)
language sql stable security definer set search_path = public as $$
  select distinct k.sahip
    from public.kareler k
    join public.temalar t on t.id = k.tema
   where t.etkinlik = p_etkinlik
     and not exists (select 1 from public.diskalifiye d where d.kare = k.id and d.toplu)
$$;

-- Oyun açılabilir mi? Sebep kişiye kendi durumunu söylüyor, başkası hakkında bir şey değil.
create or replace function gizli.tahmin_acik(p_etkinlik uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  e public.etkinlikler;
begin
  if not public.uye_mi() then return 'uye_degil'; end if;
  select * into e from public.etkinlikler where id = p_etkinlik;
  if e.id is null or e.iptal then return 'etkinlik_yok'; end if;
  if public.asama(e) <> 'oylama' then return 'oylama_kapali'; end if;
  -- Oylayabildiği her kareye puan vermiş olmalı (oylama ekranının kendi listesi)
  if exists (select 1 from public.oylama_kareleri(p_etkinlik) where puan is null) then
    return 'oylar_eksik';
  end if;
  -- Dörtten az fotoğrafçı varsa oyun anlamsız (oyuncu kendini eleyince iki isim kalırdı).
  -- Sebebi ayrı söylenmiyor: oylama sürerken bir sayı söylemek olurdu.
  if (select count(*) from gizli.tahmin_havuzu(p_etkinlik)) < 4 then return 'yok'; end if;
  -- Sorulacak başkasının karesi yoksa da oyun yok
  if not exists (select 1 from gizli.tahmin_kareleri(p_etkinlik) where sahip <> auth.uid()) then
    return 'yok';
  end if;
  return 'acik';
end $$;

-- Kişinin adayları: havuz eksi kendisi, ada göre
create or replace function gizli.tahmin_adaylarim(p_etkinlik uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('uye', u.id, 'ad', u.ad) order by u.ad, u.id), '[]'::jsonb)
    from gizli.tahmin_havuzu(p_etkinlik) h
    join public.uyeler u on u.id = h.uye
   where h.uye <> auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Uygulamanın çağırdığı fonksiyonlar
-- ---------------------------------------------------------------------------

-- Kişinin bu etkinlikteki oyun durumu
create or replace function public.tahmin_durumu(p_etkinlik uuid)
returns table (durum text, basladi boolean, gonderildi boolean, soru int, cevaplanan int)
language sql stable security definer set search_path = public as $$
  select
    case when o.uye is not null then 'basladi' else gizli.tahmin_acik(p_etkinlik) end,
    o.uye is not null,
    o.gonderildi is not null,
    (select count(*)::int from public.tahmin_soru s where s.etkinlik = p_etkinlik and s.uye = auth.uid()),
    (select count(*)::int from public.tahmin_soru s
      where s.etkinlik = p_etkinlik and s.uye = auth.uid() and (s.cevap is not null or s.gecti))
  from (select 1) bir
  left join public.tahmin_oyun o on o.etkinlik = p_etkinlik and o.uye = auth.uid()
  where public.uye_mi()
$$;

-- Oyunu başlat: soruları seç, puanları kilitle. İkinci çağrı bir şey yapmaz.
create or replace function public.tahmin_baslat(p_etkinlik uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  durum text;
  p int; m int; n int;
  k record;
  sira smallint := 0;
begin
  if exists (select 1 from public.tahmin_oyun where etkinlik = p_etkinlik and uye = auth.uid()) then
    return;
  end if;
  durum := gizli.tahmin_acik(p_etkinlik);
  if durum <> 'acik' then raise exception 'tahmin_%', durum using errcode = 'P0001'; end if;

  -- Soru sayısı: her kare ortalama beş tahmin alacak kadar, en az 3, en çok 10
  select count(*) into p from gizli.tahmin_kareleri(p_etkinlik);
  select count(*) into m from public.uyeler where cikarildi_at is null;
  n := least(10, greatest(3, ceil(5.0 * p / greatest(m, 1))::int));

  insert into public.tahmin_oyun (etkinlik, uye) values (p_etkinlik, auth.uid());

  -- Karar 107: tamamen rastgele, başkasının oyununa bakmadan. Kendi karesi gelmiyor.
  for k in
    select t.kare from gizli.tahmin_kareleri(p_etkinlik) t
     where t.sahip <> auth.uid()
     order by random()
     limit n
  loop
    sira := sira + 1;
    insert into public.tahmin_soru (etkinlik, uye, sira, kare) values (p_etkinlik, auth.uid(), sira, k.kare);
  end loop;

  if sira = 0 then raise exception 'tahmin_yok' using errcode = 'P0001'; end if;
end $$;

-- Kişinin soruları. Oylama sürerken doğru cevap yok, yalnız kendi seçimi.
create or replace function public.tahmin_sorularim(p_etkinlik uuid)
returns table (sira smallint, kare uuid, dosya text, genislik int, yukseklik int,
               tema_ad text, adaylar jsonb, cevap uuid, gecti boolean)
language sql stable security definer set search_path = public as $$
  select s.sira, k.id, k.dosya, k.genislik, k.yukseklik, t.ad,
         gizli.tahmin_adaylarim(p_etkinlik),
         s.cevap, s.gecti
    from public.tahmin_soru s
    join public.kareler k on k.id = s.kare
    join public.temalar t on t.id = k.tema
   where s.etkinlik = p_etkinlik and s.uye = auth.uid() and public.uye_mi()
   order by s.sira
$$;

-- Bir soruyu cevapla ya da geç. Cevap kesin: ikinci kez yazılmıyor.
create or replace function public.tahmin_cevapla(p_etkinlik uuid, p_sira int, p_cevap uuid, p_gec boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  e public.etkinlikler;
  s public.tahmin_soru;
begin
  select * into e from public.etkinlikler where id = p_etkinlik;
  if e.id is null or public.asama(e) <> 'oylama' then
    raise exception 'oylama_kapali' using errcode = 'P0001';
  end if;
  select * into s from public.tahmin_soru
   where etkinlik = p_etkinlik and uye = auth.uid() and sira = p_sira for update;
  if s.kare is null then raise exception 'tahmin_soru_yok' using errcode = 'P0001'; end if;
  if s.cevap is not null or s.gecti then raise exception 'tahmin_cevaplandi' using errcode = 'P0001'; end if;
  if coalesce(p_gec, false) then
    update public.tahmin_soru set gecti = true, cevap_zamani = now()
     where etkinlik = p_etkinlik and uye = auth.uid() and sira = p_sira;
  else
    if p_cevap is null or p_cevap = auth.uid()
       or not exists (select 1 from gizli.tahmin_havuzu(p_etkinlik) h where h.uye = p_cevap) then
      raise exception 'tahmin_aday_degil' using errcode = 'P0001';
    end if;
    update public.tahmin_soru set cevap = p_cevap, cevap_zamani = now()
     where etkinlik = p_etkinlik and uye = auth.uid() and sira = p_sira;
  end if;
  -- Hepsi bitince gönderilmiş sayılıyor
  if not exists (select 1 from public.tahmin_soru
                  where etkinlik = p_etkinlik and uye = auth.uid() and cevap is null and not gecti) then
    update public.tahmin_oyun set gonderildi = coalesce(gonderildi, now())
     where etkinlik = p_etkinlik and uye = auth.uid();
  end if;
end $$;

-- Sonuç: yalnız sonuç açıldıktan sonra. Kareler kimindi, kişi ne dedi, doğru muydu.
-- Oylamada çıkarılan kare skora girmiyor (sonuçta da yok).
create or replace function public.tahmin_sonucum(p_etkinlik uuid)
returns table (sira smallint, kare uuid, dosya text, genislik int, yukseklik int, tema_ad text,
               sahip_ad text, cevap_ad text, gecti boolean, dogru boolean, sayildi boolean)
language sql stable security definer set search_path = public as $$
  select s.sira, k.id, k.dosya, k.genislik, k.yukseklik, t.ad,
         su.ad, cu.ad, s.gecti,
         s.cevap is not null and s.cevap = k.sahip,
         not gizli.cikarildi(k.id)
    from public.tahmin_soru s
    join public.kareler k on k.id = s.kare
    join public.temalar t on t.id = k.tema
    join public.etkinlikler e on e.id = t.etkinlik
    join public.uyeler su on su.id = k.sahip
    left join public.uyeler cu on cu.id = s.cevap
   where s.etkinlik = p_etkinlik and s.uye = auth.uid() and public.uye_mi()
     and public.asama(e) = 'sonuc'
   order by s.sira
$$;

-- Tanınma: sonuçtan sonra, herkese (karar 106). "Geç" sayılmıyor. Alt sınırı geçmeyen kare
-- için satır dönmüyor.
create or replace function public.taninma(p_kare uuid)
returns table (bilen int, toplam int)
language sql stable security definer set search_path = public as $$
  with k as (
    select k.id, k.sahip, e as ev
      from public.kareler k
      join public.temalar t on t.id = k.tema
      join public.etkinlikler e on e.id = t.etkinlik
     where k.id = p_kare
  ), say as (
    select count(*) filter (where s.cevap = k.sahip)::int as bilen,
           count(*) filter (where s.cevap is not null)::int as toplam
      from k join public.tahmin_soru s on s.kare = k.id
  )
  select say.bilen, say.toplam
    from say, k
   where public.uye_mi()
     and public.asama(k.ev) = 'sonuc'
     and not gizli.cikarildi(k.id)
     and say.toplam >= ceil((select count(*) from public.uyeler where cikarildi_at is null) / 3.0)
     and say.toplam > 0
$$;

-- Profil: sonuçlanmış etkinliklerdeki tahminlerin toplamı, yalnız kişinin kendisine.
create or replace function public.tahmin_profilim()
returns table (bilen int, toplam int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where s.cevap = k.sahip)::int,
         count(*) filter (where s.cevap is not null)::int
    from public.tahmin_soru s
    join public.kareler k on k.id = s.kare
    join public.temalar t on t.id = k.tema
    join public.etkinlikler e on e.id = t.etkinlik
   where s.uye = auth.uid() and public.uye_mi()
     and public.asama(e) = 'sonuc'
     and not gizli.cikarildi(k.id)
$$;

-- ---------------------------------------------------------------------------
-- Puan kilidi: oyunu başlatan o etkinlikte puan veremez ve değiştiremez
-- ---------------------------------------------------------------------------
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
  -- Karar 76: tahmin oyununu başlatan için puanlar kilitli. Yeni puan da yok: oylamada geri
  -- alınıp yarışmaya dönen bir kareye tahminden sonra puan vermek, tahminin sızdığı puan olurdu.
  if exists (select 1 from public.tahmin_oyun o where o.etkinlik = e.id and o.uye = auth.uid()) then
    raise exception 'tahmin_kilidi' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Yeni fonksiyonlar: anon ve public'e kapalı, üyeye açık; yardımcılar hiç açık değil
revoke execute on function public.tahmin_durumu(uuid), public.tahmin_baslat(uuid),
  public.tahmin_sorularim(uuid), public.tahmin_cevapla(uuid, int, uuid, boolean),
  public.tahmin_sonucum(uuid), public.taninma(uuid), public.tahmin_profilim()
  from anon, public;
grant execute on function public.tahmin_durumu(uuid), public.tahmin_baslat(uuid),
  public.tahmin_sorularim(uuid), public.tahmin_cevapla(uuid, int, uuid, boolean),
  public.tahmin_sonucum(uuid), public.taninma(uuid), public.tahmin_profilim()
  to authenticated;
revoke execute on all functions in schema gizli from anon, public, authenticated;
