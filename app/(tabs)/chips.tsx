import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { CHIP_LABELS, type ChipName } from "../../lib/analytics/chips";
import { nextDgwAndBgw, describeGwFixtureLoad } from "../../lib/analytics/dgwIntel";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../../components/StatusStates";
import { Page, Header, Surface, Hero, Metric, Pill, Section } from "../../components/Premium";

type ChipPlanView = { chip: string; chipName: ChipName; gw: number; score: number; available: boolean; reasoning: string[] };

export default function ChipsScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };

  // DGW/BGW-aware chip timing plan, computed once in dataService.ts from the
  // same official fixtures + verified squad the rest of war room data uses —
  // includes the Wildcard-before-Bench-Boost sequencing bonus, so this screen
  // no longer re-derives its own naive per-event scan.
  const plans: ChipPlanView[] = useMemo(() => {
    if (!data) return [];
    return data.chipTiming.recommendations.map((rec) => ({
      chip: CHIP_LABELS[rec.chip],
      chipName: rec.chip,
      gw: rec.bestGw ?? data.gameweek,
      score: rec.window?.expectedGain ?? 0,
      available: rec.available,
      reasoning: rec.reasoning,
    }));
  }, [data]);

  const dgwRadar = useMemo(() => {
    if (!data) return null;
    const teamById = new Map(data.bootstrap.teams.map((t) => [t.id, { short_name: t.short_name }]));
    const { nextDgw, nextBgw } = nextDgwAndBgw(data.chipTiming.scan);
    return {
      nextDgwLine: nextDgw ? describeGwFixtureLoad(nextDgw, teamById) : "No double gameweek confirmed yet in the scanned fixture window.",
      nextBgwLine: nextBgw && nextBgw.event !== nextDgw?.event ? describeGwFixtureLoad(nextBgw, teamById) : null,
      likely: data.chipTiming.scan.likelyFutureDgws,
    };
  }, [data]);

  if (isLoading) return <LoadingShell label="Building chip planner from official FPL fixtures…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Chip planner unavailable")} onRetry={() => refetch()} />;

  const topPlan = [...plans].filter((p) => p.available && p.score > 0).sort((a, b) => b.score - a.score)[0];
  const available = plans.filter((p) => p.available && p.score > 0).length;

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header eyebrow="CHIP INTELLIGENCE" title="Chip Planner" subtitle="Only chips still available in the current FPL half are actionable" />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Hero variant="navy">
        <Pill label="BEST WINDOW" tone="onHero" />
        <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 10 }}>{topPlan ? `${topPlan.chip} in GW${topPlan.gw}` : "No strong chip window yet"}</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>{topPlan ? `Expected gain +${topPlan.score.toFixed(1)} vs normal XI` : "Keep monitoring fixtures for a window"}</Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
          <Metric label="Chips tracked" value={String(plans.length)} onHero />
          <Metric label="Available" value={String(available)} onHero />
          <Metric label="Best gain" value={topPlan ? `+${topPlan.score.toFixed(1)}` : "—"} onHero />
        </View>
      </Hero>

      <Section title="DGW radar" />
      <Surface>
        <Text style={{ color: theme.foreground, fontSize: 12, lineHeight: 18 }}>{dgwRadar?.nextDgwLine}</Text>
        {dgwRadar?.nextBgwLine ? <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{dgwRadar.nextBgwLine}</Text> : null}
        {dgwRadar?.likely.length ? (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: theme.warning, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>UNCONFIRMED SIGNALS</Text>
            {dgwRadar.likely.map((l) => (
              <Text key={l.event} style={{ color: theme.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }}>GW{l.event}: {l.reason}</Text>
            ))}
          </View>
        ) : null}
      </Surface>

      <Section title="Chip windows" />
      {plans.map((p) => (
        <Surface key={p.chip}>
          <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>{p.chip.toUpperCase()}</Text>
          <Text style={{ color: theme.foreground, fontSize: 24, fontWeight: "900", marginTop: 5 }}>GW{p.gw}</Text>
          {p.reasoning.map((line, i) => (
            <Text key={i} style={{ color: theme.muted, fontSize: 12, marginTop: i === 0 ? 5 : 3, lineHeight: 17 }}>{line}</Text>
          ))}
          {p.available ? <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "700", marginTop: 9 }}>Expected gain vs normal XI {p.score.toFixed(1)}</Text> : null}
        </Surface>
      ))}

      <Surface style={{ backgroundColor: theme.surfaceAlt }}>
        <Text style={{ color: theme.foreground, fontWeight: "800" }}>Important</Text>
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          Double Gameweeks and blanks can only be detected from fixtures currently exposed by the official API. Re-check after fixture updates before committing a chip.
        </Text>
      </Surface>
    </Page>
  );
}
