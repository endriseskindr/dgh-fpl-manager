import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import type { ThemeColors } from "../theme/colors";

export type PointsHistoryEntry = { round: number; total_points: number; minutes: number };

const WIDTH = 300;
const HEIGHT = 70;
const PAD_X = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;

/**
 * Points-per-gameweek sparkline — same react-native-svg dependency already
 * used by the radar chart in compare.tsx, just wired to element-summary
 * history instead. Dim/hollow dots mark blanks (0 minutes) so a quiet run of
 * games reads at a glance, not just the point total.
 */
export function PointsSparkline({ history, theme }: { history: PointsHistoryEntry[]; theme: ThemeColors }) {
  if (history.length === 0) {
    return <Text style={{ color: theme.muted, fontSize: 11 }}>No gameweek history yet this season.</Text>;
  }

  const recent = history.slice(-10);
  const maxPts = Math.max(1, ...recent.map((h) => h.total_points));
  const plotWidth = WIDTH - PAD_X * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = recent.length > 1 ? plotWidth / (recent.length - 1) : 0;

  const points = recent.map((h, i) => ({
    x: PAD_X + i * stepX,
    y: PAD_TOP + plotHeight - (h.total_points / maxPts) * plotHeight,
    entry: h,
  }));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const best = points.reduce((a, b) => (b.entry.total_points > a.entry.total_points ? b : a), points[0]);

  return (
    <View>
      <Svg width={WIDTH} height={HEIGHT}>
        <Line x1={PAD_X} y1={PAD_TOP + plotHeight} x2={WIDTH - PAD_X} y2={PAD_TOP + plotHeight} stroke={theme.border} strokeWidth={1} />
        <Polyline points={polylinePoints} fill="none" stroke={theme.primary} strokeWidth={2} />
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.entry.minutes === 0 ? 2.5 : 3.5}
            fill={p.entry.minutes === 0 ? theme.surface : theme.primary}
            stroke={theme.primary}
            strokeWidth={p.entry.minutes === 0 ? 1.5 : 0}
          />
        ))}
        {points.map((p, i) => (
          <SvgText key={`t${i}`} x={p.x} y={HEIGHT - 3} fontSize={8} fill={theme.muted} textAnchor="middle">
            {p.entry.round}
          </SvgText>
        ))}
      </Svg>
      <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>
        Last {recent.length} GWs · best GW{best.entry.round} ({best.entry.total_points} pts) · hollow dot = blank (0 mins)
      </Text>
    </View>
  );
}
