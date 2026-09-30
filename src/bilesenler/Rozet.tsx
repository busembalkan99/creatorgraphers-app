import type { Basari, Seviye } from '../lib/basarilar'

/**
 * Altıgen başarı rozeti (karar 115, Buse 2026-09-26: Duolingo dili, altıgen).
 * Altta koyu taban, kalın kenar, açık iç yüz; ortada Fluent Emoji (MIT, public/rozet/).
 * Kilitliyken gri gövde, soluk çizim ve kilit.
 */
const GRI = { ana: '#3A3A40', koyu: '#26262B', acik: '#4A4A52' }
const DIS = 'M60 4 L110 32 L110 92 L60 120 L10 92 L10 32 Z'
const IC = 'M60 16 L99 38 L99 86 L60 108 L21 86 L21 38 Z'

export function Rozet({ b, s, boy = 88 }: { b: Basari; s: Seviye; boy?: number }) {
  const c = s.kazanildi ? b.renk : GRI
  return (
    <svg className="rozet-svg" viewBox="0 0 120 140" width={boy} height={boy * 140 / 120} aria-hidden="true">
      <path d={DIS} fill={c.koyu} transform="translate(0,7)" />
      <path d={DIS} fill={c.ana} stroke={c.koyu} strokeWidth="3" strokeLinejoin="round" />
      <path d={IC} fill={c.acik} />
      <image href={`${import.meta.env.BASE_URL}rozet/${b.ikon}`} x="32" y="34" width="56" height="56"
        style={s.kazanildi ? undefined : { filter: 'grayscale(1) brightness(.6)' }} />
      {s.kazanildi ? (
        <g>
          <rect x="34" y="106" width="52" height="24" rx="12" fill="#fff" stroke={c.koyu} strokeWidth="3" />
          <text x="60" y="123" textAnchor="middle" fontFamily="Archivo, system-ui, sans-serif" fontWeight="900" fontSize="12.5" fill={c.koyu}>
            Sv {s.seviye}
          </text>
        </g>
      ) : (
        <g transform="translate(47,48)">
          <rect x="3" y="11" width="20" height="16" rx="4" fill="#7c7c85" />
          <path d="M7 11 V7 a6 6 0 0 1 12 0 V11" fill="none" stroke="#7c7c85" strokeWidth="4" />
        </g>
      )}
    </svg>
  )
}
