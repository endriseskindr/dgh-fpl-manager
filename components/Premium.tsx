import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, RefreshControl, ScrollView, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../hooks/useTheme";

// Screen container. Pads for the real device safe area (status bar / notch on top,
// home-indicator or gesture bar on the bottom) instead of a fixed guess, so content
// never sits under the Android system bars.
//
// Optional `refreshing`/`onRefresh` wire a standard pull-to-refresh gesture into the
// screen's own ScrollView. Only meaningful when `scroll` is true — FlatList-based
// screens (which render `<Page scroll={false}>` as their own ListHeaderComponent)
// attach RefreshControl to the FlatList itself instead, since only one scrollable
// ancestor may own the gesture.
export function Page({
  children,
  scroll = true,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const content = (
    <View style={{ paddingHorizontal: 18, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }}>
      {children}
    </View>
  );
  if (!scroll) return <View style={{ flex: 1, backgroundColor: theme.background }}>{content}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        ) : undefined
      }
    >
      {content}
    </ScrollView>
  );
}


export function Header({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        {eyebrow ? <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>{eyebrow}</Text> : null}
        <Text style={{ color: theme.foreground, fontSize: 27, fontWeight: "900", letterSpacing: -0.5, marginTop: 4 }}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Surface({ children, style, accent = false }: { children: React.ReactNode; style?: ViewStyle; accent?: boolean }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: theme.surface, borderRadius: 20, borderWidth: 1, borderColor: accent ? theme.primary : theme.border, padding: 16, marginBottom: 12 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// Big gradient "hero" card — the vivid green (or navy) banner that carries the
// countdown / headline stat, mirroring the FPL Wizard reference screens.
export function Hero({ children, variant = "green", style }: { children: React.ReactNode; variant?: "green" | "navy"; style?: ViewStyle }) {
  const { theme } = useTheme();
  const [from, to] = variant === "green" ? [theme.heroFrom, theme.heroTo] : [theme.heroAltFrom, theme.heroAltTo];
  return (
    <LinearGradient
      colors={[from, to]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.6, y: 1 }}
      style={[{ borderRadius: 24, padding: 18, marginBottom: 14, overflow: "hidden" }, style]}
    >
      {children}
    </LinearGradient>
  );
}

// Dark card that floats on top of a Hero gradient (e.g. the "My team" box on the
// FPL Wizard green screen) — always readable regardless of light/dark app theme.
export function HeroInset({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        { backgroundColor: "rgba(6,16,12,0.34)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Section({ title, action }: { title: string; action?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 9 }}>
      <Text style={{ color: theme.foreground, fontSize: 15, fontWeight: "900" }}>{title}</Text>
      {action}
    </View>
  );
}

export function Metric({ label, value, detail, positive = false, large = false, onHero = false }: { label: string; value: string; detail?: string; positive?: boolean; large?: boolean; onHero?: boolean }) {
  const { theme } = useTheme();
  const valueColor = onHero ? "#FFFFFF" : positive ? theme.success : theme.foreground;
  const labelColor = onHero ? "rgba(255,255,255,0.75)" : theme.muted;
  const detailColor = onHero ? "rgba(255,255,255,0.6)" : theme.muted;
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: labelColor, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      <Text style={{ color: valueColor, fontSize: large ? 30 : 20, fontWeight: "900", marginTop: 4 }}>{value}</Text>
      {detail ? <Text style={{ color: detailColor, fontSize: 10, marginTop: 2 }}>{detail}</Text> : null}
    </View>
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "primary" | "success" | "warning" | "danger" | "neutral" | "onHero" }) {
  const { theme } = useTheme();
  if (tone === "onHero") {
    return (
      <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.22)" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 }}>{label}</Text>
      </View>
    );
  }
  const color = tone === "primary" ? theme.primary : tone === "success" ? theme.success : tone === "warning" ? theme.warning : tone === "danger" ? theme.error : theme.muted;
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: color + "55" }}>
      <Text style={{ color, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

export function IconButton({ icon, onPress, label, onHero = false }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; onHero?: boolean }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: onHero ? 0 : 1,
        borderColor: theme.border,
        backgroundColor: onHero ? "rgba(255,255,255,0.22)" : theme.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={onHero ? "#FFFFFF" : theme.primary} />
    </Pressable>
  );
}

// Round, coloured shortcut tile with a label underneath — mirrors the FPL Wizard
// "Shortcuts" row (My Team / Players / Fixtures / Clubs …) for fast navigation.
export function Shortcut({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color?: string; onPress: () => void }) {
  const { theme } = useTheme();
  const bg = color ?? theme.primary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ alignItems: "center", width: 62, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: bg, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Ionicons name={icon} size={21} color="#FFFFFF" />
      </View>
      <Text style={{ color: theme.muted, fontSize: 9.5, fontWeight: "800", textAlign: "center" }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{ minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: theme.border + "80" }}>
      <Text style={{ color: theme.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: emphasis ? theme.primary : theme.foreground, fontSize: 12, fontWeight: "800", maxWidth: "58%", textAlign: "right" }}>{value}</Text>
    </View>
  );
}
