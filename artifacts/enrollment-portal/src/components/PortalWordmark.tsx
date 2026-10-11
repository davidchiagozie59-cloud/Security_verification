type PortalWordmarkProps = {
  inverse?: boolean;
  className?: string;
};

export function PortalWordmark({ inverse = false, className = '' }: PortalWordmarkProps) {
  return (
    <div className={`portal-wordmark ${inverse ? 'portal-wordmark-inverse' : ''} ${className}`} aria-label="Security Verification Enrollment Portal">
      <span className="portal-wordmark-primary">Security Verification</span>
      <span className="portal-wordmark-secondary">Enrollment Portal</span>
    </div>
  );
}
