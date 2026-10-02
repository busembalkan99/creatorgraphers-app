import type { Etkinlik } from '../../lib/tipler'
import type { SetTanimi } from './ortak'
import { KLASIK } from './klasik'
import { PANO } from './pano'
import { KONTAKT } from './kontakt'

/**
 * Wrapped kütüphanesi (karar 126). Etkinliğin seti sunucuda (etkinlikler.wrapped_set, 0024); boşsa eski set.
 * Yeni set eklemek: dosyasını yaz, buraya ekle, 0024'teki sıraya ve izin listesine koy.
 */
export const KUTUPHANE: Record<SetTanimi['ad'], SetTanimi> = { klasik: KLASIK, kontakt: KONTAKT, pano: PANO }

export const setSec = (e: Etkinlik): SetTanimi => KUTUPHANE[e.wrapped_set ?? 'klasik'] ?? KLASIK
