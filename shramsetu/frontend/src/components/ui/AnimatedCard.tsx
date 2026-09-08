import { useState } from "react";

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  onClick?: () => void;
}

export function AnimatedCard({
  children,
  className = "",
  onClick,
}: AnimatedCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`card ${onClick ? "cursor-pointer" : ""} transition-all duration-300 ${
        hovered ? "scale-[1.02] -translate-y-0.5 shadow-lg" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface AnimatedButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function AnimatedButton({
  children,
  className = "",
  variant = "primary",
  size = "md",
  onClick,
  disabled = false,
  loading = false,
}: AnimatedButtonProps) {
  const baseClasses =
    "relative overflow-hidden rounded-2xl font-semibold transition-all duration-300 active:scale-[0.98]";

  const variantClasses = {
    primary:
      "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl",
    secondary:
      "border-2 border-blue-500 bg-white text-blue-600 hover:bg-blue-50",
    danger:
      "bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg hover:shadow-xl",
  };

  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
}
