-- 0024: Wrapped kütüphanesi (karar 126, Buse 2026-10-03). Etkinlik hangi Wrapped setiyle açılacağını taşıyor.
-- Boş = eski set (klasik); bu göçten önce kurulmuş bütün etkinlikler öyle kalıyor, eski Wrapped'leri değişmiyor.
-- Yeni etkinlik kurulurken sıradaki set yazılıyor: iptal edilmemiş en son etkinliğin setinden sonra gelen.
-- Sıra şimdilik sabit (Buse: "yeniler sırayla"): kontakt → pano → klasik → kontakt. Rastgeleye geçmek yalnız
-- bu fonksiyonu değiştirmek. İptal edilen etkinliğin seti hiç gösterilmediği için sıradaki ona yeniden verilir.
-- Kimse elle değiştiremiyor: etkinlikler'de güncelleme kuralı yok, yazma yalnız security definer fonksiyonlardan.
-- Tekrar uygulanabilir.

alter table public.etkinlikler add column if not exists wrapped_set text;
alter table public.etkinlikler drop constraint if exists etkinlikler_wrapped_set_check;
alter table public.etkinlikler add constraint etkinlikler_wrapped_set_check
  check (wrapped_set is null or wrapped_set in ('klasik', 'kontakt', 'pano'));

create or replace function gizli.wrapped_set_ata() returns trigger
language plpgsql security definer set search_path = public as $$
declare onceki text;
begin
  if new.wrapped_set is not null then return new; end if;
  select e.wrapped_set into onceki from public.etkinlikler e
   where not e.iptal order by e.olusturma desc, e.id desc limit 1;
  new.wrapped_set := case onceki when 'kontakt' then 'pano' when 'pano' then 'klasik' else 'kontakt' end;
  return new;
end $$;

drop trigger if exists etkinlik_wrapped_set on public.etkinlikler;
create trigger etkinlik_wrapped_set before insert on public.etkinlikler
  for each row execute function gizli.wrapped_set_ata();
revoke execute on function gizli.wrapped_set_ata() from public, anon, authenticated;
