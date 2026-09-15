import { useMemo, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { useWatchlist } from "../../hooks/useWatchlist";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../../components/StatusStates";
import { WatchlistStar } from "../../components/WatchlistStar";
import { Page, Header, Surface, Hero, Metric, Section, Pill } from "../../components/Premium";

/**
 * DGH Spy — the intelligence feed PORT_NOTES.md flagged as missing
 * everywhere (not in DGH, not in fpl_spy-main): price predictions, news/
 * injury alerts across my squad and rivals' squads, and heuristic rival
 * transfer-pattern predictions for the all DGH mini-league rivals by points gap.
 */
export default function SpyScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };
  const { isStarred, toggle } = useWatchlist();

  const concernCount = useMemo(() => data?.spy.newsAlerts.filter((a) => a.severity === "CONCERN").length ?? 0, [data]);

  if (isLoading) return <LoadingShell label="Gathering intel…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Spy data unavailable")} onRetry={() => refetch()} />;

  const { spy } = data;

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header eyebrow="INTELLIGENCE" title="DGH Spy" subtitle="Price movers, injury/news alerts and rival transfer predictions" />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Hero variant="navy">
        <Pill label={`GW${data.planningGameweek}`} tone="onHero" />
        <View style={{ flexDirection: "row", gap: 14, marginTop: 12 }}>
          <Metric label="Risers" value={String(spy.priceRisers.length)} onHero />
          <Metric label="Fallers" value={String(spy.priceFallers.length)} onHero />
          <Metric label="Concerns" value={String(concernCount)} onHero />
        </View>
      </Hero>

      <Section title="Price movers" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Surface style={{ flex: 1 }}>
          <Text style={{ color: theme.success, fontWeight: "900", fontSize: 12, marginBottom: 6 }}>▲ LIKELY RISERS</Text>
          {spy.priceRisers.length ? spy.priceRisers.slice(0, 8).map((p) => (
            <View key={p.playerId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 12 }}>{p.webName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· {p.teamShort}</Text></Text>
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 1 }}>£{p.currentPrice.toFixed(1)}m · {p.confidencePct}% confidence</Text>
              </View>
              <WatchlistStar starred={isStarred(p.playerId)} onPress={() => toggle(p.playerId)} size={16} />
            </View>
          )) : <Text style={{ color: theme.muted, fontSize: 11 }}>No riser signal this refresh.</Text>}
        </Surface>
        <Surface style={{ flex: 1 }}>
          <Text style={{ color: theme.error, fontWeight: "900", fontSize: 12, marginBottom: 6 }}>▼ LIKELY FALLERS</Text>
          {spy.priceFallers.length ? spy.priceFallers.slice(0, 8).map((p) => (
            <View key={p.playerId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 12 }}>{p.webName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· {p.teamShort}</Text></Text>
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 1 }}>£{p.currentPrice.toFixed(1)}m · {p.confidencePct}% confidence</Text>
              </View>
              <WatchlistStar starred={isStarred(p.playerId)} onPress={() => toggle(p.playerId)} size={16} />
            </View>
          )) : <Text style={{ color: theme.muted, fontSize: 11 }}>No faller signal this refresh.</Text>}
        </Surface>
      </View>
      <Text style={{ color: theme.muted, fontSize: 9, marginTop: 6 }}>Confidence is a relative estimate from net transfer volume this event — FPL doesn&apos;t expose its real threshold, so treat this as directional, not guaranteed.</Text>

      <Section title="News & injury alerts" />
      <Surface>
        {spy.newsAlerts.length ? spy.newsAlerts.slice(0, 12).map((a) => (
          <View key={`${a.playerId}-${a.ownerLabel}`} style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.foreground, fontWeight: "700", fontSize: 12 }}>{a.webName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· {a.teamShort}</Text></Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Pill label={a.severity} tone={a.severity === "CONCERN" ? "danger" : "warning"} />
                <WatchlistStar starred={isStarred(a.playerId)} onPress={() => toggle(a.playerId)} size={16} />
              </View>
            </View>
            <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>{a.text}{a.ageLabel ? ` (${a.ageLabel})` : ""}</Text>
            <Text style={{ color: a.isMine ? theme.primary : theme.muted, fontSize: 9, marginTop: 2, fontWeight: "700" }}>{a.ownerLabel}</Text>
          </View>
        )) : <Text style={{ color: theme.muted, fontSize: 11 }}>No news flagged for your squad or all DGH mini-league rivals right now.</Text>}
      </Surface>

      <Section title="Rival transfer predictions" />
      {spy.rivalPredictions.length ? spy.rivalPredictions.map((r) => (
        <Link key={r.entryId} href={`/rival/${r.entryId}` as any} asChild>
          <Pressable>
            <Surface>
              <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }}>{r.teamName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· {r.managerName}</Text></Text>
              <Text style={{ color: theme.muted, fontSize: 10, marginTop: 4 }}>
                {r.likelyOut.length ? `Likely OUT: ${r.likelyOut.map((c) => c.webName).join(", ")}` : "No urgent transfer-out signal"}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>
                {r.likelyIn.length ? `Likely IN: ${r.likelyIn.map((c) => c.webName).join(", ")}` : "No standout target"}
              </Text>
            </Surface>
          </Pressable>
        </Link>
      )) : <Surface><Text style={{ color: theme.muted, fontSize: 11 }}>Predictions run for every DGH mini-league rival; missing squad or transfer data is retained as an empty signal rather than removing the rival.</Text></Surface>}
    </Page>
  );
}
