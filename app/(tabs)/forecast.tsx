import { useMemo, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { useWatchlist } from "../../hooks/useWatchlist";
import { buildWarRoomRecommendation } from "../../lib/analytics/warRoom";
import { projectPerGw, applyMovesToSquad } from "../../lib/analytics/forecast";
import { optimizeXI } from "../../lib/analytics/xiOptimizer";
import { buildFixtureRunLookup } from "../../lib/analytics/rivalIntel";
import { multiGwValueScore } from "../../lib/analytics/multiGwHorizon";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../../components/StatusStates";
import { WatchlistStar } from "../../components/WatchlistStar";
import { Page, Header, Surface, Hero, Metric, Pill, Section, Row } from "../../components/Premium";

export default function ForecastScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };
  const { watchlistIds, isStarred, toggle } = useWatchlist();

  const forecast = useMemo(() => (data ? projectPerGw(data.mySquad, data.fixtureRuns, 5) : []), [data]);

  const rec = useMemo(() => {
    if (!data) return null;
    return buildWarRoomRecommendation({
      squad: data.mySquad,
      pool: data.playerPool,
      rivals: data.rivals,
      bank: data.bank,
      freeTransfers: data.freeTransfers,
      myRank: data.myRow?.dghRank ?? data.myRow?.rank ?? 999,
      myTotal: data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0,
      standingsTotals: data.standings.map((s) => s.total),
      gameweeksRemaining: Math.max(1, 38 - data.gameweek),
    });
  }, [data]);

  const forecastAfterTransfer = useMemo(() => {
    if (!data || !rec || !rec.bestScenario.moves.length) return null;
    const afterSquad = applyMovesToSquad(data.mySquad, rec.bestScenario.moves);
    const xi = optimizeXI(afterSquad);
    // Re-flag isXI/isCaptain on the working squad from the fresh optimizer result so projectPerGw sees the right XI.
    const flagged = afterSquad.map((p) => ({
      ...p,
      isXI: xi.startingXI.some((s) => s.playerId === p.playerId),
      isCaptain: xi.captain?.pick.playerId === p.playerId,
    }));
    return projectPerGw(flagged, data.fixtureRuns, 5);
  }, [data, rec]);

  if (isLoading) return <LoadingShell label="Projecting your next 5 gameweeks…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;

  const windowTotal = forecast.reduce((s, f) => s + f.fixtureAdjusted, 0);
  const best = [...forecast].sort((a, b) => b.fixtureAdjusted - a.fixtureAdjusted)[0];
  const worst = [...forecast].sort((a, b) => a.fixtureAdjusted - b.fixtureAdjusted)[0];
  const maxPts = Math.max(1, ...forecast.map((f) => f.fixtureAdjusted));
  const afterTotal = forecastAfterTransfer ? forecastAfterTransfer.reduce((s, f) => s + f.fixtureAdjusted, 0) : null;
  const fixtureRunByTeam = buildFixtureRunLookup(data.fixtureRuns);
  const watchedPlayers = watchlistIds.map((id) => data.playerIndex.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header eyebrow="FORECAST" title="GW Forecast" subtitle="Projected points per gameweek, assuming your current XI holds" />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Hero variant="green">
        <Pill label={`NEXT ${forecast.length} GAMEWEEKS`} tone="onHero" />
        <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900", marginTop: 10 }}>{windowTotal.toFixed(1)} pts</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>Fixture-adjusted total across the window</Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Best GW" value={best ? `GW${best.gw}` : "—"} detail={best ? `${best.fixtureAdjusted} pts` : undefined} onHero />
          <Metric label="Toughest GW" value={worst ? `GW${worst.gw}` : "—"} detail={worst ? `${worst.fixtureAdjusted} pts` : undefined} onHero />
          <Metric label="Weekly avg" value={(windowTotal / Math.max(1, forecast.length)).toFixed(1)} onHero />
        </View>
      </Hero>

      <Section title="★ Your watchlist" />
      <Surface>
        {watchedPlayers.length ? watchedPlayers.map((p) => {
          const horizon = multiGwValueScore(p, fixtureRunByTeam.get(p.teamId));
          return (
            <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/player/${p.id}`)}>
                <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }}>{p.webName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· {p.teamShort}</Text></Text>
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>3-GW outlook {horizon.score.toFixed(1)}</Text>
              </Pressable>
              <WatchlistStar starred={isStarred(p.id)} onPress={() => toggle(p.id)} size={16} />
            </View>
          );
        }) : <Text style={{ color: theme.muted, fontSize: 11 }}>Star players from Spy, Transfers or a player page to see their outlook here.</Text>}
      </Surface>

      <Section title="Gameweek by gameweek" />
      <Surface>
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 120, marginBottom: 14 }}>
          {forecast.map((f) => (
            <View key={f.gw} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: theme.foreground, fontSize: 10, fontWeight: "800", marginBottom: 4 }}>{f.fixtureAdjusted}</Text>
              <View
                style={{
                  width: "62%",
                  height: Math.max(4, (f.fixtureAdjusted / maxPts) * 84),
                  backgroundColor: f.gw === best?.gw ? theme.success : f.gw === worst?.gw ? theme.warning : theme.primary,
                  borderRadius: 6,
                }}
              />
              <Text style={{ color: theme.muted, fontSize: 10, marginTop: 6, fontWeight: "700" }}>GW{f.gw}</Text>
            </View>
          ))}
        </View>
        {forecast.map((f) => (
          <View key={f.gw} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }}>GW{f.gw}</Text>
              <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }}>{f.fixtureAdjusted} pts</Text>
            </View>
            {f.blanks.length ? <Text style={{ color: theme.warning, fontSize: 11, marginTop: 3 }}>Blank: {f.blanks.join(", ")}</Text> : null}
            {f.doubles.length ? <Text style={{ color: theme.success, fontSize: 11, marginTop: 3 }}>Double: {f.doubles.join(", ")}</Text> : null}
          </View>
        ))}
      </Surface>

      {rec && rec.bestScenario.moves.length ? (
        <>
          <Section title="If you make the recommended transfer" />
          <Surface>
            <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 14 }}>
              {rec.bestScenario.moves.map((m) => `${m.out.webName} → ${m.in.webName}`).join(" · ")}
            </Text>
            <Row label={`Current ${forecast.length}-GW total`} value={`${windowTotal.toFixed(1)} pts`} />
            <Row label="After this transfer" value={afterTotal !== null ? `${afterTotal.toFixed(1)} pts` : "—"} emphasis />
            <Row label="Window swing" value={afterTotal !== null ? `${afterTotal - windowTotal >= 0 ? "+" : ""}${(afterTotal - windowTotal).toFixed(1)} pts` : "—"} />
            <Row label="This-GW hit" value={rec.bestScenario.hits ? `-${rec.bestScenario.hitCost} pts` : "No hit"} />
            <Pressable onPress={() => router.push("/(tabs)/whatif")} style={{ marginTop: 12, borderRadius: 12, backgroundColor: theme.primary, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: theme.background, fontWeight: "900", fontSize: 13 }}>EXPLORE YOUR OWN MOVES</Text>
            </Pressable>
          </Surface>
        </>
      ) : (
        <Surface>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>No transfer currently clears the DGH hit threshold — holding is the recommended move this window.</Text>
        </Surface>
      )}

      <Surface style={{ backgroundColor: theme.surfaceAlt }}>
        <Text style={{ color: theme.foreground, fontWeight: "800" }}>How to read this</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          This is an outlook, not a guarantee — it assumes your current XI and captain hold across every gameweek shown, and uses official FPL fixture difficulty to adjust each player&apos;s baseline projection up or down.
        </Text>
      </Surface>
    </Page>
  );
}
