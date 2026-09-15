import { Text, View } from "react-native";
import { PLAYING_STATUS_ICON, PLAYING_STATUS_LABEL, type PlayingStatus } from "../lib/analytics/liveStatus";

/**
 * Compact "left to play" indicator for a squad row: 🟢 playing / ⏳ not
 * started / ⚪ finished / 🔴 subbed off. `compact` renders icon-only (for
 * tight rows); otherwise the label is shown alongside it.
 */
export function PlayingStatusBadge({ status, compact = false }: { status: PlayingStatus; compact?: boolean }) {
  if (compact) {
    return (
      <Text style={{ fontSize: 13 }} accessibilityLabel={PLAYING_STATUS_LABEL[status]}>
        {PLAYING_STATUS_ICON[status]}
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text style={{ fontSize: 12 }}>{PLAYING_STATUS_ICON[status]}</Text>
      <Text style={{ fontSize: 9, fontWeight: "800", color: "#8892A0" }}>{PLAYING_STATUS_LABEL[status].toUpperCase()}</Text>
    </View>
  );
}
