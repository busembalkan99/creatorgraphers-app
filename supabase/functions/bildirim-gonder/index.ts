// Cron (gizli.bildirim_tetikle) çağırıyor. Gizliler Supabase Function secrets'ta: VAPID_ACIK, VAPID_GIZLI, BILDIRIM_GIZLI.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isle } from './cekirdek.ts'

webpush.setVapidDetails('https://creatorgraphers.com', Deno.env.get('VAPID_ACIK')!, Deno.env.get('VAPID_GIZLI')!)
const GIZLI = Deno.env.get('BILDIRIM_GIZLI')!

Deno.serve(async (istek) => {
  if (!GIZLI || istek.headers.get('x-bildirim-gizli') !== GIZLI) return new Response('yetki yok', { status: 401 })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const s = await isle(sb, async (a, yuk) => { await webpush.sendNotification(a, yuk, { TTL: 6 * 3600 }) })
    return Response.json(s)
  } catch (e) {
    return new Response((e as Error).message, { status: 500 })
  }
})
