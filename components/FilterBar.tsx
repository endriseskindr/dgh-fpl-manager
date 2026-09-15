import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { Surface, Pill } from "./Premium";
import type { PlayerFilters, PlayerPosition, SavedFilter } from "../lib/filtersStore";
import type { FplTeam } from "../lib/types";

const POSITIONS: PlayerPosition[] = ["GKP", "DEF", "MID", "FWD"];

type Props = {
  filters: PlayerFilters;
  onChange: (patch: Partial<PlayerFilters>) => void;
  onReset: () => void;
  isActive: boolean;
  teams?: FplTeam[];
  savedFilters?: SavedFilter[];
  onApplyPreset?: (preset: SavedFilter) => void;
  onSavePreset?: (name: string) => void;
  onDeletePreset?: (id: string) => void;
  /** Shown next to the search box, e.g. "48 players". Kept out of this component since result count depends on the caller's data. */
  resultLabel?: string;
};

/**
 * Shared filter surface used identically on Compare, Transfers, Ownership,
 * Spy and Watchlist — search + quick position/availability chips inline,
 * with a "More filters" sheet for price/points range, club, and saved
 * presets. Keeping this in one component means a filter behaves the same
 * everywhere instead of drifting screen to screen.
 */
export function FilterBar({ filters, onChange, onReset, isActive, teams = [], savedFilters = [], onApplyPreset, onSavePreset, onDeletePreset, resultLabel }: Props) {
  const { theme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Inline text field rather than Alert.prompt — Alert.prompt is iOS-only in
  // React Native and silently no-ops on Android, which is this app's target.
  const [presetName, setPresetName] = useState("");

  const togglePosition = (pos: PlayerPosition) => {
    const next = filters.positions.includes(pos) ? filters.positions.filter((p) => p !== pos) : [...filters.positions, pos];
    onChange({ positions: next });
  };

  const toggleClub = (id: number) => {
    const next = filters.clubIds.includes(id) ? filters.clubIds.filter((c) => c !== id) : [...filters.clubIds, id];
    onChange({ clubIds: next });
  };

  const confirmSave = () => {
    if (!onSavePreset || !presetName.trim()) return;
    onSavePreset(presetName.trim());
    setPresetName("");
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10 }}>
          <Ionicons name="search-outline" size={15} color={theme.muted} />
          <TextInput
            value={filters.search}
            onChangeText={(t) => onChange({ search: t })}
            placeholder="Search players…"
            placeholderTextColor={theme.muted}
            style={{ flex: 1, color: theme.foreground, paddingVertical: 9, paddingHorizontal: 8, fontSize: 13 }}
          />
          {filters.search.length > 0 ? (
            <Pressable onPress={() => onChange({ search: "" })} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={theme.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="More filters"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isActive ? theme.primary : theme.border,
            backgroundColor: isActive ? theme.primary + "22" : theme.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="options-outline" size={18} color={isActive ? theme.primary : theme.muted} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 4 }}>
        {POSITIONS.map((pos) => {
          const active = filters.positions.includes(pos);
          return (
            <Pressable key={pos} onPress={() => togglePosition(pos)}>
              <Pill label={pos} tone={active ? "primary" : "neutral"} />
            </Pressable>
          );
        })}
        <Pressable onPress={() => onChange({ availableOnly: !filters.availableOnly })}>
          <Pill label="Available only" tone={filters.availableOnly ? "success" : "neutral"} />
        </Pressable>
        {isActive ? (
          <Pressable onPress={onReset}>
            <Pill label="Clear all" tone="danger" />
          </Pressable>
        ) : null}
        {resultLabel ? (
          <View style={{ justifyContent: "center", paddingLeft: 4 }}>
            <Text style={{ color: theme.muted, fontSize: 10, fontWeight: "800" }}>{resultLabel}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={() => setSheetOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ marginTop: "auto", backgroundColor: theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%" }}
          >
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: "center", marginBottom: 16 }} />
              <Text style={{ color: theme.foreground, fontSize: 17, fontWeight: "900", marginBottom: 14 }}>Filters</Text>

              <Text style={{ color: theme.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginBottom: 8 }}>PRICE RANGE (£m)</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <RangeInput theme={theme} placeholder="Min" value={filters.minPrice} onChange={(v) => onChange({ minPrice: v })} />
                <RangeInput theme={theme} placeholder="Max" value={filters.maxPrice} onChange={(v) => onChange({ maxPrice: v })} />
              </View>

              <Text style={{ color: theme.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginBottom: 8 }}>TOTAL POINTS</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <RangeInput theme={theme} placeholder="Min" value={filters.minPoints} onChange={(v) => onChange({ minPoints: v })} />
                <RangeInput theme={theme} placeholder="Max" value={filters.maxPoints} onChange={(v) => onChange({ maxPoints: v })} />
              </View>

              {teams.length > 0 ? (
                <>
                  <Text style={{ color: theme.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginBottom: 8 }}>CLUBS</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                    {teams.map((t) => (
                      <Pressable key={t.id} onPress={() => toggleClub(t.id)}>
                        <Pill label={t.short_name} tone={filters.clubIds.includes(t.id) ? "primary" : "neutral"} />
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {onSavePreset ? (
                <Surface>
                  <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12, marginBottom: 8 }}>Saved filters</Text>
                  {isActive ? (
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                      <TextInput
                        value={presetName}
                        onChangeText={setPresetName}
                        placeholder="Name this filter set…"
                        placeholderTextColor={theme.muted}
                        style={{ flex: 1, backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: theme.foreground, fontSize: 12 }}
                      />
                      <Pressable
                        onPress={confirmSave}
                        disabled={!presetName.trim()}
                        style={{ paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: presetName.trim() ? theme.primary : theme.surfaceAlt }}
                      >
                        <Text style={{ color: presetName.trim() ? theme.background : theme.muted, fontWeight: "900", fontSize: 11 }}>SAVE</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {savedFilters.length === 0 ? (
                    <Text style={{ color: theme.muted, fontSize: 11, marginTop: 8 }}>No saved filters yet.</Text>
                  ) : (
                    savedFilters.map((s) => (
                      <View key={s.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                        <Pressable onPress={() => onApplyPreset?.(s)} style={{ flex: 1 }}>
                          <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "700" }}>{s.name}</Text>
                        </Pressable>
                        <Pressable onPress={() => onDeletePreset?.(s.id)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={15} color={theme.muted} />
                        </Pressable>
                      </View>
                    ))
                  )}
                </Surface>
              ) : null}

              <Pressable
                onPress={() => setSheetOpen(false)}
                style={{ marginTop: 16, minHeight: 46, borderRadius: 14, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: theme.background, fontWeight: "900" }}>DONE</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function RangeInput({ theme, placeholder, value, onChange }: { theme: any; placeholder: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <TextInput
      value={value === null ? "" : String(value)}
      onChangeText={(t) => {
        const n = Number(t.replace(/[^0-9.]/g, ""));
        onChange(t.trim() === "" || Number.isNaN(n) ? null : n);
      }}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      keyboardType="numeric"
      style={{ flex: 1, backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: theme.foreground, fontSize: 13 }}
    />
  );
}
