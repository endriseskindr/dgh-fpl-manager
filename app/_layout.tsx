import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import type { ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { useEffect } from "react";
import { InteractionManager } from "react-native";
import { initializeNotifications } from "../lib/notifications";
import { registerDghBackgroundTask } from "../lib/background";
import { ErrorBlock } from "../components/StatusStates";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Root-level recovery boundary (Expo Router convention: a layout file may
 * export a named `ErrorBoundary`, which Router mounts in place of the
 * layout's children whenever a render/render-phase error is thrown below
 * it). Reuses the same ErrorBlock/RETRY affordance already used for
 * data-fetch errors, so a crash anywhere in the tree degrades to one
 * consistent, recoverable screen instead of a blank/white screen or a
 * native red-box crash.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ErrorBlock
        message={
          __DEV__
            ? error.message
            : "Something went wrong loading DGH War Room. Your data is safe — tap retry to reload this screen."
        }
        onRetry={retry}
      />
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      // Notifications/background registration are non-critical OS setup.
      // Never compete with the first interactive frame.
      void initializeNotifications();
      void registerDghBackgroundTask();
    });
    return () => task.cancel();
  }, []);
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = colors[scheme];
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.foreground,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="rival/[id]" options={{ title: "Rival Squad" }} />
          <Stack.Screen name="player/[id]" options={{ title: "Player Detail" }} />
          <Stack.Screen name="compare" options={{ title: "Compare Players" }} />
          <Stack.Screen name="team-strength" options={{ title: "Team Strength" }} />
          <Stack.Screen name="league-settings" options={{ title: "League Settings" }} />
          <Stack.Screen name="awards" options={{ title: "Awards" }} />
          <Stack.Screen name="newsletter" options={{ title: "Newsletter" }} />
          <Stack.Screen name="domination-sheet" options={{ title: "Domination Sheet" }} />
          <Stack.Screen name="mini-league-template" options={{ title: "Template Team" }} />
          <Stack.Screen name="timelapse" options={{ title: "Timelapse" }} />
          <Stack.Screen name="fpl-wide" options={{ title: "FPL-Wide Intelligence" }} />
          <Stack.Screen name="manager-lookup" options={{ title: "Manager Lookup" }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
