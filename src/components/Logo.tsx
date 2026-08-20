const LOGO_URL = "/wings-logo.png";

interface Props {
  size?: number;
  className?: string;
  withWordmark?: boolean;
  wordmarkClassName?: string;
}

/**
 * Wings brand mark. Wraps the uploaded logo asset so we never inline the
 * binary path in components — swap the asset and every surface updates.
 */
export function Logo({ size = 28, className = "", withWordmark = false, wordmarkClassName = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={LOGO_URL}
        height={size}
        alt="Wings"
        loading="eager"
        decoding="async"
        className="block w-auto max-w-none select-none"
        draggable={false}
        style={{ height: size, width: "auto" }}
      />
      {withWordmark && (
        <span className={`font-mono tracking-tight ${wordmarkClassName || "text-sm"}`}>wings</span>
      )}
    </span>
  );
}
