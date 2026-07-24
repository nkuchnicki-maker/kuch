// Decorative banner — generic, non-photorealistic athlete silhouettes
// (golfer, basketball player, football player) built from flat SVG
// shapes, not any real person. Purely visual, used behind the login card.
export default function SportsHeroBanner() {
  return (
    <svg
      viewBox="0 0 1200 500"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#020617" />
          <stop offset="55%" stopColor="#0b1a2b" />
          <stop offset="100%" stopColor="#052e2b" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="15%" r="60%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1200" height="500" fill="url(#skyGrad)" />
      <rect width="1200" height="500" fill="url(#glow)" />

      {/* stadium light beams */}
      <g opacity="0.12">
        <polygon points="150,0 260,0 500,500 260,500" fill="#e2e8f0" />
        <polygon points="620,0 720,0 900,500 660,500" fill="#e2e8f0" />
      </g>

      {/* scoreboard dot grid */}
      <g fill="#10b981" opacity="0.15">
        {Array.from({ length: 18 }).map((_, col) =>
          Array.from({ length: 4 }).map((_, row) => (
            <circle key={`${col}-${row}`} cx={20 + col * 68} cy={20 + row * 16} r="2" />
          )),
        )}
      </g>

      <rect x="0" y="430" width="1200" height="70" fill="url(#floorGrad)" />

      {/* ---- Football player (running, ball tucked) ---- */}
      <g transform="translate(190,255)" fill="#0f172a" stroke="#10b981" strokeWidth="3">
        <circle cx="0" cy="-96" r="22" />
        <rect x="-30" y="-118" width="60" height="14" rx="7" fill="#10b981" stroke="none" opacity="0.5" />
        <path d="M -18 -74 Q -34 -30 -10 20 L 22 14 Q 6 -28 18 -70 Z" />
        <path d="M -10 20 L -60 70 L -44 90 L 6 40 Z" />
        <path d="M 22 14 L 66 -6 L 78 12 L 30 42 Z" />
        <ellipse cx="86" cy="6" rx="20" ry="13" transform="rotate(-25 86 6)" fill="#78350f" stroke="#fbbf24" strokeWidth="2" />
        <path d="M -18 -74 L -58 -96 L -46 -114 L -2 -90 Z" />
        <path d="M -60 70 L -96 128 L -74 140 L -34 84 Z" />
        <path d="M -44 90 L -82 118 L -66 134 L -26 104 Z" />
        <path d="M 6 40 L 42 108 L 20 122 L -14 54 Z" />
      </g>

      {/* ---- Basketball player (jumping dunk) ---- */}
      <g transform="translate(600,215)" fill="#0f172a" stroke="#10b981" strokeWidth="3">
        <circle cx="0" cy="-108" r="22" />
        <path d="M -16 -84 Q -26 -40 -8 6 L 18 2 Q 4 -42 14 -80 Z" />
        <path d="M -8 6 L -34 58 L -14 70 L 14 14 Z" />
        <path d="M 18 2 L 44 54 L 24 66 L -4 10 Z" />
        <path d="M -16 -84 L -48 -118 L -30 -136 L 4 -100 Z" />
        <path d="M 4 -100 L 22 -150 L 44 -144 L 30 -92 Z" />
        <circle cx="46" cy="-166" r="17" fill="none" stroke="#f97316" strokeWidth="4" />
        <path d="M -34 58 L -50 108 L -28 116 L -10 66 Z" />
        <path d="M -14 70 L 2 118 L 22 110 L 8 62 Z" />
      </g>

      {/* ---- Golfer (follow-through swing) ---- */}
      <g transform="translate(985,265)" fill="#0f172a" stroke="#10b981" strokeWidth="3">
        <circle cx="0" cy="-100" r="21" />
        <path d="M -8 -78 Q -20 -35 4 10 L 26 2 Q 8 -38 16 -76 Z" />
        <path d="M 4 10 L -20 58 L 0 68 L 22 18 Z" />
        <path d="M 26 2 L 50 52 L 30 62 L 8 14 Z" />
        <path d="M -8 -78 L 6 -122 L 26 -114 L 14 -74 Z" />
        <line x1="26" y1="-114" x2="58" y2="-186" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="61" cy="-193" r="4" fill="#10b981" stroke="none" />
        <path d="M 16 -76 L -22 -100 L -34 -84 L 6 -60 Z" />
        <path d="M -20 58 L -40 106 L -20 114 L 0 68 Z" />
        <path d="M 0 68 L 20 112 L 40 104 L 22 62 Z" />
        <circle cx="-2" cy="120" r="4" fill="#e2e8f0" stroke="none" />
      </g>
    </svg>
  );
}
