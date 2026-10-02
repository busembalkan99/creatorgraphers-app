-- 0022: yönetici etkinlik başladıktan sonra da bitiş saatlerini değiştirebiliyor, oylamayı istediği an bitirebiliyor
-- (Buse, 2026-10-03). Karar 26 ve 32/33'ün devamı.
--
-- İsimsizlik kısıtı (karar 105, ikinci güvenlik turu): oylama ilerlemesinin ölçüsü yukleme_biter'e sabit
-- ("oylama açılmadan önce çıkarılmamış kareler"). Yönetici bu saati geriye çekebilseydi bir kareyi çıkarıp saati
-- çıkarmadan öncesine alır, ölçüsü değişen kişiyi o karenin sahibi diye okurdu. Bu yüzden:
--   - yukleme_biter yalnız yükleme sürerken (ya da başlamadan) değişir, hiçbir zaman şimdiden geriye alınmaz;
--     "şimdi" yapmak oylamayı açar (oylamayi_ac ile aynı).
--   - oylama başladıysa yukleme_biter kilitli; yalnız oylama_biter değişir, o da şimdiden geriye alınmaz.
--   - sonuç açıldıysa ya da iptal edildiyse hiçbir saat değişmez.
-- Tekrar uygulanabilir.

create or replace function public.etkinlik_saatleri(p_etkinlik uuid, p_yukleme_biter timestamptz, p_oylama_biter timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare e public.etkinlikler; a text; simdi timestamptz := now(); yb timestamptz; ob timestamptz;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  select * into e from public.etkinlikler where id = p_etkinlik for update;
  if e.id is null then raise exception 'etkinlik_yok'; end if;
  a := public.asama(e);
  if a in ('iptal', 'sonuc') then raise exception 'saat_degismez'; end if;
  yb := coalesce(p_yukleme_biter, e.yukleme_biter);
  ob := coalesce(p_oylama_biter, e.oylama_biter);
  if a = 'oylama' then
    if yb is distinct from e.yukleme_biter then raise exception 'yukleme_kilitli'; end if;
  else
    -- Geriye alınmaz; birkaç saniyelik saat farkı "şimdi" sayılır
    if yb < simdi - interval '1 minute' then raise exception 'gecmise_alinmaz'; end if;
    yb := greatest(yb, simdi);
    if yb <= e.yukleme_baslar then raise exception 'yukleme_once'; end if;
  end if;
  if ob < simdi - interval '1 minute' then raise exception 'gecmise_alinmaz'; end if;
  ob := greatest(ob, simdi);
  if ob <= yb then raise exception 'oy_once'; end if;
  update public.etkinlikler set yukleme_biter = yb, oylama_biter = ob where id = p_etkinlik;
end $$;

-- Oylamayı şimdi bitir: sonuçlar açılır, geri alınmaz
create or replace function public.oylamayi_bitir(p_etkinlik uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.etkinlikler;
begin
  if not public.yonetici_mi() then raise exception 'yetki_yok'; end if;
  select * into e from public.etkinlikler where id = p_etkinlik for update;
  if e.id is null or public.asama(e) <> 'oylama' then raise exception 'oylama_yok'; end if;
  update public.etkinlikler set oylama_biter = now() where id = p_etkinlik;
end $$;

revoke execute on function public.etkinlik_saatleri(uuid, timestamptz, timestamptz), public.oylamayi_bitir(uuid) from public, anon;
grant execute on function public.etkinlik_saatleri(uuid, timestamptz, timestamptz), public.oylamayi_bitir(uuid) to authenticated;
