import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export function Screen({
  children,
  title,
  onBack,
  hideBack,
}: {
  children: ReactNode;
  title?: string;
  onBack?: (() => void) | true;
  hideBack?: boolean;
}) {
  const navigate = useNavigate();
  const handleBack =
    hideBack
      ? undefined
      : onBack === true
      ? () => navigate(-1)
      : onBack ?? (() => navigate(-1));

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
