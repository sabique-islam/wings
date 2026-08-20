const LOGO_URL = "/wings-logo.png";

interface Props {
  size?: number;
  className?: string;
  withWordmark?: boolean;
  wordmarkClassName?: string;
}

/**
 * Wings brand mark. The PNG is white-on-black; `.nw-logo-mark` knocks out
 * the field and inverts on light surfaces so we don't ship a second asset.
 */
export function Logo({ size = 32, className = "", withWordmark = false, wordmarkClassName = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={LOGO_URL}
        width={size}
        height={size}
        alt="Wings"
        loading="eager"
        decoding="async"
        className="nw-logo-mark block select-none"
        draggable={false}
        style={{ width: size, height: size }}
      />
      {withWordmark && (
        <span className={`font-mono tracking-tight ${wordmarkClassName || "text-sm"}`}>wings</span>
      )}
    </span>
  );
}
