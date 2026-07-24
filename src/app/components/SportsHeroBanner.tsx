// Decorative login backdrop — white Olympic-pictogram-style athlete
// silhouettes (football runner, basketball dunk, golf follow-through)
// drawn as thick round-capped strokes over the app's navy/teal gradient.
// Generic figures, not any real person.
const FIGURE_STROKE = "#f1f5f9";

function limbProps(width = 15) {
  return {
    stroke: FIGURE_STROKE,
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
}

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
      <g opacity="0.1">
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

      {/* ground shadows */}
      <g fill="#f8fafc" opacity="0.07">
        <ellipse cx="200" cy="440" rx="110" ry="14" />
        <ellipse cx="600" cy="445" rx="90" ry="13" />
        <ellipse cx="990" cy="440" rx="100" ry="14" />
      </g>

      {/* ---- Football runner (ball tucked, mid-stride) ---- */}
      <g transform="translate(200,290)" opacity="0.94">
        <circle cx="26" cy="-118" r="19" fill={FIGURE_STROKE} />
        {/* torso, leaning into the run */}
        <path d="M 14 -92 L -10 -14" {...limbProps(17)} />
        {/* back arm pumping */}
        <path d="M 12 -86 L -26 -64 L -46 -92" {...limbProps(14)} />
        {/* front arm tucking the ball */}
        <path d="M 12 -86 L 40 -52 L 30 -22" {...limbProps(14)} />
        <ellipse
          cx="36"
          cy="-14"
          rx="17"
          ry="11"
          transform="rotate(-25 36 -14)"
          fill={FIGURE_STROKE}
        />
        {/* front leg driving, knee high */}
        <path d="M -10 -14 L 42 8 L 30 62" {...limbProps(15)} />
        {/* back leg extended behind */}
        <path d="M -10 -14 L -48 38 L -84 78" {...limbProps(15)} />
      </g>

      {/* ---- Basketball player (rising for a dunk) ---- */}
      <g transform="translate(600,270)" opacity="0.94">
        <circle cx="-2" cy="-132" r="19" fill={FIGURE_STROKE} />
        {/* torso, stretched upward */}
        <path d="M 0 -106 L 2 -28" {...limbProps(17)} />
        {/* both arms reaching to the ball overhead */}
        <path d="M 0 -102 L 32 -148 L 28 -188" {...limbProps(14)} />
        <path d="M 0 -102 L -18 -150 L 6 -186" {...limbProps(14)} />
        <circle cx="20" cy="-204" r="19" fill={FIGURE_STROKE} />
        {/* legs tucked mid-jump */}
        <path d="M 2 -28 L -32 10 L -14 52" {...limbProps(15)} />
        <path d="M 2 -28 L 30 8 L 54 46" {...limbProps(15)} />
      </g>

      {/* ---- Golfer (full swing follow-through) ---- */}
      <g transform="translate(990,290)" opacity="0.94">
        <circle cx="-8" cy="-122" r="18" fill={FIGURE_STROKE} />
        {/* torso, slight arch back */}
        <path d="M -2 -98 L 6 -16" {...limbProps(16)} />
        {/* arms wrapped up into the follow-through */}
        <path d="M -2 -94 L 24 -122 L 44 -142" {...limbProps(13)} />
        <path d="M -4 -88 L 22 -116 L 44 -142" {...limbProps(13)} />
        {/* club swung up behind the shoulders */}
        <path d="M 44 -142 L 96 -196" {...limbProps(6)} />
        <circle cx="99" cy="-199" r="6" fill={FIGURE_STROKE} />
        {/* front leg planted, back heel lifted in the twist */}
        <path d="M 6 -16 L -2 66" {...limbProps(15)} />
        <path d="M 6 -16 L 40 24 L 52 58" {...limbProps(15)} />
      </g>
    </svg>
  );
}
