// Cron (gizli.bildirim_tetikle) çağırıyor. Gizliler Supabase Function secrets'ta: VAPID_ACIK, VAPID_GIZLI, BILDIRIM_GIZLI.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isle, yanitla } from './cekirdek.ts'

webpush.setVapidDetails('https://creatorgraphers.com', Deno.env.get('VAPID_ACIK')!, Deno.env.get('VAPID_GIZLI')!)
const GIZLI = Deno.env.get('BILDIRIM_GIZLI') ?? ''

Deno.serve(istek => yanitla(istek, GIZLI, () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  return isle(sb, async (a, yuk) => { await webpush.sendNotification(a, yuk, { TTL: 6 * 3600 }) })
}))
