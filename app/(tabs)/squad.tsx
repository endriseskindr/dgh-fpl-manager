import { useMemo, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { Badge } from "../../components/Badge";
import { ErrorBlock, FreshnessBanner, LoadingShell } from "../../components/StatusStates";
import { PlayingStatusBadge } from "../../components/PlayingStatusBadge";
import { optimizeXI } from "../../lib/analytics/xiOptimizer";
import { rankCaptainAlt } from "../../lib/analytics/captainAlt";
import { rankCaptainRegret } from "../../lib/analytics/ultimateEngine";
import { getPlayingStatus } from "../../lib/analytics/liveStatus";
import { buildFixtureRunLookup } from "../../lib/analytics/rivalIntel";
import { confidenceColor } from "../../theme/colors";
import { Page, Header, Surface, Hero, HeroInset, Metric, Section, Row } from "../../components/Premium";

export default function SquadScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };
  const xi = useMemo(() => (data ? optimizeXI(data.mySquad) : null), [data]);
  const captainAlt = useMemo(() => {
    if (!data) return [];
    const runsByTeam = buildFixtureRunLookup(data.fixtureRuns);
    return rankCaptainAlt(data.mySquad.map((p) => p.player), runsByTeam, 3);
  }, [data]);
  // Seeded Monte-Carlo captain-regret model (lib/analytics/ultimateEngine.ts):
  // simulates each XI candidate's likely outcome distribution and reports how
  // often — and by how much — captaining them would have been the wrong call
  // vs. the best-performing option in that simulation. Deterministic (fixed
  // seed) so re-renders don't reshuffle the ranking.
  const captainRegret = useMemo(() => (data ? rankCaptainRegret(data.mySquad).slice(0, 4) : []), [data]);

  if (isLoading) return <LoadingShell label="Loading your squad…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;
  if (!xi) return <ErrorBlock message="Squad not available — picks may not have been submitted for this gameweek yet." />;

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header
        eyebrow="SQUAD PLANNER"
        title={data.liveState === "LIVE" ? "Planning XI" : "My Squad"}
        subtitle={data.liveState === "LIVE" ? `GW${data.planningGameweek}` : `GW${data.gameweek}`}
      />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Hero variant="green">
        <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.6, opacity: 0.85 }}>
          RECOMMENDED XI · {xi.formation}
        </Text>
        <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900", marginTop: 8 }}>
          {xi.captain?.pick.player.webName ?? "—"}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>{xi.captain?.reason}</Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Vice-Captain" value={xi.viceCaptain?.pick.player.webName ?? "—"} onHero />
          <Metric label="Differential" value={xi.differentialCaptain?.pick.player.webName ?? "None"} onHero />
          <Metric label="Bench order" value={String(xi.bench.length)} onHero />
        </View>
        {xi.differentialCaptain ? (
          <HeroInset style={{ marginTop: 14 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 12, lineHeight: 18 }}>{xi.differentialCaptain.reason}</Text>
          </HeroInset>
        ) : null}
      </Hero>

      <Section title="Starting XI" />
      <Surface>
        {xi.startingXI.map((p) => (
          <PlayerRow key={p.playerId} p={p} theme={theme} fixtures={data.fixtures} gameweek={data.gameweek} />
        ))}
      </Surface>

      <Section title="Bench (order)" />
      <Surface>
        {xi.bench.map((p, i) => (
          <PlayerRow key={p.playerId} p={p} theme={theme} order={i + 1} fixtures={data.fixtures} gameweek={data.gameweek} />
        ))}
      </Surface>

      {captainAlt.length ? (
        <>
          <Section title="Second opinion (x402-ported model)" />
          <Surface>
            <Text style={{ color: theme.muted, fontSize: 10, marginBottom: 8 }}>
              An alternative captain scorer with different weights — for comparison, not a recommendation to change your pick above.
            </Text>
            {captainAlt.map((c, i) => (
              <Row key={c.playerId} label={`${i + 1}. ${c.webName}`} value={c.score.toFixed(1)} emphasis={i === 0} />
            ))}
          </Surface>
        </>
      ) : null}

      {captainRegret.length ? (
        <>
          <Section title="Captain regret model (Monte-Carlo)" />
          <Surface>
            <Text style={{ color: theme.muted, fontSize: 10, marginBottom: 8 }}>
              Simulated 1,500 times: how often — and by how much — each option would have been the wrong captain call vs. the best performer that simulation.
            </Text>
            {captainRegret.map((c, i) => (
              <View key={c.player.playerId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: i === captainRegret.length - 1 ? 0 : 1, borderBottomColor: theme.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 13 }}>{i + 1}. {c.player.player.webName}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>
                    Regret {c.regretProbabilityPct}% of sims · avg {c.regretPoints} pts · {c.expectedPoints} xPts
                  </Text>
                </View>
                <Badge label={c.label} color={c.label === "RISKY" ? theme.error : c.label === "DIFFERENTIAL" ? theme.warning : c.label === "SAFE" ? theme.success : theme.primary} />
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      {xi.changesFromCurrent.length ? (
        <>
          <Section title="Changes vs. your current picks" />
          <Surface>
            {xi.changesFromCurrent.map((c, i) => (
              <Text key={i} style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginBottom: i === xi.changesFromCurrent.length - 1 ? 0 : 4 }}>
                • {c.detail}
              </Text>
            ))}
          </Surface>
        </>
      ) : null}
    </Page>
  );
}

function PlayerRow({ p, theme, order, fixtures, gameweek }: { p: any; theme: any; order?: number; fixtures: any[]; gameweek: number }) {
  return (
    <Pressable onPress={() => router.push(`/player/${p.playerId}`)}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <PlayingStatusBadge status={getPlayingStatus(p, fixtures, gameweek)} compact />
          <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 13, marginLeft: 8 }}>
            {order ? `${order}. ` : ""}
            {p.player.webName} {p.isCaptain ? "©" : p.isViceCaptain ? "(VC)" : ""}
          </Text>
        </View>
        <Text style={{ color: theme.muted, fontSize: 11, marginRight: 8 }}>
          {p.player.position} · £{p.player.price}m
        </Text>
        <Badge label={p.player.availability.confidence} color={confidenceColor(theme, p.player.availability.confidence)} />
      </View>
    </Pressable>
  );
}
