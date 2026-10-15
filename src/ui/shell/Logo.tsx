export function Logo({ small, large }: { small?: boolean; large?: boolean }) {
  const s = small ? 24 : large ? 36 : 30;
  return (
    <div className="flex items-center gap-2.5 px-1">
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--btn)" />
        <path d="M6 13h20M6 19h20M6 25h20" stroke="var(--btn-fg)" strokeOpacity=".16" strokeWidth="1" />
        <path d="M8.5 16.8c2.2 1.3 3.8 3.1 5 5.6C16.4 15 20.6 9.8 25 7" fill="none" stroke="var(--btn-fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!small && (
        <div className="leading-tight">
          <div className={large ? 'text-xl font-semibold tracking-[-0.015em]' : 'text-md font-semibold tracking-[-0.01em]'}>TaxLens</div>
          {!large && <div className="text-cap text-fg-3">Every number carries its proof</div>}
        </div>
      )}
    </div>
  );
}
