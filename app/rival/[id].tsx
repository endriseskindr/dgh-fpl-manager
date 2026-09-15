import { useMemo } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { Badge } from "../../components/Badge";
import { ErrorBlock, LoadingShell } from "../../components/StatusStates";
import { PlayingStatusBadge } from "../../components/PlayingStatusBadge";
import { optimizeXI } from "../../lib/analytics/xiOptimizer";
import { projectNextGw } from "../../lib/analytics/projection";
import { getPlayingStatus } from "../../lib/analytics/liveStatus";
import { findRivalWeaknesses, buildFixtureRunLookup } from "../../lib/analytics/rivalIntel";
import { Page, Header, Surface, Hero, Metric, Pill, Section, Row } from "../../components/Premium";

export default function RivalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();

  const rival = useMemo(() => data?.rivals.find((r) => r.entryId === Number(id)) ?? null, [data, id]);
  const myXI = useMemo(() => (data ? optimizeXI(data.mySquad) : null), [data]);
  const rivalXI = useMemo(() => (rival?.squad ? optimizeXI(rival.squad) : null), [rival]);

  if (isLoading) return <LoadingShell label="Loading rival squad…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;
  if (!rival) return <ErrorBlock message="Rival not found in current standings." />;

  const sharedIds = new Set((data.mySquad ?? []).map((p) => p.playerId));
  const sharedCount = rival.squad ? rival.squad.filter((p) => sharedIds.has(p.playerId)).length : 0;

  return (
    <Page>
      <Header eyebrow="RIVAL SCOUT" title={rival.managerName} subtitle={rival.teamName} />

      <Hero variant="navy">
        <Pill label={`RANK #${rival.dghRank ?? rival.rank}`} tone="onHero" />
        <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900", marginTop: 10 }}>{rival.dghTotalPoints ?? rival.totalPoints} DGH pts</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>
          Gap {(rival.dghGapToMe ?? rival.gapToMe) > 0 ? "+" : ""}
          {rival.dghGapToMe ?? rival.gapToMe} vs you
        </Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Rank" value={`#${rival.rank}`} onHero />
          <Metric label="Gap to you" value={`${rival.gapToMe > 0 ? "+" : ""}${rival.gapToMe}`} onHero />
          <Metric label="Shared picks" value={String(sharedCount)} onHero />
        </View>
      </Hero>

      {rival.squadFetchFailed || !rival.squad ? (
        <Surface style={{ borderColor: theme.error }}>
          <Text style={{ color: theme.error }}>Could not fetch this rival&apos;s squad this refresh. Showing standings data only.</Text>
        </Surface>
      ) : (
        <>
          <Section title={`Squad (${rival.squad.length} picks)`} />
          <Surface>
            {rival.squad.map((p) => (
              <View key={p.playerId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <PlayingStatusBadge status={getPlayingStatus(p, data.fixtures, data.gameweek)} compact />
                  <Text style={{ color: theme.foreground, fontWeight: sharedIds.has(p.playerId) ? "700" : "400", fontSize: 13, marginLeft: 8 }}>
                    {p.player.webName} {p.isCaptain ? "(C)" : ""}
                  </Text>
                  {sharedIds.has(p.playerId) ? <Badge label="SHARED" color={theme.primary} /> : null}
                </View>
                <Text style={{ color: p.isBench ? theme.muted : theme.foreground, fontSize: 11 }}>
                  {p.player.position} · {p.isBench ? "BENCH" : "XI"}
                </Text>
              </View>
            ))}
          </Surface>

          {rivalXI && myXI ? (
            <>
              <Section title="Lineup vs. rival analysis" />
              <Surface>
                <Row label="My projected XI total" value={(myXI.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0) + (myXI.captain?.projected ?? 0)).toFixed(1)} />
                <Row label="Their projected XI total" value={(rivalXI.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0) + (rivalXI.captain?.projected ?? 0)).toFixed(1)} />
                <Row label="My captain" value={myXI.captain?.pick.player.webName ?? "—"} />
                <Row label="Their captain" value={rival.squad.find((p) => p.isCaptain)?.player.webName ?? "—"} />
                <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 8 }}>
                  Projections use each player&apos;s official FPL expected-points-next field with an availability discount — not a betting-grade forecast.
                </Text>
              </Surface>
            </>
          ) : null}

          {(() => {
            const prediction = data.spy.rivalPredictions.find((r) => r.entryId === rival.entryId);
            const weaknesses = findRivalWeaknesses(rival.squad, buildFixtureRunLookup(data.fixtureRuns));
            return (
              <>
                <Section title="DGH Spy" />
                <Surface>
                  <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12, marginBottom: 6 }}>Squad weaknesses</Text>
                  {weaknesses.map((w, i) => (
                    <Text key={i} style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginBottom: 3 }}>• {w}</Text>
                  ))}
                </Surface>
                {prediction ? (
                  <Surface>
                    <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12, marginBottom: 6 }}>Likely to transfer OUT</Text>
                    {prediction.likelyOut.length ? prediction.likelyOut.map((c) => (
                      <View key={c.playerId} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                        <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "700" }}>{c.webName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· {c.teamShort}</Text></Text>
                        <Text style={{ color: theme.muted, fontSize: 10, marginTop: 1 }}>{c.reason}</Text>
                      </View>
                    )) : <Text style={{ color: theme.muted, fontSize: 11 }}>No urgent transfer-out signals this week.</Text>}
                    <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12, marginTop: 12, marginBottom: 6 }}>Likely to transfer IN</Text>
                    {prediction.likelyIn.length ? prediction.likelyIn.map((c) => (
                      <View key={c.playerId} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                        <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "700" }}>{c.webName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· {c.teamShort}</Text></Text>
                        <Text style={{ color: theme.muted, fontSize: 10, marginTop: 1 }}>{c.reason}</Text>
                      </View>
                    )) : <Text style={{ color: theme.muted, fontSize: 11 }}>No standout in-form differential targets right now.</Text>}
                    {prediction.recentTransfers.length ? (
                      <>
                        <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12, marginTop: 12, marginBottom: 6 }}>Recent transfers</Text>
                        {prediction.recentTransfers.map((t, i) => (
                          <Text key={i} style={{ color: theme.muted, fontSize: 11, marginBottom: 2 }}>GW{t.gw}: {t.outName} → {t.inName}</Text>
                        ))}
                      </>
                    ) : null}
                    <Text style={{ color: theme.muted, fontSize: 9, marginTop: 10 }}>Heuristic prediction from current squad, form and fixtures — not a leak of their actual plans.</Text>
                  </Surface>
                ) : (
                  <Surface><Text style={{ color: theme.muted, fontSize: 11 }}>Full transfer prediction is only computed for your {3} all DGH mini-league rivals by points gap. Open the DGH Spy tab for the full feed.</Text></Surface>
                )}
              </>
            );
          })()}
        </>
      )}
    </Page>
  );
}
