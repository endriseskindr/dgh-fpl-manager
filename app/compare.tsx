import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { LoadingShell, ErrorBlock } from "../components/StatusStates";
import { Page, Header, Surface, Section, Pill } from "../components/Premium";
import { comparePlayers, formatMetric, RADAR_METRIC_KEYS } from "../lib/analytics/playerCompare";
import type { EnrichedPlayer } from "../lib/types";

const RADAR_SIZE = 260;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 96;

function RadarChart({ result, colorA, colorB }: { result: ReturnType<typeof comparePlayers>; colorA: string; colorB: string }) {
  const radarMetrics = RADAR_METRIC_KEYS.map((k) => result.metrics.find((m) => m.key === k)).filter((m): m is NonNullable<typeof m> => !!m);
  const n = radarMetrics.length;
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointFor = (i: number, norm: number) => {
    const r = (Math.max(0, Math.min(100, norm)) / 100) * RADAR_RADIUS;
    const angle = angleFor(i);
    return { x: RADAR_CENTER + r * Math.cos(angle), y: RADAR_CENTER + r * Math.sin(angle) };
  };
  const aPoints = radarMetrics.map((m, i) => pointFor(i, m.aNorm));
  const bPoints = radarMetrics.map((m, i) => pointFor(i, m.bNorm));
  const toPolygon = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Svg width={RADAR_SIZE} height={RADAR_SIZE} viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}>
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <Polygon
          key={frac}
          points={toPolygon(radarMetrics.map((_, i) => pointFor(i, frac * 100)))}
          fill="none"
          stroke="#8892A0"
          strokeOpacity={0.25}
          strokeWidth={1}
        />
      ))}
      {radarMetrics.map((_, i) => {
        const edge = pointFor(i, 100);
        return <Line key={i} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={edge.x} y2={edge.y} stroke="#8892A0" strokeOpacity={0.25} strokeWidth={1} />;
      })}
      <Polygon points={toPolygon(bPoints)} fill={colorB} fillOpacity={0.22} stroke={colorB} strokeWidth={2} />
      <Polygon points={toPolygon(aPoints)} fill={colorA} fillOpacity={0.22} stroke={colorA} strokeWidth={2} />
      {aPoints.map((p, i) => <Circle key={`a${i}`} cx={p.x} cy={p.y} r={3} fill={colorA} />)}
      {bPoints.map((p, i) => <Circle key={`b${i}`} cx={p.x} cy={p.y} r={3} fill={colorB} />)}
      {radarMetrics.map((m, i) => {
        const labelPoint = pointFor(i, 122);
        return (
          <SvgText key={m.key} x={labelPoint.x} y={labelPoint.y} fontSize={9} fontWeight="700" fill="#8892A0" textAnchor="middle">
            {m.label.split(" ")[0]}
          </SvgText>
        );
      })}
    </Svg>
  );
}

function PlayerPicker({ label, players, selectedId, exclude, onPick }: { label: string; players: EnrichedPlayer[]; selectedId: number | null; exclude: number | null; onPick: (id: number) => void }) {
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    let pool = players.filter((p) => p.id !== exclude);
    if (search.trim()) pool = pool.filter((p) => p.webName.toLowerCase().includes(search.toLowerCase()));
    return pool.slice(0, 20);
  }, [players, search, exclude]);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  return (
    <Surface>
      <Text style={{ color: theme.muted, fontSize: 10, fontWeight: "800", marginBottom: 6 }}>{label}</Text>
      {selected ? (
        <Pressable onPress={() => onPick(-1)} style={{ paddingVertical: 6 }}>
          <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 15 }}>{selected.webName}</Text>
          <Text style={{ color: theme.muted, fontSize: 11 }}>{selected.teamShort} · {selected.position} · £{selected.price}m · tap to change</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            placeholder="Search players…"
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
            style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, color: theme.foreground, marginBottom: 6 }}
          />
          {filtered.map((p) => (
            <Pressable key={p.id} onPress={() => onPick(p.id)} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 13 }}>{p.webName}</Text>
              <Text style={{ color: theme.muted, fontSize: 10 }}>{p.teamShort} · {p.position} · £{p.price}m</Text>
            </Pressable>
          ))}
        </>
      )}
    </Surface>
  );
}

