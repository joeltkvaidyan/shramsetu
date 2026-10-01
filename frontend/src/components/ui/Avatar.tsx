import { useState } from "react";
import { UserRound } from "lucide-react";

const sizes = {
  sm: "h-10 w-10 text-sm",
  md: "h-14 w-14 text-lg",
  lg: "h-16 w-16 text-xl",
  xl: "h-20 w-20 text-2xl",
};

export function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800 text-brand-700 dark:text-brand-200 shadow-sm
        flex items-center justify-center font-bold overflow-hidden select-none ${sizes[size]} ${className}`}
      aria-hidden="true"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          /* profile_photo_path is a storage key, not a URL — resolve via API */
          referrerPolicy="no-referrer"
        />
      ) : (
        initials || <UserRound className="h-1/2 w-1/2" strokeWidth={1.5} />
      )}
    </div>
  );
}
