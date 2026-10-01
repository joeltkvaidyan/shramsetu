import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * App-wide crash guard. A render-time exception used to white-screen the
 * entire SPA (e.g. an unexpected object reaching a text position in the
 * government notification form). This boundary shows a recoverable screen
 * instead, so the user can reload or navigate home without losing the page
 * entirely.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="text-4xl mb-3" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            The page hit an unexpected error and could not continue rendering.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 break-words mb-6">
            {this.state.message}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition"
            >
              Try again
            </button>
            <button
              onClick={() => {
                window.location.assign("/");
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
