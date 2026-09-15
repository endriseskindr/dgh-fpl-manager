import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Link } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { LoadingShell, ErrorBlock, EmptyBlock, FreshnessBanner } from "../../components/StatusStates";
import { Page, Header, Hero, Metric, Surface, IconButton, Pill } from "../../components/Premium";
import { PlayingStatusBadge } from "../../components/PlayingStatusBadge";
import { calculateLiveDghScore } from "../../lib/squadBuilder";
import { getPlayingStatus, summarizeSquadPlayingStatus } from "../../lib/analytics/liveStatus";
import { buildFixturePicksView, fixtureScoreLabel } from "../../lib/analytics/liveFixtures";
import { DefConTracker } from "../../components/DefConTracker";

export default function LiveScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"table" | "fixtures">("table");
  const [squadExpanded, setSquadExpanded] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const raw = data.standings.map((standing) => {
      const squad = standing.entry === data.myRow?.entry
        ? data.mySquad
        : data.rivals.find(r => r.entryId === standing.entry)?.squad ?? null;
      const rival = data.rivals.find(r => r.entryId === standing.entry);
      const chip = standing.entry === data.myRow?.entry ? data.activeChip : (rival?.activeChip ?? null);
      const hits = standing.entry === data.myRow?.entry ? data.currentTransferHits : (rival?.transferHits ?? 0);
      const score = squad
        ? calculateLiveDghScore(squad, chip, hits, data.fixtures, data.gameweek)
        : null;
      const disqualified = chip === "wildcard" || chip === "freehit";
      return {
        ...standing,
        live: score,
        dghPoints: score?.dghPoints ?? data.dghTable.managers.find(m => m.entryId === standing.entry)?.gwRows.find(g => g.event === data.gameweek)?.gwAdjusted ?? 0,
        disqualified,
        chip,
        hits,
        verified: !!squad,
      };
    });

    // DGH placement: eligible managers first by live DGH points, then the
    // lowest eligible manager (the GW relegation spot), then Wildcard/Free Hit
    // users are disqualified and placed below that relegated manager.
    const eligible = raw.filter(r => !r.disqualified).sort((a,b) => b.dghPoints - a.dghPoints || a.rank - b.rank);
    const disqualified = raw.filter(r => r.disqualified).sort((a,b) => b.dghPoints - a.dghPoints || a.rank - b.rank);
    const ordered = [...eligible, ...disqualified];
    let previousPoints: number | null = null;
    let previousRank = 0;
    return ordered.map((row, index) => {
      const liveRank = row.disqualified ? null : row.dghPoints === previousPoints ? previousRank : index + 1;
      if (!row.disqualified) { previousPoints = row.dghPoints; previousRank = liveRank ?? index + 1; }
      return { ...row, liveRank };
    });
  }, [data]);

  const mySquadWithStatus = useMemo(() => {
    if (!data) return [];
    return [...data.mySquad]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({ pick: p, status: getPlayingStatus(p, data.fixtures, data.gameweek) }));
  }, [data]);

  const statusCounts = useMemo(() => {
    if (!data) return null;
    return summarizeSquadPlayingStatus(data.mySquad, data.fixtures, data.gameweek);
  }, [data]);

  const fixturesView = useMemo(() => {
    if (!data) return [];
    return buildFixturePicksView({
      fixtures: data.fixtures,
      teams: data.bootstrap.teams,
      gameweek: data.gameweek,
      mySquad: data.mySquad,
      myRow: data.myRow,
      rivals: data.rivals,
    });
  }, [data]);

  if (isLoading) return <LoadingShell label="Loading live DGH mini-league…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Live data unavailable")} onRetry={() => refetch()} />;

  const me = rows.find((r) => r.entry === data.myRow?.entry);
  const leader = rows.find(r => !r.disqualified);
  const relegated = [...rows].reverse().find(r => !r.disqualified);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };

  const header = (
    <Page scroll={false}>
      <Header eyebrow="LIVE DGH MINI-LEAGUE" title={`GW${data.gameweek} · All Managers`} subtitle={`${rows.length} managers · DGH-adjusted live scoring`} right={<IconButton icon="refresh" label="Refresh live league" onPress={doRefresh} />} />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />
      <Hero variant="green">
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Metric label="Your DGH rank" value={me?.liveRank ? `#${me.liveRank}` : me?.disqualified ? "DQ" : "—"} onHero large />
          <Metric label="Your DGH pts" value={String(me?.dghPoints ?? "—")} onHero />
          <Metric label="Managers" value={String(rows.length)} onHero />
        </View>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 10, marginTop: 12 }}>
          DGH = raw live points − transfer hits − Bench Boost bench points − Triple Captain extra. Wildcard/Free Hit managers are DQ and ranked below the GW relegation spot.
        </Text>
      </Hero>

      {/* Feature: "Left to play" — a squad-row indicator on your own live squad,
          reusing the same fixtures + live minutes data as the table below. */}
      <Pressable onPress={() => setSquadExpanded((v) => !v)}>
        <Surface>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 13 }}>My live squad — left to play</Text>
            <Text style={{ color: theme.primary, fontWeight: "800", fontSize: 11 }}>{squadExpanded ? "HIDE ▲" : "SHOW ▼"}</Text>
          </View>
          {statusCounts ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
              <Text style={{ color: theme.muted, fontSize: 11 }}>🟢 Playing {statusCounts.live}</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>⏳ Not started {statusCounts.not_started}</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>🔴 Subbed off {statusCounts.subbed_off}</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>⚪ Finished {statusCounts.finished + statusCounts.no_fixture}</Text>
            </View>
          ) : null}
          {squadExpanded ? (
            <View style={{ marginTop: 10 }}>
              {mySquadWithStatus.map(({ pick, status }) => (
                <View key={pick.playerId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <PlayingStatusBadge status={status} compact />
                    <Text style={{ color: pick.isBench ? theme.muted : theme.foreground, fontWeight: pick.isBench ? "500" : "700", fontSize: 12, marginLeft: 8 }} numberOfLines={1}>
                      {pick.player.webName}{pick.isCaptain ? " (C)" : pick.isViceCaptain ? " (VC)" : ""}
                    </Text>
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>{pick.isBench ? `BENCH ${pick.benchOrder}` : "XI"} · {pick.livePoints * pick.multiplier} pts</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Surface>
      </Pressable>

      <DefConTracker rows={mySquadWithStatus.map(({pick}) => {
        const live = data.liveResponse?.elements.find(e => e.id === pick.playerId)?.stats;
        const fixture = data.fixtures.find(f => f.event === data.gameweek && (f.team_h === pick.player.teamId || f.team_a === pick.player.teamId));
        return { player: pick.player, value: live?.defensive_contribution ?? null, homeAway: fixture ? (fixture.team_h === pick.player.teamId ? "HOME" : "AWAY") : "—", source: live?.defensive_contribution != null ? "OFFICIAL" : "UNAVAILABLE" };
      })} />

      {/* View toggle: DGH table vs. fixture-by-fixture with rivals' picks. */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
        {(["table", "fixtures"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            style={{ flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: view === v ? theme.primary : theme.surface, borderWidth: 1, borderColor: view === v ? theme.primary : theme.border, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: view === v ? theme.background : theme.foreground, fontWeight: "900", fontSize: 11 }}>
              {v === "table" ? "DGH TABLE" : "BY FIXTURE"}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === "table" ? (
        <Surface style={{ marginTop: 4 }}>
          <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 13 }}>GW{data.gameweek} DGH live table</Text>
          <Text style={{ color: theme.muted, fontSize: 10, marginTop: 3 }}>
            Leader: {leader?.player_name ?? "—"} · {leader?.dghPoints ?? 0} pts · Relegation: {relegated?.player_name ?? "—"}
          </Text>
        </Surface>
      ) : null}
    </Page>
  );

  if (view === "fixtures") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <FlatList
          data={fixturesView}
          keyExtractor={(item) => String(item.fixture.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} />}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyBlock icon="football-outline" title="No fixtures" message="No fixtures found for this gameweek yet." />}
          renderItem={({ item }) => {
            const homePicks = item.picks.filter((p) => p.side === "home");
            const awayPicks = item.picks.filter((p) => p.side === "away");
            const live = item.fixture.started && !item.fixture.finished;
            return (
              <Surface style={{ marginHorizontal: 18 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 14 }}>
                    {item.homeTeam?.short_name ?? "?"} <Text style={{ color: theme.muted }}>vs</Text> {item.awayTeam?.short_name ?? "?"}
                  </Text>
                  <Pill label={fixtureScoreLabel(item.fixture)} tone={live ? "success" : item.fixture.finished ? "neutral" : "primary"} />
                </View>
                {item.picks.length === 0 ? (
                  <Text style={{ color: theme.muted, fontSize: 11, marginTop: 8 }}>No DGH mini-league picks in this fixture.</Text>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    {[...homePicks, ...awayPicks].map((p) => (
                      <View key={`${p.entryId}-${p.playerId}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: 1, borderTopColor: theme.border }}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <PlayingStatusBadge status={p.status} compact />
                          <Text style={{ color: p.isMe ? theme.primary : theme.foreground, fontWeight: p.isMe ? "900" : "700", fontSize: 12, marginLeft: 8 }} numberOfLines={1}>
                            {p.managerLabel} <Text style={{ color: theme.muted, fontWeight: "400" }}>has</Text> {p.playerName}{p.isCaptain ? "(C)" : p.isViceCaptain ? "(VC)" : ""}
                          </Text>
                        </View>
                        <Text style={{ color: theme.muted, fontSize: 9 }}>{p.side === "home" ? item.homeTeam?.short_name : item.awayTeam?.short_name}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Surface>
            );
          }}
          contentContainerStyle={{ paddingBottom: 30 }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.entry)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} />}
        ListEmptyComponent={<EmptyBlock icon="trophy-outline" title="No managers to show" message="The mini-league standings haven't loaded any managers yet. Pull to refresh." />}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const isMe = item.entry === data.myRow?.entry;
          const tone = item.disqualified ? theme.error : isMe ? theme.primary : theme.foreground;
          return (
            <Link href={`/rival/${item.entry}` as any} asChild>
              <Pressable style={{ marginHorizontal: 18, marginBottom: 8, borderRadius: 15, borderWidth: 1, borderColor: item.disqualified ? theme.error : isMe ? theme.primary : theme.border, backgroundColor: theme.surface, padding: 13, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: item.disqualified ? theme.error : isMe ? theme.primary : theme.surfaceAlt, alignItems: "center", justifyContent: "center", marginRight: 11 }}>
                  <Text style={{ color: item.disqualified || isMe ? theme.background : theme.foreground, fontWeight: "900", fontSize: 13 }}>{item.liveRank ? `#${item.liveRank}` : "DQ"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{item.player_name}{isMe ? " · YOU" : ""}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{item.entry_name} · season {item.total} pts</Text>
                  <Text style={{ color: item.disqualified ? theme.error : item.entry === relegated?.entry ? theme.error : theme.muted, fontSize: 9, marginTop: 3, fontWeight: item.entry === relegated?.entry ? "800" : "400" }} numberOfLines={1}>
                    {item.disqualified ? `${item.chip === "wildcard" ? "WILDCARD" : "FREE HIT"} · DQ BELOW RELEGATION` : item.entry === relegated?.entry ? `Relegated · Raw ${item.live?.rawPoints ?? "—"} − Hits ${item.live?.transferHits ?? 0} − BB ${item.live?.bbBenchPoints ?? 0} − TC ${item.live?.tcExtraPoints ?? 0}` : item.live ? `Raw ${item.live.rawPoints} (bonus +${item.live.bonusPoints}) − Hits ${item.live.transferHits} − BB ${item.live.bbBenchPoints} − TC ${item.live.tcExtraPoints}` : `Live squad unavailable · DGH ledger ${data.dghTable.managers.find(m => m.entryId === item.entry)?.gwRows.find(g => g.event === data.gameweek)?.gwAdjusted ?? 0}`}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", minWidth: 55 }}>
                  <Text style={{ color: tone, fontWeight: "900", fontSize: 20 }}>{item.dghPoints}</Text>
                  <Text style={{ color: theme.muted, fontSize: 9 }}>DGH PTS</Text>
                </View>
              </Pressable>
            </Link>
          );
        }}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}
