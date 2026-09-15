import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { useWatchlist } from "../../hooks/useWatchlist";
import { useFilters } from "../../hooks/useFilters";
import { Badge } from "../../components/Badge";
import { WatchlistStar } from "../../components/WatchlistStar";
import { FilterBar } from "../../components/FilterBar";
import { EmptyBlock, ErrorBlock, FreshnessBanner, LoadingShell } from "../../components/StatusStates";
import type { OwnershipRow } from "../../lib/analytics/ownership";
import { loadEliteManagers } from "../../lib/eliteManagerService";
import { buildEliteTemplate, buildEliteGaps, buildEliteChipTrends, type EliteTemplateRow } from "../../lib/analytics/eliteManager";
import { CHIP_LABELS, type ChipName } from "../../lib/analytics/chips";
import { Page, Header, Surface, Hero, Metric, Pill, Section } from "../../components/Premium";

const LABEL_COLOR: Record<OwnershipRow["label"], (theme: any) => string> = {
  SHIELD: (t) => t.primary,
  THREAT: (t) => t.error,
  DIFFERENTIAL: (t) => t.accent,
  TEMPLATE: (t) => t.muted,
  TRAP: (t) => t.warning,
  NEUTRAL: (t) => t.muted,
};

export default function OwnershipScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [filter, setFilter] = useState<OwnershipRow["label"] | "ALL">("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const { filters, patchFilters, resetFilters, isActive, apply, savedFilters, applyPreset, savePreset, removePreset } = useFilters();
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };
  const { isStarred, toggle } = useWatchlist();

  // On-demand only: loadEliteManagers pulls ~50 extra official /entry/{id}/picks/
  // requests (see lib/eliteManagerService.ts), so it must never run as part of
  // the automatic war-room load — only when the manager explicitly asks for it.
  const [eliteState, setEliteState] = useState<{
    status: "idle" | "loading" | "error" | "ready";
    error?: string;
    sampleSize?: number;
    blockers?: EliteTemplateRow[];
    myDifferentials?: EliteTemplateRow[];
    chipTrends?: { chip: string; count: number; pct: number }[];
  }>({ status: "idle" });

  const loadEliteComparison = async () => {
    if (!data) return;
    setEliteState({ status: "loading" });
    try {
      const { elites } = await loadEliteManagers(data.gameweek, data.playerIndex, 50, false, null);
      const { rows: templateRows, sampleSize } = buildEliteTemplate(elites, data.playerIndex, data.mySquad);
      const { blockers, myDifferentials } = buildEliteGaps(templateRows);
      const chipTrends = buildEliteChipTrends(elites);
      setEliteState({ status: "ready", sampleSize, blockers, myDifferentials, chipTrends });
    } catch (e) {
      setEliteState({ status: "error", error: e instanceof Error ? e.message : "Could not load the elite manager sample." });
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.ownership;
    if (filter !== "ALL") list = list.filter((r) => r.label === filter);
    const allowedIds = new Set(apply(list.map((r) => r.player)).map((p) => p.id));
    return list.filter((r) => allowedIds.has(r.player.id));
  }, [data, filter, apply]);

  if (isLoading) return <LoadingShell label="Building ownership heatmap…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;

  const labelFilters: (OwnershipRow["label"] | "ALL")[] = ["ALL", "DIFFERENTIAL", "SHIELD", "THREAT", "TEMPLATE", "TRAP"];
  const shieldCount = data.ownership.filter((r) => r.label === "SHIELD").length;
  const threatCount = data.ownership.filter((r) => r.label === "THREAT").length;
  const diffCount = data.ownership.filter((r) => r.label === "DIFFERENTIAL").length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.playerId)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void doRefresh()} tintColor={theme.primary} colors={[theme.primary]} />}
        ListEmptyComponent={
          <EmptyBlock
            icon="filter-outline"
            title="No players match"
            message={isActive ? `Nothing matches your current filters in ${filter === "ALL" ? "any category" : filter.toLowerCase()}. Try clearing a filter.` : `No players are currently flagged ${filter === "ALL" ? "" : `as ${filter.toLowerCase()}`}.`}
          />
        }
        ListHeaderComponent={
          <Page scroll={false}>
            <Header eyebrow="OWNERSHIP" title="Ownership Heatmap" subtitle={`${data.ownership.length} players tracked league-wide`} />
            <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />
            <Hero variant="navy">
              <Pill label="LEAGUE HEATMAP" tone="onHero" />
              <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 10 }}>{shieldCount + threatCount + diffCount} flagged players</Text>
              <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
                <Metric label="Shields" value={String(shieldCount)} onHero />
                <Metric label="Threats" value={String(threatCount)} onHero />
                <Metric label="Differentials" value={String(diffCount)} onHero />
              </View>
            </Hero>
            <FilterBar
              filters={filters}
              onChange={patchFilters}
              onReset={resetFilters}
              isActive={isActive}
              teams={data.bootstrap.teams}
              savedFilters={savedFilters}
              onApplyPreset={applyPreset}
              onSavePreset={savePreset}
              onDeletePreset={removePreset}
              resultLabel={`${rows.length} of ${data.ownership.length}`}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {labelFilters.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={{ backgroundColor: filter === f ? theme.primary : theme.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}
                >
                  <Text style={{ color: filter === f ? "#04140D" : theme.foreground, fontWeight: "700", fontSize: 12 }}>{f}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Section title="Elite manager template" />
            <Surface>
              {eliteState.status === "idle" ? (
                <>
                  <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
                    Compare your squad against the top 50 managers in the official global Overall league — what they template, what they fade, and where your differentials actually diverge from the elite. Pulls ~50 extra official requests, so this is on demand only.
                  </Text>
                  <Pressable onPress={() => void loadEliteComparison()} style={{ minHeight: 44, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#04140D", fontWeight: "900", fontSize: 12 }}>COMPARE VS TOP 50 OVERALL</Text>
                  </Pressable>
                </>
              ) : eliteState.status === "loading" ? (
                <Text style={{ color: theme.muted, fontSize: 12 }}>Fetching the top 50 Overall managers&apos; squads…</Text>
              ) : eliteState.status === "error" ? (
                <>
                  <Text style={{ color: theme.error, fontSize: 12, marginBottom: 10 }}>{eliteState.error}</Text>
                  <Pressable onPress={() => void loadEliteComparison()} style={{ minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }}>RETRY</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{ color: theme.muted, fontSize: 10, marginBottom: 10 }}>Sampled from {eliteState.sampleSize} official Overall-league managers.</Text>

                  <Text style={{ color: theme.error, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 }}>ELITE TEMPLATE YOU&apos;RE MISSING</Text>
                  {eliteState.blockers?.length ? eliteState.blockers.map((r) => (
                    <View key={r.playerId} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
                      <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "700" }}>{r.webName}</Text>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>{r.eliteOwnershipPct}% of elites · {r.captainPct}% captained</Text>
                    </View>
                  )) : <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 4 }}>None — you already hold every heavily-templated elite pick.</Text>}

                  <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 }}>YOUR PICKS ELITES ARE FADING</Text>
                  {eliteState.myDifferentials?.length ? eliteState.myDifferentials.map((r) => (
                    <View key={r.playerId} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
                      <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "700" }}>{r.webName}</Text>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>{r.eliteOwnershipPct}% of elites · {r.overallOwnershipPct}% FPL-wide</Text>
                    </View>
                  )) : <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 4 }}>None of your low-owned picks are also low-owned among elites right now.</Text>}

                  {eliteState.chipTrends?.length ? (
                    <>
                      <Text style={{ color: theme.warning, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 }}>ELITE CHIP USAGE THIS GW</Text>
                      {eliteState.chipTrends.map((t) => (
                        <View key={t.chip} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
                          <Text style={{ color: theme.foreground, fontSize: 12 }}>{CHIP_LABELS[t.chip as ChipName] ?? t.chip}</Text>
                          <Text style={{ color: theme.muted, fontSize: 11 }}>{t.count} managers ({t.pct}%)</Text>
                        </View>
                      ))}
                    </>
                  ) : null}

                  <Pressable onPress={() => void loadEliteComparison()} style={{ minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", marginTop: 14 }}>
                    <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 12 }}>REFRESH</Text>
                  </Pressable>
                </>
              )}
            </Surface>
          </Page>
        }
        renderItem={({ item }) => (
          <View style={{ marginHorizontal: 18, marginBottom: 8 }}>
            <Surface style={{ marginBottom: 0 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.foreground, fontWeight: "700" }}>{item.player.webName}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Badge label={item.label} color={LABEL_COLOR[item.label](theme)} />
                  <WatchlistStar starred={isStarred(item.playerId)} onPress={() => toggle(item.playerId)} size={16} />
                </View>
              </View>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
                On my team: {item.onMyTeam ? "YES" : "no"} · Rival owners: {item.rivalOwners.length} ({item.rivalOwnershipPct}%) · League-wide FPL ownership: {item.overallOwnershipPct}%
              </Text>
            </Surface>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}
