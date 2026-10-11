import './SecurityVisuals.css';

export function SecurityHeroVisual() {
  return (
    <div className="security-hero-visual" aria-hidden="true">
      <div className="security-hero-grid" />
      <div className="security-hero-orbit security-hero-orbit-outer" />
      <div className="security-hero-orbit security-hero-orbit-inner" />

      <div className="security-data-chip security-data-chip-top">
        <span className="security-data-chip-mark" />
        <span>PRIVATE SESSION</span>
        <span className="security-data-chip-value">01 / 03</span>
      </div>

      <div className="security-core">
        <div className="security-core-halo" />
        <svg className="security-core-shield" viewBox="0 0 180 204" fill="none">
          <path
            className="security-shield-shadow"
            d="M90 12 157 38v51c0 46-27 78-67 101C50 167 23 135 23 89V38L90 12Z"
          />
          <path
            className="security-shield-outline"
            d="M90 8 160 35v54c0 48-29 83-70 107C49 172 20 137 20 89V35L90 8Z"
          />
          <path
            className="security-shield-inner"
            d="M90 25 145 46v42c0 38-22 66-55 85-33-19-55-47-55-85V46l55-21Z"
          />
          <path className="security-shield-check" d="m66 98 16 16 34-37" />
          <circle className="security-shield-node" cx="90" cy="57" r="3" />
          <path className="security-shield-rule" d="M73 137h34" />
        </svg>
        <span className="security-core-caption">IDENTITY<br />PROTECTED</span>
      </div>

      <div className="security-data-chip security-data-chip-left">
        <span className="security-chip-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none"><path d="M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7M3.5 7h9v6h-9V7Z" /></svg>
        </span>
        <span><b>Encrypted</b><small>In transit &amp; at rest</small></span>
      </div>

      <div className="security-data-chip security-data-chip-right">
        <span className="security-pulse-dot" />
        <span><b>Private by design</b><small>Your details stay yours</small></span>
      </div>

      <div className="security-data-ribbon">
        <span>SECURE ENROLLMENT</span><i /><span>YOUR INFORMATION, RESPECTED</span>
      </div>
      <span className="security-hero-coordinate">SV–04&nbsp; / &nbsp;VERIFIED SPACE</span>
    </div>
  );
}

export function SecurityLoadingIndicator({ label }: { label: string }) {
  return (
    <div className="security-loading" role="status" aria-label={label}>
      <span className="security-loading-visual" aria-hidden="true">
        <span className="security-loading-orbit security-loading-orbit-one" />
        <span className="security-loading-orbit security-loading-orbit-two" />
        <svg className="security-loading-shield" viewBox="0 0 48 54" fill="none">
          <path d="M24 3 42 10v14c0 12-7.5 20.5-18 27C13.5 44.5 6 36 6 24V10L24 3Z" />
          <path d="m17 26 5 5 10-11" />
        </svg>
      </span>
      <span className="security-loading-label">{label}</span>
    </div>
  );
}
