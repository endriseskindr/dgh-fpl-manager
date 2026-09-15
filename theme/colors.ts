export const colors = {
  light: {
    primary: "#2FA83F",
    background: "#F3F7F1",
    surface: "#FFFFFF",
    surfaceAlt: "#EAF3E6",
    foreground: "#0F1712",
    muted: "#63705F",
    border: "#DCE6D6",
    success: "#1E9D53",
    warning: "#B87300",
    error: "#D54B4B",
    accent: "#3E6FB0",
    // Hero gradient (top → bottom) used behind the main countdown / status card.
    heroFrom: "#6BDE4C",
    heroTo: "#0E7A46",
    // Secondary hero gradient (navy) used for alternate hero surfaces / accent cards.
    heroAltFrom: "#15427F",
    heroAltTo: "#0A2447",
    // Dark inset card that floats on top of a hero gradient.
    heroCard: "#0E1D2E",
  },
  dark: {
    primary: "#8FEA57",
    background: "#070E19",
    surface: "#101F30",
    surfaceAlt: "#17293D",
    foreground: "#F5F8FA",
    muted: "#8CA0B4",
    border: "#22344A",
    success: "#33D17A",
    warning: "#FFB547",
    error: "#FF6B6B",
    accent: "#7EA3D1",
    heroFrom: "#59D149",
    heroTo: "#0B5D33",
    heroAltFrom: "#173F73",
    heroAltTo: "#081B36",
    heroCard: "#0E1D2E",
  },
} as const;
export type ColorScheme = keyof typeof colors;
// Was `typeof colors.dark` — that pins ThemeColors to dark's exact string
// literals, so colors.light (different literal values) couldn't satisfy it.
// Widen each field to `string` so either palette is assignable.
export type ThemeColors = { [K in keyof typeof colors.dark]: string };
export function riskColor(theme: ThemeColors, risk: "LOW" | "MEDIUM" | "HIGH") { return risk === "LOW" ? theme.success : risk === "MEDIUM" ? theme.warning : theme.error; }
export function confidenceColor(theme: ThemeColors, level: "CONFIRMED" | "SUPPORTED" | "PROBABLE" | "SPECULATIVE") { return level === "CONFIRMED" ? theme.success : level === "SUPPORTED" ? theme.primary : level === "PROBABLE" ? theme.warning : theme.error; }
