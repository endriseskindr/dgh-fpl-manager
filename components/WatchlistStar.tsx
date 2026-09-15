import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";

export function WatchlistStar({ starred, onPress, size = 20 }: { starred: boolean; onPress: () => void; size?: number }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={starred ? "Remove from watchlist" : "Add to watchlist"}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
    >
      <Ionicons name={starred ? "star" : "star-outline"} size={size} color={starred ? theme.warning : theme.muted} />
    </Pressable>
  );
}
