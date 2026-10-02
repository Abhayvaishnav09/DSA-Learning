/**
 * The hero in 2D: the same three ideas (loop, variable, decision) as an SVG, used while the 3D
 * scene loads and whenever 3D is off (no WebGL2, data saver, reduced motion). CSS-animated, so
 * "animations off" stops it too.
 */
export function HeroFallback() {
  return (
    <svg
      viewBox="0 0 480 420"
      className="absolute inset-0 size-full"
      aria-hidden
      data-testid="hero-fallback"
    >
      <defs>
        <linearGradient id="hf-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
        <radialGradient id="hf-glow">
          <stop offset="0" stopColor="var(--accent-2)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* the program's path */}
      <path
        d="M20 70 C 90 120, 110 150, 130 170 S 200 330, 250 320 S 360 200, 370 140 S 430 60, 470 40"
        fill="none"
        stroke="var(--accent)"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeDasharray="8 10"
      />
      {/* loop: a ring with values going round */}
      <g className="origin-[130px_170px] animate-[spin_9s_linear_infinite]">
        <circle cx="130" cy="170" r="70" fill="none" stroke="url(#hf-accent)" strokeWidth="10" />
        <circle cx="200" cy="170" r="10" fill="var(--accent-2)" />
        <circle cx="95" cy="231" r="10" fill="var(--accent-2)" />
        <circle cx="95" cy="109" r="10" fill="var(--accent-2)" />
      </g>
      {/* variable: a box holding one value */}
      <g className="animate-float">
        <rect
          x="300"
          y="70"
          width="120"
          height="120"
          rx="22"
          fill="var(--accent-2)"
          fillOpacity="0.18"
          stroke="var(--accent-2)"
          strokeWidth="3"
        />
        <circle cx="360" cy="130" r="22" fill="var(--xp)" />
        <circle cx="360" cy="130" r="44" fill="url(#hf-glow)" opacity="0.5" />
      </g>
      {/* decision: a diamond with two branches */}
      <g className="animate-float [animation-delay:-2s]">
        <path d="M250 250 L290 290 L250 330 L210 290 Z" fill="url(#hf-accent)" />
        <circle cx="190" cy="350" r="10" fill="var(--success)" />
        <circle cx="310" cy="350" r="10" fill="var(--success)" opacity="0.35" />
      </g>
    </svg>
  );
}