export default function ComparePlayersScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const [idA, setIdA] = useState<number | null>(params.a ? Number(params.a) : null);
  const [idB, setIdB] = useState<number | null>(params.b ? Number(params.b) : null);

  if (isLoading) return <LoadingShell label="Loading player pool…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  const playerA = data.playerPool.find((p) => p.id === idA) ?? null;
  const playerB = data.playerPool.find((p) => p.id === idB) ?? null;
  const result = playerA && playerB ? comparePlayers(playerA, playerB) : null;
  const colorA = theme.primary;
  const colorB = theme.error;

  return (
    <Page>
      <Header eyebrow="PLAYER COMPARISON" title="Compare Two Players" subtitle="Side-by-side on form, value, underlying stats and fixture context" />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <PlayerPicker label="PLAYER A" players={data.playerPool} selectedId={idA} exclude={idB} onPick={(id) => setIdA(id === -1 ? null : id)} />
        </View>
        <View style={{ flex: 1 }}>
          <PlayerPicker label="PLAYER B" players={data.playerPool} selectedId={idB} exclude={idA} onPick={(id) => setIdB(id === -1 ? null : id)} />
        </View>
      </View>

      {result ? (
        <>
          <Section title="Shape comparison" />
          <Surface style={{ alignItems: "center" }}>
            <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorA }} />
                <Text style={{ color: theme.foreground, fontSize: 11, fontWeight: "700" }}>{result.a.webName}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorB }} />
                <Text style={{ color: theme.foreground, fontSize: 11, fontWeight: "700" }}>{result.b.webName}</Text>
              </View>
            </View>
            <RadarChart result={result} colorA={colorA} colorB={colorB} />
          </Surface>

          <Surface style={{ borderColor: theme.primary }}>
            <Pill label={result.verdict.winner === "even" ? "TOO CLOSE TO CALL" : `EDGE: ${(result.verdict.winner === "a" ? result.a : result.b).webName.toUpperCase()}`} tone={result.verdict.winner === "even" ? "warning" : "primary"} />
            <Text style={{ color: theme.foreground, fontSize: 12, marginTop: 8, lineHeight: 18 }}>{result.verdict.reason}</Text>
          </Surface>

          <Section title="Full breakdown" />
          <Surface>
            <View style={{ flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={{ flex: 1.4, color: theme.muted, fontSize: 10, fontWeight: "800" }}>METRIC</Text>
              <Text style={{ flex: 1, color: colorA, fontSize: 10, fontWeight: "800", textAlign: "right" }}>{result.a.webName}</Text>
              <Text style={{ flex: 1, color: colorB, fontSize: 10, fontWeight: "800", textAlign: "right" }}>{result.b.webName}</Text>
            </View>
            {result.metrics.map((m) => {
              const { aDisplay, bDisplay } = formatMetric(m);
              const aBetter = m.aNorm > m.bNorm;
              const bBetter = m.bNorm > m.aNorm;
              return (
                <View key={m.key} style={{ flexDirection: "row", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.border + "80" }}>
                  <Text style={{ flex: 1.4, color: theme.foreground, fontSize: 11 }}>{m.label}</Text>
                  <Text style={{ flex: 1, color: aBetter ? theme.success : theme.foreground, fontSize: 11, fontWeight: aBetter ? "900" : "600", textAlign: "right" }}>{aDisplay}</Text>
                  <Text style={{ flex: 1, color: bBetter ? theme.success : theme.foreground, fontSize: 11, fontWeight: bBetter ? "900" : "600", textAlign: "right" }}>{bDisplay}</Text>
                </View>
              );
            })}
          </Surface>
        </>
      ) : (
        <Surface>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Pick two players above to compare them.</Text>
        </Surface>
      )}

      <Pressable onPress={() => router.back()} style={{ marginTop: 4, alignSelf: "center" }}>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "700" }}>‹ BACK</Text>
      </Pressable>
    </Page>
  );
}
