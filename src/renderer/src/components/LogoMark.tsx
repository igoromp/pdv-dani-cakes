import { SVGProps } from 'react'

const TOP_LETTERS: Array<{ ch: string; x: number; y: number; r: number }> = [
  { ch: 'D', x: 207.42, y: 317.18, r: -58.0 },
  { ch: 'A', x: 255.58, y: 256.52, r: -45.11 },
  { ch: 'N', x: 316.04, y: 208.13, r: -32.22 },
  { ch: 'I', x: 385.78, y: 174.46, r: -19.33 },
  { ch: 'C', x: 538.72, y: 157.18, r: 6.44 },
  { ch: 'A', x: 614.22, y: 174.46, r: 19.33 },
  { ch: 'K', x: 683.96, y: 208.13, r: 32.22 },
  { ch: 'E', x: 744.42, y: 256.52, r: 45.11 },
  { ch: 'S', x: 792.58, y: 317.18, r: 58.0 }
]

const BOTTOM_LETTERS: Array<{ ch: string; x: number; y: number; r: number }> = [
  { ch: 'C', x: 321.65, y: 660.59, r: 48.0 },
  { ch: 'O', x: 350.92, y: 688.09, r: 38.4 },
  { ch: 'N', x: 384.38, y: 710.31, r: 28.8 },
  { ch: 'F', x: 421.07, y: 726.65, r: 19.2 },
  { ch: 'E', x: 459.98, y: 736.64, r: 9.6 },
  { ch: 'I', x: 500.0, y: 740.0, r: 0.0 },
  { ch: 'T', x: 540.02, y: 736.64, r: -9.6 },
  { ch: 'A', x: 578.93, y: 726.65, r: -19.2 },
  { ch: 'R', x: 615.62, y: 710.31, r: -28.8 },
  { ch: 'I', x: 649.08, y: 688.09, r: -38.4 },
  { ch: 'A', x: 678.35, y: 660.59, r: -48.0 }
]

// Marca da Dani Cakes: tigela + fouet + coraçõezinhos, com "Dani Cakes" e
// "Confeitaria" arqueados. librsvg (usado no build do ícone) não suporta
// textPath, por isso cada letra é posicionada manualmente ao longo do círculo.
export default function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="500" cy="500" r="460" fill="none" stroke="#E17A67" strokeWidth="6" />
      <circle cx="500" cy="500" r="430" fill="none" stroke="#E17A67" strokeWidth="6" />

      {TOP_LETTERS.map((l, i) => (
        <text
          key={`top-${i}`}
          x={l.x}
          y={l.y}
          transform={`rotate(${l.r} ${l.x} ${l.y})`}
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize={74}
          fontWeight="bold"
          fill="#E17A67"
        >
          {l.ch}
        </text>
      ))}

      {BOTTOM_LETTERS.map((l, i) => (
        <text
          key={`bottom-${i}`}
          x={l.x}
          y={l.y}
          transform={`rotate(${l.r} ${l.x} ${l.y})`}
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize={44}
          fontWeight="bold"
          fill="#E17A67"
        >
          {l.ch}
        </text>
      ))}

      <g stroke="#181818" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <ellipse cx="470" cy="530" rx="128" ry="20" />
        <path d="M 342 530 C 342 630, 420 660, 470 662 C 540 664, 598 628, 598 530" />
        <path d="M 560 545 L 700 380" strokeWidth={9} />
        <rect x="686" y="330" width="26" height="60" rx="8" transform="rotate(41 699 360)" fill="#181818" stroke="none" />
        <path d="M 528 555 C 470 500, 470 430, 560 405 C 600 393, 615 400, 620 415" />
        <path d="M 545 565 C 500 520, 505 440, 585 415" />
        <path d="M 565 575 C 535 535, 545 460, 605 430" />
        <path d="M 585 580 C 565 545, 575 480, 618 452" />
      </g>

      <g fill="#181818" stroke="none">
        <path d="M 358 300 c -10,-10 -26,-4 -26,10 c 0,14 26,30 26,30 c 0,0 26,-16 26,-30 c 0,-14 -16,-20 -26,-10 z" />
        <path d="M 420 260 c -7,-7 -18,-3 -18,7 c 0,10 18,20 18,20 c 0,0 18,-10 18,-20 c 0,-10 -11,-14 -18,-7 z" />
        <path d="M 395 350 c -6,-6 -15,-2 -15,6 c 0,8 15,17 15,17 c 0,0 15,-9 15,-17 c 0,-8 -9,-12 -15,-6 z" />
      </g>
    </svg>
  )
}
