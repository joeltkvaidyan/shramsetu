import { TextInput, TextInputProps, View, Text } from "react-native";

export function FormField({
  label,
  optional,
  hint,
  ...props
}: TextInputProps & { label: string; optional?: boolean; hint?: string }) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label} {optional && <Text className="text-gray-400">(optional)</Text>}
      </Text>
      <TextInput
        placeholderTextColor="#9ca3af"
        className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-gray-100"
        {...props}
      />
      {hint && <Text className="text-xs text-gray-400 mt-1">{hint}</Text>}
    </View>
  );
}
