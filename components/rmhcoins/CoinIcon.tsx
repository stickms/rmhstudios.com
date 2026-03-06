export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" fill="#F5A623" stroke="#D4920B" strokeWidth="1" />
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fill="#8B6914"
        fontSize="9"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        R
      </text>
    </svg>
  );
}
