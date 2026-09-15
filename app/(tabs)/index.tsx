import { useEffect, useState } from "react";
import { InteractionManager, Pressable, ScrollView, View, Text } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { buildWarRoomRecommendation } from "../../lib/analytics/warRoom";
import { assessDominance } from "../../lib/analytics/dominance";
import { buildOwnershipMap } from "../../lib/analytics/ownership";
import { buildTeamMetrics, evaluatePerformanceGates, playerDghMetrics, type DghPlayerMetrics, type PerformanceAudit } from "../../lib/analytics/dghMetrics";
import { getAllDghLedgerRows } from "../../lib/seasonStore";
import { projectHorizon } from "../../lib/analytics/horizon";
import { getDeadlineCountdown } from "../../lib/analytics/deadline";
import { LEAGUE_ID } from "../../lib/config";
import { ErrorBlock, FreshnessBanner } from "../../components/StatusStates";
import { Page, Header, Surface, Hero, HeroInset, Metric, Section, Pill, IconButton, Row, Shortcut } from "../../components/Premium";

export default function WarRoomScreen() {
  const { theme } = useTheme();
  const { data, isError, error, refresh, fullUpdate, refetch } = useWarRoomData();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [performanceAudit, setPerformanceAudit] = useState<PerformanceAudit | null>(null);
  const [rec, setRec] = useState<ReturnType<typeof buildWarRoomRecommendation> | null>(null);
  const [dominance, setDominance] = useState<ReturnType<typeof assessDominance> | null>(null);
  const [horizon, setHorizon] = useState<ReturnType<typeof projectHorizon>>([]);
  const [dghMetrics, setDghMetrics] = useState<ReturnType<typeof buildTeamMetrics> | null>(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!data) return; const id = setInterval(() => void refresh(), 300000); return () => clearInterval(id); }, [data, refresh]);
  // Heavy recommendation/metrics work is deliberately scheduled after React
  // interactions. Network completion must not immediately monopolize the JS
  // thread and delay the first interactive frame of the War Room.
  useEffect(() => {
    if (!data) {
      setRec(null);
      setDominance(null);
      setHorizon([]);
      setDghMetrics(null);
      return;
    }
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!alive) return;
      const nextRec = buildWarRoomRecommendation({
        squad: data.mySquad,
        pool: data.playerPool,
        rivals: data.rivals,
        bank: data.bank,
        freeTransfers: data.freeTransfers,
        myRank: data.myRow?.dghRank ?? data.myRow?.rank ?? 999,
        myTotal: data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0,
        standingsTotals: data.standings.map(s => s.dghTotalPoints ?? s.total),
        gameweeksRemaining: Math.max(1, 38 - data.gameweek),
      });
      const nextDominance = assessDominance({
        myRank: data.myRow?.dghRank ?? data.myRow?.rank ?? 999,
        myTotal: data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0,
        standingsTotals: data.standings.map(s => s.dghTotalPoints ?? s.total),
        rivals: data.rivals,
        recommendation: nextRec,
      });
      const nextHorizon = projectHorizon(data.mySquad, data.fixtureRuns);
      const ownership = buildOwnershipMap(data.myRow?.id ?? 0, data.mySquad, data.rivals, data.playerPool);
      const miniOwn = new Map(ownership.map(o => [o.playerId, o.rivalOwnershipPct]));
      const metrics = new Map<number, DghPlayerMetrics>();
      for (const player of data.playerPool) {
        metrics.set(player.id, playerDghMetrics(player, {
          runsByTeam: new Map(data.fixtureRuns.map(r => [r.teamId, r])),
          miniOwnershipPct: miniOwn.get(player.id) ?? player.ownershipPct,
        }));
      }
      const nextDghMetrics = buildTeamMetrics({
        squad: data.mySquad,
        rivals: data.rivals,
        playerMetrics: metrics,
        currentPoints: data.myRow?.dghGwPoints ?? data.myRow?.event_total ?? 0,
        remainingPlayers: data.mySquad.filter(p => p.isXI && p.liveMinutes == null).length,
        avgExpected: data.mySquad.filter(p => p.isXI).reduce((sum, player) => sum + player.player.epNext, 0) / Math.max(1, data.mySquad.filter(p => p.isXI).length),
      });
      if (!alive) return;
      setRec(nextRec);
      setDominance(nextDominance);
      setHorizon(nextHorizon);
      setDghMetrics(nextDghMetrics);
    });
    return () => {
      alive = false;
      task.cancel();
    };
  }, [data]);

  useEffect(() => {
    if (!data) { setPerformanceAudit(null); return; }
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void getAllDghLedgerRows().then(rows => {
        if (alive && data.myRow?.id) setPerformanceAudit(evaluatePerformanceGates(rows, data.myRow.id, data.transferTes.map(t => t.tes)));
      }).catch(() => {});
    });
    return () => { alive = false; task.cancel(); };
  }, [data]);
  if (isError && !data) return <ErrorBlock message={String((error as Error)?.message ?? "FPL data unavailable")} onRetry={() => refetch()} />;
  if (!data) {
    return (
      <Page>
        <Header
          eyebrow="DGH WAR ROOM"
          title="Your game plan"
          subtitle="The app is ready. FPL data is loading in the background — you can navigate immediately."
          right={<IconButton icon="refresh" label="Retry data" onPress={() => void refetch()} />}
        />
        <Surface accent>
          <Text style={{ color: theme.foreground, fontSize: 15, fontWeight: "900" }}>READY TO PLAY</Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
            Cached data will appear first when available. Fresh FPL data, rival squads and DGH intelligence continue loading without blocking the interface.
          </Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.surfaceAlt, overflow: "hidden", marginTop: 14 }}>
            <View style={{ width: "42%", height: 8, borderRadius: 4, backgroundColor: theme.primary }} />
          </View>
        </Surface>
        <Section title="Shortcuts" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingRight: 6, paddingBottom: 6 }}>
          <Shortcut icon="shirt" label="Squad" color={theme.primary} onPress={() => router.push("/(tabs)/squad")} />
          <Shortcut icon="swap-horizontal" label="Transfers" color={theme.accent} onPress={() => router.push("/(tabs)/transfers")} />
          <Shortcut icon="calendar" label="Fixtures" color={theme.warning} onPress={() => router.push("/(tabs)/fixtures")} />
          <Shortcut icon="trophy" label="League" color="#D9A441" onPress={() => router.push("/(tabs)/league")} />
          <Shortcut icon="flash" label="Chips" color={theme.error} onPress={() => router.push("/(tabs)/chips")} />
          <Shortcut icon="pie-chart" label="Ownership" color={theme.success} onPress={() => router.push("/(tabs)/ownership")} />
        </ScrollView>
        <Section title="DGH War Room" />
        <Surface>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>Loading your last-known-good FPL snapshot and refreshing official data in the background…</Text>
        </Surface>
      </Page>
    );
  }
  const deadline = data.currentGwLocked ? data.planningDeadline : data.deadline;
  const moveText = rec?.bestScenario.moves.length ? rec.bestScenario.moves.map(m => `${m.out.webName} → ${m.in.webName}`).join(" · ") : "Roll your transfer";

  return (
    <Page refreshing={busy} onRefresh={() => { setBusy(true); void refresh().finally(() => setBusy(false)); }}>
      <Header
        eyebrow={`GW${data.planningGameweek} · DGH WAR ROOM`}
        title="Your game plan"
        subtitle={`League ${LEAGUE_ID} · ${data.rivals.length} rivals · ${data.enrichmentComplete ? "official FPL data" : "core data ready · rival intelligence syncing"}`}
        right={<IconButton icon="refresh" label="Refresh data" onPress={async () => { setBusy(true); await refresh(); setBusy(false); }} />}
      />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Hero variant="green">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Pill label={data.transfersActionable ? "ACTION WINDOW" : "DEADLINE PASSED"} tone="onHero" />
            <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900", marginTop: 10 }}>{getDeadlineCountdown(deadline, now)}</Text>
            <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 2 }}>{data.currentGwLocked ? `Next deadline · GW${data.planningGameweek}` : "Deadline countdown · refreshes automatically"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "800" }}>DGH SCORE</Text>
            <Text style={{ color: "#FFFFFF", fontSize: 32, fontWeight: "900", marginTop: 3 }}>{dominance?.score ?? "—"}</Text>
          </View>
        </View>
        {dominance ? (
          <HeroInset style={{ marginTop: 14 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 13, lineHeight: 19 }}>
              {dominance.mode} posture · target <Text style={{ fontWeight: "900" }}>{dominance.target.replace(/_/g, " ")}</Text>.
            </Text>
          </HeroInset>
        ) : null}
      </Hero>

      <Section title="Shortcuts" action={<Pressable onPress={() => router.push("/(tabs)/more")}><Text style={{ color: theme.primary, fontSize: 11, fontWeight: "800" }}>Manage</Text></Pressable>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingRight: 6, paddingBottom: 6 }} style={{ marginBottom: 2 }}>
        <Shortcut icon="shirt" label="Squad" color={theme.primary} onPress={() => router.push("/(tabs)/squad")} />
        <Shortcut icon="swap-horizontal" label="Transfers" color={theme.accent} onPress={() => router.push("/(tabs)/transfers")} />
        <Shortcut icon="calendar" label="Fixtures" color={theme.warning} onPress={() => router.push("/(tabs)/fixtures")} />
        <Shortcut icon="trophy" label="League" color="#D9A441" onPress={() => router.push("/(tabs)/league")} />
        <Shortcut icon="flash" label="Chips" color={theme.error} onPress={() => router.push("/(tabs)/chips")} />
        <Shortcut icon="pie-chart" label="Ownership" color={theme.success} onPress={() => router.push("/(tabs)/ownership")} />
        <Shortcut icon="flask" label="What-If" color="#8E5CD9" onPress={() => router.push("/(tabs)/whatif")} />
        <Shortcut icon="stats-chart" label="Forecast" color="#2E9E8C" onPress={() => router.push("/(tabs)/forecast")} />
      </ScrollView>

      <Section title="Your position" />
      <Surface>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Metric label="League rank" value={`#${data.myRow?.dghRank ?? data.myRow?.rank ?? "—"}`} large />
          <Metric label="GW points" value={String(data.myRow?.dghGwPoints ?? data.myRow?.event_total ?? "—")} detail={`Total ${data.myRow?.dghTotalPoints ?? data.myRow?.total ?? "—"}`} />
          <Metric label="Bank" value={`£${data.bank.toFixed(1)}m`} detail={`${data.freeTransfers} FT`} />
        </View>
      </Surface>

      {dghMetrics ? (
        <>
          <Section title="DGH Metrics Engine" action={<Pill label={dghMetrics.strategyState} tone={dghMetrics.strategyState === "DOMINATING" ? "success" : dghMetrics.strategyState === "DISTRESSED" ? "danger" : "warning"} />} />
          <Surface>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Metric label="HSFI" value={dghMetrics.avgHsfi.toFixed(1)} detail="team avg" />
              <Metric label="WCS" value={dghMetrics.avgWcs.toFixed(1)} detail="GW ceiling" />
              <Metric label="MDI" value={dghMetrics.avgMdi.toFixed(2)} detail="dominance" />
              <Metric label="DTQ" value={dghMetrics.avgDtq.toFixed(1)} detail="differential" />
              <Metric label="WCPS" value={dghMetrics.avgWcps.toFixed(1)} detail="captain power" />
              <Metric label="Swing" value={dghMetrics.swingPotential.toFixed(1)} detail={dghMetrics.swingPotential >= 22 ? "ELITE" : dghMetrics.swingPotential >= 15 ? "TARGET" : "TOO LOW"} />
              <Metric label="Template" value={`${dghMetrics.templateCoveragePct.toFixed(0)}%`} detail="XI coverage" />
              <Metric label="Mini-League EV" value={dghMetrics.miniLeagueEv.toFixed(0)} detail={dghMetrics.miniLeagueEv >= 500 ? "ELITE" : dghMetrics.miniLeagueEv >= 200 ? "CONTENDING" : "REFORM"} />
              <Metric label="VBM" value={dghMetrics.vbmPct == null ? "—" : `${dghMetrics.vbmPct.toFixed(0)}%`} detail="25–40% target" />
              <Metric label="LDI" value={dghMetrics.ldi.toFixed(1)} detail="live differential" />
              <Metric label="PPS" value={dghMetrics.pps.toFixed(1)} detail="podium trajectory" />
            </View>
            <Row label="Strategy posture" value={dghMetrics.posture} emphasis />
            <Row label="DGH captain" value={dghMetrics.bestCaptain ? `${dghMetrics.bestCaptain.webName} · WCPS ${dghMetrics.bestCaptain.wcps.toFixed(1)}` : "—"} emphasis />
            <Row label="Vice-captain" value={dghMetrics.viceCaptain ? `${dghMetrics.viceCaptain.webName} · WCPS ${dghMetrics.viceCaptain.wcps.toFixed(1)}` : "—"} />
            <Text style={{ color: theme.muted, fontSize: 10, marginTop: 8 }}>HSFI/WCS use the app&apos;s available FPL data; per-GW haul/xGI-volatility inputs are estimated until player history is loaded.</Text>
          </Surface>
        </>
      ) : null}

      {performanceAudit && performanceAudit.sampleGws >= 1 ? (
        <>
          <Section title="10-GW Performance Audit" action={<Pill label={performanceAudit.status} tone={performanceAudit.status === "RESET" ? "danger" : performanceAudit.status === "CONTINUE" ? "success" : "warning"} />} />
          <Surface>
            {performanceAudit.gates.map(g => (
              <Row key={g.key} label={g.label} value={g.value == null ? "PENDING" : g.key === "GW_WIN_RATE" || g.key === "TOP3_RATE" || g.key === "POSITIVE_TES" ? `${(g.value * 100).toFixed(0)}%` : g.value.toFixed(1)} />
            ))}
            {performanceAudit.wildcardReset ? <Text style={{ color: theme.error, fontWeight: "900", marginTop: 8 }}>3+ gates failed — WILDCARD / FULL STRATEGY RESET TRIGGERED</Text> : null}
          </Surface>
        </>
      ) : null}

      {rec ? (
        <>
          <Section title="Recommended move" action={<Pill label={rec.risk} tone={rec.risk === "LOW" ? "success" : rec.risk === "MEDIUM" ? "warning" : "danger"} />} />
          <Hero variant="navy">
            <Text style={{ color: "#FFFFFF", fontSize: 19, fontWeight: "900" }}>{moveText}</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 14 }}>
              <Metric label="Net gain" value={`${rec.bestScenario.netGain >= 0 ? "+" : ""}${rec.bestScenario.netGain.toFixed(1)}`} onHero />
              <Metric label="Expected uplift" value={`+${rec.bestScenario.projectedGwPointsGain.toFixed(1)}`} onHero />
              <Metric label="Top 3" value={`${rec.top3ProbabilityPct}%`} onHero />
            </View>
            <Pressable onPress={() => router.push("/(tabs)/transfers")} style={{ marginTop: 16, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.96)", minHeight: 48, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#123A73", fontWeight: "900" }}>VIEW STRATEGY PLAN</Text>
            </Pressable>
          </Hero>
          <Surface>
            <Row label="Captain" value={rec.xi.captain?.pick.player.webName ?? "—"} emphasis />
            <Row label="Formation" value={rec.xi.formation} />
            <Row label="Hit" value={rec.bestScenario.hits ? `-${rec.bestScenario.hitCost} pts` : "No hit"} />
          </Surface>
        </>
      ) : null}

      <Section title="At a glance" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable onPress={() => router.push("/(tabs)/league")} style={{ flex: 1 }}><Surface><Metric label="Your rank" value={`#${data.myRow?.dghRank ?? data.myRow?.rank ?? "—"}`} detail="Open league" /></Surface></Pressable>
        <Pressable onPress={() => router.push("/(tabs)/squad")} style={{ flex: 1 }}><Surface><Metric label="Team value" value={`£${data.teamValue.toFixed(1)}m`} detail="Open squad" /></Surface></Pressable>
      </View>

      {horizon.length ? (
        <Surface>
          <Text style={{ color: theme.foreground, fontWeight: "900", marginBottom: 10 }}>Next 3 GWs</Text>
          <View style={{ flexDirection: "row" }}>
            {horizon.slice(0, 3).map(h => (
              <View key={h.horizon} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: theme.muted, fontSize: 10 }}>{h.horizon === 1 ? "NEXT" : `GW +${h.horizon - 1}`}</Text>
                <Text style={{ color: theme.primary, fontSize: 18, fontWeight: "900", marginTop: 3 }}>{h.fixtureAdjusted.toFixed(1)}</Text>
                <Text style={{ color: theme.muted, fontSize: 9 }}>proj.</Text>
              </View>
            ))}
          </View>
        </Surface>
      ) : null}

      {!data.enrichmentComplete ? (
        <Surface style={{ borderColor: theme.primary }}>
          <Text style={{ color: theme.primary, fontWeight: "900" }}>Rival intelligence updating</Text>
          <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>Your squad and core league data are ready. The locked mini-league’s rival squads and deeper DGH intelligence are loading in the background.</Text>
        </Surface>
      ) : !data.validation.allPassed ? (
        <Surface style={{ borderColor: theme.warning }}>
          <Text style={{ color: theme.warning, fontWeight: "900" }}>Data needs attention</Text>
          <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>One or more validation checks failed. Review More before acting.</Text>
        </Surface>
      ) : null}

      <Pressable disabled={busy} onPress={async () => { setBusy(true); await fullUpdate(); setBusy(false); }}>
        <Text style={{ color: theme.muted, textAlign: "center", fontSize: 11, padding: 8 }}>{busy ? "UPDATING…" : "FULL DATA RESET · RELOAD"}</Text>
      </Pressable>
    </Page>
  );
}
