import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { buildStandingsTimelapse, standingsAtEvent } from "../lib/analytics/timelapse";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../components/StatusStates";
import { Page, Header, Surface, Section, Row } from "../components/Premium";

const LINE_COLORS = ["#E0862F", "#4C8BF5", "#D9455F", "#8E5CD9", "#2E9E8C", "#D9A441", "#63705F", "#B0538F"];
const CHART_WIDTH = 320;
const CHART_HEIGHT = 190;
const PAD_X = 18;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

export default function TimelapseScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();

  const timelapse = useMemo(() => (data ? buildStandingsTimelapse(data.dghTable) : null), [data]);

  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const currentEvent = selectedEvent ?? (timelapse ? timelapse.events[timelapse.events.length - 1] : null);

  // Default chart focus: me + the current top 5 by season rank, so a 100-manager
  // league doesn't render 100 tangled lines. All series remain available in the
  // GW scrubber table below regardless of which lines are charted.
  const chartedSeries = useMemo(() => {
    if (!timelapse || !data) return [];
    const myEntryId = data.myRow?.entry ?? null;
    const lastEvent = timelapse.events[timelapse.events.length - 1];
    const finalStandings = lastEvent !== undefined ? standingsAtEvent(timelapse, lastEvent) : [];
    const topIds = finalStandings.slice(0, 5).map((s) => s.entryId);
    const ids = new Set(topIds);
    if (myEntryId !== null) ids.add(myEntryId);
    return timelapse.series.filter((s) => ids.has(s.entryId)).slice(0, 6);
  }, [timelapse, data]);

  if (isLoading) return <LoadingShell label="Building the season timelapse…" />;
  if (isError || !data || !timelapse) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  if (timelapse.events.length === 0) {
    return (
      <Page>
        <Header eyebrow="SEASON TIMELAPSE" title="Timelapse" subtitle="Standings progression, gameweek by gameweek." />
        <Surface>
          <Text style={{ color: theme.muted, fontSize: 12 }}>No ledger history yet — sync the DGH ledger from the League tab, then come back once a few gameweeks have been played.</Text>
        </Surface>
      </Page>
    );
  }

  const maxRank = Math.max(1, ...chartedSeries.flatMap((s) => s.points.map((p) => p.rank)));
  const plotWidth = CHART_WIDTH - PAD_X * 2;
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = timelapse.events.length > 1 ? plotWidth / (timelapse.events.length - 1) : 0;
  const yForRank = (rank: number) => (maxRank > 1 ? PAD_TOP + ((rank - 1) / (maxRank - 1)) * plotHeight : PAD_TOP + plotHeight / 2);

  const rowsAtSelected = currentEvent !== null ? standingsAtEvent(timelapse, currentEvent) : [];
  const myEntryId = data.myRow?.entry ?? null;

  return (
    <Page>
      <Header eyebrow="SEASON TIMELAPSE" title="Timelapse" subtitle="League-rank progression across the season, derived from the DGH ledger." />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Section title="Rank progression (you + top 5)" />
      <Surface>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Line x1={PAD_X} y1={PAD_TOP} x2={PAD_X} y2={PAD_TOP + plotHeight} stroke={theme.border} strokeWidth={1} />
          <Line x1={PAD_X} y1={PAD_TOP + plotHeight} x2={CHART_WIDTH - PAD_X} y2={PAD_TOP + plotHeight} stroke={theme.border} strokeWidth={1} />
          <SvgText x={PAD_X - 6} y={PAD_TOP + 4} fontSize={8} fill={theme.muted} textAnchor="end">#1</SvgText>
          <SvgText x={PAD_X - 6} y={PAD_TOP + plotHeight} fontSize={8} fill={theme.muted} textAnchor="end">#{maxRank}</SvgText>
          {chartedSeries.map((s, idx) => {
            const isMe = s.entryId === myEntryId;
            const color = isMe ? theme.primary : LINE_COLORS[idx % LINE_COLORS.length];
            const pts = s.points.map((p, i) => `${PAD_X + i * stepX},${yForRank(p.rank)}`).join(" ");
            return (
              <Polyline key={s.entryId} points={pts} fill="none" stroke={color} strokeWidth={isMe ? 3 : 2} opacity={isMe ? 1 : 0.85} />
            );
          })}
          {chartedSeries.map((s, idx) => {
            const isMe = s.entryId === myEntryId;
            const color = isMe ? theme.primary : LINE_COLORS[idx % LINE_COLORS.length];
            const last = s.points[s.points.length - 1];
            if (!last) return null;
            return <Circle key={`d-${s.entryId}`} cx={PAD_X + (s.points.length - 1) * stepX} cy={yForRank(last.rank)} r={isMe ? 4 : 3} fill={color} />;
          })}
          {timelapse.events.map((e, i) => (
            i % Math.max(1, Math.ceil(timelapse.events.length / 8)) === 0 ? (
              <SvgText key={`x-${e}`} x={PAD_X + i * stepX} y={CHART_HEIGHT - 4} fontSize={8} fill={theme.muted} textAnchor="middle">
                {e}
              </SvgText>
            ) : null
          ))}
        </Svg>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
          {chartedSeries.map((s, idx) => {
            const isMe = s.entryId === myEntryId;
            const color = isMe ? theme.primary : LINE_COLORS[idx % LINE_COLORS.length];
            return (
              <View key={s.entryId} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                <Text style={{ color: theme.muted, fontSize: 10, fontWeight: isMe ? "900" : "600" }}>{s.teamName}{isMe ? " (you)" : ""}</Text>
              </View>
            );
          })}
        </View>
      </Surface>

      <Section title="Scrub through the season" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {timelapse.events.map((e) => (
          <Pressable
            key={e}
            onPress={() => setSelectedEvent(e)}
            style={{ backgroundColor: e === currentEvent ? theme.primary : theme.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}
          >
            <Text style={{ color: e === currentEvent ? "#04140D" : theme.foreground, fontWeight: "700", fontSize: 12 }}>GW{e}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Surface>
        {rowsAtSelected.length === 0 ? (
          <Text style={{ color: theme.muted, fontSize: 12 }}>No standings for this gameweek yet.</Text>
        ) : (
          rowsAtSelected.map((r) => (
            <Row
              key={r.entryId}
              label={`#${r.rank} · ${r.teamName}`}
              value={`${r.cumulativePoints} pts · GW ${r.gwAdjusted >= 0 ? "+" : ""}${r.gwAdjusted}`}
              emphasis={r.entryId === myEntryId}
            />
          ))
        )}
      </Surface>
    </Page>
  );
}
