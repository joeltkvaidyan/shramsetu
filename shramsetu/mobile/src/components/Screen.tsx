import { ReactNode } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

export function Screen({
  children,
  title,
  showBack = false,
  scroll = true,
}: {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  scroll?: boolean;
}) {
  const navigation = useNavigation();
  const Body = scroll ? ScrollView : View;

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900" edges={["top"]}>
      {(title || showBack) && (
        <View className="flex-row items-center gap-3 bg-white dark:bg-gray-800 px-4 py-4 shadow-sm">
          {showBack && (
            <TouchableOpacity onPress={() => navigation.goBack()} className="p-1" activeOpacity={0.6}>
              <Text className="text-2xl text-gray-700 dark:text-gray-200">←</Text>
            </TouchableOpacity>
          )}
          {title && <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</Text>}
        </View>
      )}
      <Body className="flex-1 px-4 py-5" contentContainerStyle={scroll ? { paddingBottom: 40 } : undefined}>
        {children}
      </Body>
    </SafeAreaView>
  );
}
