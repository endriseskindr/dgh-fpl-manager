import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../hooks/useTheme";

export default function TabsLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 7);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          height: 56 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 6,
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "War Room", tabBarIcon: (p) => <Ionicons name="shield-checkmark" color={p.color} size={p.size} /> }} />
      <Tabs.Screen name="live" options={{ title: "Live", tabBarIcon: (p) => <Ionicons name="pulse" color={p.color} size={p.size} /> }} />
      <Tabs.Screen name="league" options={{ title: "League", tabBarIcon: (p) => <Ionicons name="trophy" color={p.color} size={p.size} /> }} />
      <Tabs.Screen name="transfers" options={{ title: "Moves", tabBarIcon: (p) => <Ionicons name="swap-horizontal" color={p.color} size={p.size} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: (p) => <Ionicons name="grid" color={p.color} size={p.size} /> }} />

      <Tabs.Screen name="spy" options={{ href: null, title: "DGH Spy" }} />
      <Tabs.Screen name="rivals" options={{ href: null, title: "Rivals" }} />
      <Tabs.Screen name="squad" options={{ href: null, title: "Squad" }} />
      <Tabs.Screen name="fixtures" options={{ href: null, title: "Fixtures" }} />
      <Tabs.Screen name="ownership" options={{ href: null, title: "Ownership" }} />
      <Tabs.Screen name="chips" options={{ href: null, title: "Chips" }} />
      <Tabs.Screen name="tools" options={{ href: null, title: "Tools" }} />
      <Tabs.Screen name="whatif" options={{ href: null, title: "What-If" }} />
      <Tabs.Screen name="forecast" options={{ href: null, title: "Forecast" }} />
    </Tabs>
  );
}
