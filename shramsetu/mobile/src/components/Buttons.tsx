import { ReactNode } from "react";
import { Text, TouchableOpacity, ActivityIndicator } from "react-native";

export function PrimaryButton({
  children,
  onPress,
  disabled,
  loading,
  className = "",
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      className={`rounded-2xl bg-brand-600 px-6 py-4 items-center shadow-sm ${
        disabled || loading ? "opacity-50" : ""
      } ${className}`}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-base font-semibold">{children}</Text>}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  children,
  onPress,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      className={`rounded-2xl border-2 border-brand-600 px-6 py-4 items-center ${
        disabled ? "opacity-50" : ""
      } ${className}`}
    >
      <Text className="text-brand-700 dark:text-brand-300 text-base font-semibold">{children}</Text>
    </TouchableOpacity>
  );
}

export function DangerOutlineButton({
  children,
  onPress,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      className={`rounded-2xl border-2 border-red-500 px-6 py-4 items-center ${disabled ? "opacity-50" : ""} ${className}`}
    >
      <Text className="text-red-600 dark:text-red-400 text-base font-semibold">{children}</Text>
    </TouchableOpacity>
  );
}
