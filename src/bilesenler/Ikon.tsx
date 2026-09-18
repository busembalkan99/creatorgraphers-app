// Ikonate (MIT, github.com/mikolajdobrucki/ikonate). Uçlar CSS ile keskine çevriliyor (karar 75).
const P = {
  info: '<path d="M12,12 L12,15"/><line class="nokta" x1="12" y1="9" x2="12" y2="9"/><circle cx="12" cy="12" r="10"/>',
  saat: '<circle cx="12" cy="12" r="10"/><polyline points="12 5 12 12 16 16"/>',
  tik: '<polyline points="4 13 9 18 20 7"/>',
  kapat: '<path d="M6 6L18 18M18 6L6 18"/>',
  arti: '<path d="M20 12L4 12M12 4L12 20"/>',
  takvim: '<path d="M3 5H21V21H3V5Z"/><path d="M21 9H3"/><path d="M7 5V3"/><path d="M17 5V3"/><path d="M15 18L8.99999 12"/><path d="M15 12L9 18"/>',
  cop: '<path d="M19 6L5 6M14 5L10 5M6 10L6 20C6 20.6666667 6.33333333 21 7 21 7.66666667 21 11 21 17 21 17.6666667 21 18 20.6666667 18 20 18 19.3333333 18 16 18 10"/>',
  yenile: '<polyline points="22 12 19 15 16 12"/><path d="M11,20 C6.581722,20 3,16.418278 3,12 C3,7.581722 6.581722,4 11,4 C15.418278,4 19,7.581722 19,12 L19,14"/>',
  kilit: '<rect width="14" height="10" x="5" y="11"/><path d="M12,3 L12,3 C14.7614237,3 17,5.23857625 17,8 L17,11 L7,11 L7,8 C7,5.23857625 9.23857625,3 12,3 Z"/>',
  geri: '<path d="M9 6l-6 6 6 6"/><path d="M21 12H4"/><path d="M3 12h1"/>',
  asagi: '<polyline points="6 9 12 15 18 9"/>',
  // sekmeler: perforasyonlu film karesi elle çizildi (v16)
  film: '<rect x="2" y="6" width="20" height="12"/><rect x="4" y="2.5" width="3" height="2" fill="currentColor" stroke="none"/><rect x="10.5" y="2.5" width="3" height="2" fill="currentColor" stroke="none"/><rect x="17" y="2.5" width="3" height="2" fill="currentColor" stroke="none"/><rect x="4" y="19.5" width="3" height="2" fill="currentColor" stroke="none"/><rect x="10.5" y="19.5" width="3" height="2" fill="currentColor" stroke="none"/><rect x="17" y="19.5" width="3" height="2" fill="currentColor" stroke="none"/>',
  sira: '<polygon points="2 12 2 21 6 21 6 12"/><polygon points="18 7 18 21 22 21 22 7"/><polygon points="10 3 10 21 14 21 14 3"/>',
  kisi: '<path d="M4,20 C4,17 8,17 10,15 C11,14 8,14 8,9 C8,5.667 9.333,4 12,4 C14.667,4 16,5.667 16,9 C16,14 13,14 14,15 C16,17 20,17 20,20"/>',
} as const

export type IkonAdi = keyof typeof P

export function Ikon({ ad }: { ad: IkonAdi }) {
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[ad] }} />
}
