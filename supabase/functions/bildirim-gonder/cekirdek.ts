// Kuyruğu işleme (karar 120). Deno'ya ve npm'e bağlı değil: Node testleri doğrudan çağırıyor.
type Satir = { kuyruk: number; endpoint: string; p256dh: string; auth: string; baslik: string; govde: string; adres: string }
type Istemci = { rpc(ad: string, arg?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }
type Abonelik = { endpoint: string; keys: { p256dh: string; auth: string } }

export async function isle(sb: Istemci, gonder: (a: Abonelik, yuk: string) => Promise<void>) {
  const { data, error } = await sb.rpc('bildirim_gonderilecekler')
  if (error) throw new Error(error.message)
  const sonuc = new Map<number, { ok: boolean; hata: string | null }>()
  for (const r of (data ?? []) as Satir[]) {
    try {
      await gonder({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify({ baslik: r.baslik, govde: r.govde, adres: r.adres }))
      // Başarı hemen yazılıyor: çalışma yarıda kesilirse (zaman aşımı) gönderilen bir daha gitmesin
      if (!sonuc.get(r.kuyruk)?.ok) await sb.rpc('bildirim_sonuc', { p_kuyruk: r.kuyruk, p_basarili: true, p_hata: null })
      sonuc.set(r.kuyruk, { ok: true, hata: null })
    } catch (e) {
      const kod = (e as { statusCode?: number }).statusCode
      // Telefon aboneliği bıraktı ya da sıfırlandı: bir daha denenmiyor
      if (kod === 404 || kod === 410) await sb.rpc('bildirim_abonelik_dustu', { p_endpoint: r.endpoint })
      if (!sonuc.get(r.kuyruk)?.ok) sonuc.set(r.kuyruk, { ok: false, hata: String(kod ?? (e as Error).message ?? e).slice(0, 200) })
    }
  }
  // Hiçbir cihaza gidemeyenler: deneme sayısı artıyor
  for (const [kuyruk, s] of sonuc) if (!s.ok) await sb.rpc('bildirim_sonuc', { p_kuyruk: kuyruk, p_basarili: false, p_hata: s.hata })
  return { gonderilen: [...sonuc.values()].filter(s => s.ok).length, toplam: sonuc.size }
}
