import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function Screen({
  children,
  title,
  onBack,
  hideBack,
  defaultBack = "/roles",
}: {
  children: ReactNode;
  title?: string;
  onBack?: (() => void) | true;
  hideBack?: boolean;
  defaultBack?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // A default location.key ("default") means we were loaded directly (deep
  // link / refresh / login redirect) with no in-app history to go back to.
  // In that case navigate(-1) would leave the app or do nothing, so we fall
  // back to a sensible in-app target instead.
  const goBack = () => {
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate(defaultBack);
    }
  };

  const handleBack =
    hideBack ? undefined : onBack === true ? goBack : onBack ?? goBack;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {(title || handleBack) && (
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-4 shadow-sm">
          {handleBack && (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 active:scale-90 transition text-lg font-bold shrink-0"
            >
              ←
            </button>
          )}
          {title && (
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {title}
            </h1>
          )}
        </header>
      )}
      <main className="flex-1 px-4 py-5 max-w-md mx-auto w-full">{children}</main>
    </div>
  );
}
