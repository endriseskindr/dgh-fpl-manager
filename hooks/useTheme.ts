import { useColorScheme } from "react-native";
import { colors, type ThemeColors } from "../theme/colors";

export function useTheme(): { theme: ThemeColors; scheme: "light" | "dark" } {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return { theme: colors[scheme], scheme };
}
