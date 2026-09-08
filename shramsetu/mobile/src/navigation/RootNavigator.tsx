import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";

import { useAuth } from "../store/AuthContext";

import LanguageSelectScreen from "../screens/LanguageSelectScreen";
import RoleSelectScreen from "../screens/RoleSelectScreen";
import ComingSoonScreen from "../screens/ComingSoonScreen";
import WorkerLoginScreen from "../screens/WorkerLoginScreen";
import WorkerRegisterScreen from "../screens/WorkerRegisterScreen";
import OTPVerifyScreen from "../screens/OTPVerifyScreen";

import DashboardScreen from "../screens/DashboardScreen";
import DocumentWalletScreen from "../screens/DocumentWalletScreen";
import ChatbotScreen from "../screens/ChatbotScreen";
import GrievanceListScreen from "../screens/GrievanceListScreen";
import GrievanceFormScreen from "../screens/GrievanceFormScreen";
import GrievanceDetailScreen from "../screens/GrievanceDetailScreen";
import SettingsScreen from "../screens/SettingsScreen";

const AuthStack = createNativeStackNavigator();
const GrievanceStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthNavigator({ initialRoute }: { initialRoute: "Language" | "Roles" }) {
  return (
    <AuthStack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Language" component={LanguageSelectScreen} />
      <AuthStack.Screen name="Roles" component={RoleSelectScreen} />
      <AuthStack.Screen name="ComingSoon" component={ComingSoonScreen} />
      <AuthStack.Screen name="WorkerLogin" component={WorkerLoginScreen} />
      <AuthStack.Screen name="WorkerRegister" component={WorkerRegisterScreen} />
      <AuthStack.Screen name="OTPVerify" component={OTPVerifyScreen} />
    </AuthStack.Navigator>
  );
}

function GrievancesNavigator() {
  return (
    <GrievanceStack.Navigator screenOptions={{ headerShown: false }}>
      <GrievanceStack.Screen name="GrievanceList" component={GrievanceListScreen} />
      <GrievanceStack.Screen name="GrievanceForm" component={GrievanceFormScreen} />
      <GrievanceStack.Screen name="GrievanceDetail" component={GrievanceDetailScreen} />
    </GrievanceStack.Navigator>
  );
}

const TAB_ICONS: Record<string, string> = {
  HomeTab: "🏠",
  DocumentsTab: "📄",
  ChatTab: "💬",
  GrievancesTab: "📢",
  SettingsTab: "⚙️",
};

function AppTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>{TAB_ICONS[route.name]}</Text>,
        tabBarActiveTintColor: "#1a7c54",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      })}
    >
      <Tabs.Screen name="HomeTab" component={DashboardScreen} options={{ tabBarLabel: "Home" }} />
      <Tabs.Screen name="DocumentsTab" component={DocumentWalletScreen} options={{ tabBarLabel: "Documents" }} />
      <Tabs.Screen name="ChatTab" component={ChatbotScreen} options={{ tabBarLabel: "Assistant" }} />
      <Tabs.Screen name="GrievancesTab" component={GrievancesNavigator} options={{ tabBarLabel: "Complaints" }} />
      <Tabs.Screen name="SettingsTab" component={SettingsScreen} options={{ tabBarLabel: "Settings" }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { worker, loading } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("shramsetu_onboarded_language").then((v) => setOnboarded(v === "true"));
  }, []);

  if (loading || onboarded === null) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
        <ActivityIndicator size="large" color="#1a7c54" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {worker ? <AppTabs /> : <AuthNavigator initialRoute={onboarded ? "Roles" : "Language"} />}
    </NavigationContainer>
  );
}
