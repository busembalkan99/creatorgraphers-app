-- Etkinlik ve tema yalnız fonksiyonlardan değişir (karar 105, güvenlik turu 2)
--
-- 0010 ilerleme ölçüsünü "oylama açılmadan önce çıkarılmamış kareler" diye dondurdu.
-- İkinci güvenlik turu çapanın kendisinin oynadığını gösterdi: yönetici oylamada
-- doğrudan `PATCH /etkinlikler` ile `yukleme_biter`'i now() yapabiliyordu (politika
-- `etkinlik_degis` bütün sütunlara izin veriyordu). O anda çıkardığı kareler birden
-- "oylamadan önce çıkarılmış" sayılıyor, ölçü istediği kareye iniyordu: tek kişi
-- "başlamadı" kalıyor ve o karenin sahibi oluyordu. Denetçi bunu yönetici anahtarıyla
-- baştan sona çalıştırdı. `oylama_biter`'i yazıp sonucu erken açmak da aynı kapıdan.
--
-- Uygulama bu iki tabloya hiç yazmıyor: etkinlik kurmak, süre uzatmak, oylamayı açmak,
-- iptal etmek, yoklama almak; hepsi security definer fonksiyon ve hepsi aşama kuralını
-- kendi içinde uyguluyor (`asama(e) = 'yukleme'` gibi). Fonksiyonlar tablo sahibi
-- olarak çalıştığı için yetki ve politika onları bağlamıyor. Yani yazma yetkisini
-- tümden kaldırmak hiçbir akışı bozmuyor, yalnız doğrudan yazma yolunu kapatıyor.
--
-- Politikalar da siliniyor: yetki ileride yanlışlıkla geri verilirse politikasız tablo
-- yazmayı yine reddeder, eski politika ise açığı geri getirirdi.

revoke insert, update, delete on public.etkinlikler from authenticated;
revoke insert, update, delete on public.temalar from authenticated;

drop policy if exists etkinlik_yaz on public.etkinlikler;
drop policy if exists etkinlik_degis on public.etkinlikler;
drop policy if exists tema_yaz on public.temalar;
drop policy if exists tema_degis on public.temalar;
drop policy if exists tema_sil on public.temalar;

-- Çıkarma zamanı bir kere yazılır, tekrar çıkarmak onu tazelemez.
--
-- 0009'da `on conflict ... set zaman = now()` vardı. Ölçü artık zamana baktığı için
-- bu, yoklamada toplu çıkarılmış bir kareyi yeniden çıkararak ölçüye sokmanın yolu
-- olurdu: herkesin beklentisi bir artar, artmayan kişi o karenin sahibi çıkardı.
-- Kimlikleri bugün sonuçtan önce hiçbir yerde listelenmiyor ama kapıyı açık bırakmanın
-- anlamı yok.
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
  on conflict (kare) do update set neden = excluded.neden, eden = excluded.eden;
end $$;
