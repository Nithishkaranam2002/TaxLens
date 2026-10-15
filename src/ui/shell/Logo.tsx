export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <svg width={small ? 22 : 26} height={small ? 22 : 26} viewBox="0 0 32 32" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--btn)" />
        <path d="M6 13h20M6 19h20M6 25h20" stroke="var(--btn-fg)" strokeOpacity=".18" strokeWidth="1" />
        <path d="M8.5 16.8c2.2 1.3 3.8 3.1 5 5.6C16.4 15 20.6 9.8 25 7" fill="none" stroke="var(--btn-fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!small && (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Tickmark</div>
          <div className="mt-0.5 text-[10.5px] text-fg-3">Every number carries its proof</div>
        </div>
      )}
    </div>
  );
}
