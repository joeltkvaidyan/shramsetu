import { View, ViewProps } from "react-native";

export function Card({ children, className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}
