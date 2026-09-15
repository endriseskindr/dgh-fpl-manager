import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { useTeamStrengthOverrides } from "../../hooks/useTeamStrengthOverrides";
import { Badge } from "../../components/Badge";
import { ErrorBlock, FreshnessBanner, LoadingShell } from "../../components/StatusStates";
import { Page, Header, Surface, Hero, Metric, Section, Pill } from "../../components/Premium";
import { buildDghFixtureDifficulty } from "../../lib/analytics/teamStrength";

function difficultyColor(theme: any, d: number) {
  if (d <= 2) return theme.success;
  if (d === 3) return theme.warning;
  return theme.error;
}

export default function FixturesScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };
  const { overrides } = useTeamStrengthOverrides();

  // DGH supplementary difficulty (from Team Strength Intelligence). Purely
  // additive — official FDR (run.next[].difficulty / averageDifficulty) is
  // never modified. Kept behind useMemo so it only recomputes when the
  // underlying bootstrap/fixtures/overrides actually change.
  const dghAvgByTeam = useMemo(() => {
    if (!data) return new Map<number, number>();
    const entries = buildDghFixtureDifficulty(data.bootstrap, data.fixtures, overrides);
    const byTeam = new Map<number, number[]>();
    for (const e of entries) {
      if (e.event == null || e.event < data.gameweek) continue;
      if (!byTeam.has(e.teamId)) byTeam.set(e.teamId, []);
      byTeam.get(e.teamId)!.push(e.dghFdr);
    }
    const avg = new Map<number, number>();
    for (const [teamId, vals] of byTeam) {
      const top5 = vals.slice(0, 5);
      avg.set(teamId, Math.round((top5.reduce((s, v) => s + v, 0) / top5.length) * 100) / 100);
    }
    return avg;
  }, [data, overrides]);

  if (isLoading) return <LoadingShell label="Loading fixtures…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;

  const easiest = [...data.fixtureRuns].sort((a, b) => a.averageDifficulty - b.averageDifficulty)[0];
  const toughest = [...data.fixtureRuns].sort((a, b) => b.averageDifficulty - a.averageDifficulty)[0];
  const bestSwing = [...data.fixtureSwing].sort((a, b) => b.swing - a.swing)[0];

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header
        eyebrow="FIXTURE INTELLIGENCE"
        title="Fixtures"
        subtitle="Official FDR plus the DGH supplementary difficulty model"
        right={
          <Pressable onPress={() => router.push("/team-strength" as any)}>
            <Pill label="EDIT STRENGTH" tone="primary" />
          </Pressable>
        }
      />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Hero variant="green">
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 }}>NEXT 5 GAMEWEEKS</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900", marginTop: 8 }}>{easiest?.teamShort ?? "—"} has the kindest run</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>Avg difficulty {easiest?.averageDifficulty ?? "—"} across upcoming fixtures</Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Toughest run" value={toughest?.teamShort ?? "—"} detail={`avg ${toughest?.averageDifficulty ?? "—"}`} onHero />
          <Metric label="Best swing" value={bestSwing?.teamShort ?? "—"} detail={`${bestSwing && bestSwing.swing > 0 ? "+" : ""}${bestSwing?.swing ?? "—"}`} onHero />
          <Metric label="Teams tracked" value={String(data.fixtureRuns.length)} onHero />
        </View>
      </Hero>

      <Section title="Fixture difficulty" />
      {data.fixtureRuns.map((run) => (
        <Surface key={run.teamId}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ color: theme.foreground, fontWeight: "800" }}>{run.teamShort}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Badge label={`FDR ${run.averageDifficulty}`} color={difficultyColor(theme, run.averageDifficulty)} />
              {dghAvgByTeam.has(run.teamId) ? (
                <Badge label={`DGH ${dghAvgByTeam.get(run.teamId)!.toFixed(1)}`} color={difficultyColor(theme, dghAvgByTeam.get(run.teamId)!)} />
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {run.next.map((f, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: difficultyColor(theme, f.difficulty) + "22",
                  borderColor: difficultyColor(theme, f.difficulty),
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  marginRight: 6,
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: difficultyColor(theme, f.difficulty), fontWeight: "700", fontSize: 12 }}>
                  {f.isHome ? "" : "@"}
                  {f.opponentShort}
                </Text>
              </View>
            ))}
          </View>
        </Surface>
      ))}

      <Section title="Fixture swing" />
      <Surface>
        <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginBottom: 10 }}>
          Positive swing = fixtures get easier soon (good time to buy in). Negative = fixtures toughen (consider selling before it turns).
        </Text>
        {data.fixtureSwing.slice(0, 10).map((s) => (
          <View key={s.teamId} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 12 }}>{s.teamShort}</Text>
            <Text style={{ color: s.swing > 0 ? theme.success : s.swing < 0 ? theme.error : theme.muted, fontWeight: "800", fontSize: 12 }}>
              {s.swing > 0 ? "+" : ""}
              {s.swing}
            </Text>
          </View>
        ))}
      </Surface>
    </Page>
  );
}
