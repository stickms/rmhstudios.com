/** A marquee strip. The items repeat once so the loop is seamless; it pauses on hover and focus. */
export function Ticker({
  items,
  tone = 'yellow',
  label,
}: {
  items: string[];
  tone?: 'yellow' | 'ink' | 'pink';
  label: string;
}) {
  if (!items.length) return null;
  const cls = tone === 'ink' ? 'el-strip el-strip--ink' : tone === 'pink' ? 'el-strip el-strip--pink' : 'el-strip';
  return (
    <div className={cls} role="marquee" aria-label={label}>
      <div className="el-strip__track" onMouseEnter={pause} onMouseLeave={play} onFocus={pause} onBlur={play}>
        {[...items, ...items].map((s, i) => (
          <span className="el-strip__item" key={i} aria-hidden={i >= items.length}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

const pause = (e: { currentTarget: HTMLElement }) => (e.currentTarget.style.animationPlayState = 'paused');
const play = (e: { currentTarget: HTMLElement }) => (e.currentTarget.style.animationPlayState = 'running');
