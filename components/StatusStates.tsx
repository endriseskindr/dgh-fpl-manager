import { ActivityIndicator, Pressable, Text, View, type DimensionValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../hooks/useTheme";
import { Card } from "./Card";

export function LoadingShell({ label = "Loading…" }: { label?: string }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 18, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }}>
      <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }}>DGH FPL MANAGER</Text>
      <Text style={{ color: theme.foreground, fontSize: 24, fontWeight: "900", marginTop: 10 }}>Preparing this feature</Text>
      <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>{label} Your navigation remains available while cached data and calculations finish.</Text>
      <View style={{ marginTop: 20, gap: 10 }}>
        {(["76%", "92%", "58%"] as DimensionValue[]).map((width, index) => <View key={index} style={{ height: index === 0 ? 88 : 18, width, borderRadius: 10, backgroundColor: theme.surfaceAlt }} />)}
      </View>
      <View style={{ marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: theme.surfaceAlt }}>
        <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17 }}>Last-known-good data will appear first when available. Fresh official FPL data continues in the background.</Text>
      </View>
    </View>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
      <ActivityIndicator color={theme.primary} size="large" />
      <Text style={{ color: theme.foreground, fontWeight: "800", marginTop: 12 }}>{label}</Text>
      <Text style={{ color: theme.muted, fontSize: 10, marginTop: 5 }}>Official FPL data · please wait</Text>
    </View>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 18, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18, justifyContent: "center" }}>
      <Card style={{ borderColor: theme.error }}>
        <Text style={{ color: theme.error, fontWeight: "900", fontSize: 12 }}>DATA UNAVAILABLE</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }}>{message}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry} style={{ marginTop: 14, minHeight: 44, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.background, fontWeight: "900" }}>RETRY</Text>
          </Pressable>
        ) : null}
      </Card>
    </View>
  );
}

/**
 * Standard "nothing to show" state for a filtered/searched list — distinct
 * from ErrorBlock (nothing went wrong, the current filters just match zero
 * rows) so a blank list never reads as broken. Used as FlatList's
 * ListEmptyComponent; renders below the list header, so it carries its own
 * horizontal margin to line up with row content.
 */
export function EmptyBlock({
  title = "No results",
  message,
  icon = "search-outline",
}: {
  title?: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ marginHorizontal: 18, marginTop: 6 }}>
      <Card style={{ alignItems: "center", paddingVertical: 30 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.surfaceAlt, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Ionicons name={icon} size={20} color={theme.muted} />
        </View>
        <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 13, textAlign: "center" }}>{title}</Text>
        <Text style={{ color: theme.muted, fontSize: 12, textAlign: "center", marginTop: 5, lineHeight: 17, maxWidth: 280 }}>{message}</Text>
      </Card>
    </View>
  );
}

export function FreshnessBanner({ stale, fetchedAt }: { stale: boolean; fetchedAt: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.surfaceAlt, marginBottom: 10 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stale ? theme.warning : theme.success, marginRight: 7 }} />
      <Text style={{ color: theme.muted, fontSize: 9, fontWeight: "800" }}>
        {stale ? "CACHED DATA" : "FRESH DATA"} · {new Date(fetchedAt).toLocaleTimeString()}
      </Text>
    </View>
  );
}
