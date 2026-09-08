import { View, Text, TouchableOpacity, ScrollView } from "react-native";

export interface ChipOption {
  value: string;
  label: string;
}

export function ChipSelect({
  label,
  options,
  value,
  onChange,
  optional,
  wrap = true,
}: {
  label?: string;
  options: ChipOption[];
  value: string | null;
  onChange: (v: string) => void;
  optional?: boolean;
  wrap?: boolean;
}) {
  const Container = wrap ? View : ScrollView;
  const containerProps = wrap
    ? { className: "flex-row flex-wrap gap-2" }
    : { horizontal: true, showsHorizontalScrollIndicator: false, className: "flex-row gap-2" };

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {label} {optional && <Text className="text-gray-400">(optional)</Text>}
        </Text>
      )}
      <Container {...(containerProps as any)}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.75}
              className={`rounded-xl px-3.5 py-2.5 mr-2 mb-2 ${
                selected
                  ? "bg-brand-600"
                  : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  selected ? "text-white" : "text-gray-700 dark:text-gray-200"
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Container>
    </View>
  );
}
