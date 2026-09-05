/**
 * The cybernetic shield from the auth screen — a mesh constellation wrapping a
 * lit envelope. Inline SVG so the cyan stroke can carry a real drop-glow and
 * the whole mark scales without an asset request.
 */
export function ShieldMark({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 100 100" aria-hidden>
      <path
        className="drop-shadow-[0_0_10px_rgba(0,240,255,0.65)]"
        d="M50 8C72 8 86 18 86 36C86 64 50 92 50 92C50 92 14 64 14 36C14 18 28 8 50 8Z"
        stroke="#00F0FF"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <path
        d="M50 14L32 26M50 14L68 26M32 26L24 44M68 26L76 44M24 44L34 68M76 44L66 68M34 68L50 86M66 68L50 86M50 14V32M32 26L50 32M68 26L50 32M24 44L36 44M76 44L64 44M34 68L50 72M66 68L50 72"
        stroke="#00A572"
        strokeDasharray="2 2"
        strokeOpacity="0.75"
        strokeWidth="1.2"
      />
      {[
        [50, 14, "#00F0FF"],
        [32, 26, "#4EDEA3"],
        [68, 26, "#4EDEA3"],
        [24, 44, "#4EDEA3"],
        [76, 44, "#4EDEA3"],
        [34, 68, "#00F0FF"],
        [66, 68, "#00F0FF"],
        [50, 86, "#00F0FF"],
      ].map(([cx, cy, fill]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5" fill={fill as string} />
      ))}
      <rect
        x="28"
        y="34"
        width="44"
        height="28"
        rx="3"
        fill="#0A0E18"
        stroke="#00F0FF"
        strokeWidth="2"
      />
      <path d="M29 35L50 51L71 35" stroke="#00F0FF" strokeLinecap="round" strokeWidth="2" />
      <path d="M29 61L44 48" stroke="#00dbe9" strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M71 61L56 48" stroke="#00dbe9" strokeOpacity="0.6" strokeWidth="1.5" />
    </svg>
  );
}
