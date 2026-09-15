import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { getDghLeagueConfig, type DghLeagueConfig } from "../../lib/seasonStore";
import { syncDghLedger } from "../../lib/dghLedgerService";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../../components/StatusStates";
import { Page, Header, Surface, Hero, Metric, Section, Row } from "../../components/Premium";
import type { ComprehensiveTable } from "../../lib/analytics/comprehensiveTable";

export default function LeagueScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [dghConfig, setDghConfig] = useState<DghLeagueConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"rank" | "gw" | "total">("rank");

  useEffect(() => { void getDghLeagueConfig().then(setDghConfig).catch(() => {}); }, []);

  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };

  if (isLoading) return <LoadingShell label="Building league intelligence…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "League data unavailable")} onRetry={() => refetch()} />;

  // Single authoritative DGH pipeline: data.dghTable is built once in dataService
  // from the full mini-league roster (every manager, never a subset), so League,
  // Rivals, and Live all read the same numbers.
  const table = data.dghTable;

  const sync = async () => {
    setBusy(true);
    try {
      await syncDghLedger(
        [
          ...(data.myRow ? [{ entryId: data.myRow.entry, managerName: data.myRow.player_name, teamName: data.myRow.entry_name }] : []),
          ...data.rivals.map((r) => ({ entryId: r.entryId, managerName: r.managerName, teamName: r.teamName })),
        ],
        data.gameweek,
      );
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page refreshing={refreshing} onRefresh={() => void doRefresh()}>
      <Header eyebrow="DGH CLASSIC" title="League" subtitle={`${data.standings.length} managers · ${data.rivals.filter(r => r.squad).length}/${data.rivals.length} rival squads verified`} />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />
      <Hero variant="green">
        <View style={{ flexDirection: "row", gap: 15 }}>
          <Metric label="Your rank" value={`#${data.myRow?.dghRank ?? data.myRow?.rank ?? "—"}`} large onHero />
          <Metric label="Total" value={String(table.managers.find(m => m.entryId === data.myRow?.entry)?.overallPoints ?? "—")} detail={`GW${data.gameweek} · ${table.managers.find(m => m.entryId === data.myRow?.entry)?.gwRows.find(r => r.event === data.gameweek)?.gwAdjusted ?? "—"} DGH`} onHero />
          <Metric label="Leader gap" value={`${Math.max(0, Math.max(...data.standings.map(s => s.dghTotalPoints ?? s.total), 0) - (data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0))}`} detail="points" onHero />
        </View>
      </Hero>
      {(data.spy.priceRisers.length || data.spy.priceFallers.length) ? (
        <>
          <Section title="Market movers" action={<Link href="/(tabs)/spy" asChild><Pressable><Text style={{ color: theme.primary, fontSize: 10, fontWeight: "800" }}>DGH SPY →</Text></Pressable></Link>} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {data.spy.priceRisers.slice(0, 3).map(p => (
              <View key={p.playerId} style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 11, padding: 9, flex: 1 }}>
                <Text style={{ color: theme.success, fontWeight: "800", fontSize: 11 }}>▲ {p.webName}</Text>
                <Text style={{ color: theme.muted, fontSize: 9, marginTop: 2 }}>{p.confidencePct}% conf.</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Section title="DGH ledger" action={<Pressable onPress={sync} disabled={busy} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }}><Text style={{ color: theme.background, fontSize: 10, fontWeight: "900" }}>{busy ? "SYNC…" : "SYNC"}</Text></Pressable>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {(["rank", "gw", "total"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setSortBy(key)}
            style={{ backgroundColor: sortBy === key ? theme.primary : theme.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}
          >
            <Text style={{ color: sortBy === key ? "#04140D" : theme.foreground, fontWeight: "700", fontSize: 12 }}>
              {key === "rank" ? "Rank" : key === "gw" ? "GW Points" : "Total Points"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Surface>
        {table.managers.length ? (
          computeLeagueRows(table, sortBy, data.gameweek).map((row) => {
            const isMe = row.entryId === data.myRow?.entry;
            return (
              <Link key={row.entryId} href={`/rival/${row.entryId}` as any} asChild>
                <Pressable>
                  <Row
                    label={`#${row.position} · ${row.teamName}${row.relegated ? " · Relegated" : ""}`}
                    value={row.valueLabel}
                    emphasis={isMe}
                  />
                </Pressable>
              </Link>
            );
          })
        ) : (
          <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17 }}>No DGH ledger snapshot yet. Sync to calculate the adjusted standings from official manager histories.</Text>
        )}
      </Surface>
      <Section title="Rules" action={<Pressable onPress={() => router.push("/league-settings")}><Text style={{ color: theme.primary, fontSize: 11, fontWeight: "800" }}>EDIT →</Text></Pressable>} />
      <Surface>
        <Row label="Prize split" value={dghConfig ? `${dghConfig.prizePct1st}/${dghConfig.prizePct2nd}/${dghConfig.prizePct3rd}` : "50 / 30 / 20"} />
        <Row label="GW fee" value={`${dghConfig?.currency ?? "ETB"} ${dghConfig?.feePerGw ?? 100}`} />
        <Row label="Relegation fine" value={dghConfig?.relegationEnabled === false ? "Disabled" : `${dghConfig?.currency ?? "ETB"} ${dghConfig?.relegationFine ?? 50}`} />
      </Surface>

      <Section title="Reports" />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Pressable onPress={() => router.push("/domination-sheet")} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 11 }}>Domination{"\n"}Sheet</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/newsletter")} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 11 }}>Newsletter</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={() => router.push("/awards")} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 11 }}>Awards</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/timelapse")} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 11 }}>Timelapse</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Pressable onPress={() => router.push("/mini-league-template")} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 11 }}>Template{"\n"}Team</Text>
        </Pressable>
      </View>
    </Page>
  );
}

/**
 * Active sort (Rank / GW / Total) drives row order, the position number,
 * the emphasized value, and its label together — never independently.
 * Plain function (not a hook): safe to call after early returns.
 */
function computeLeagueRows(table: ComprehensiveTable, sortBy: "rank" | "gw" | "total", gameweek: number) {
  const withLatest = table.managers.map((m) => {
    const latest = m.gwRows.find((r) => r.event === gameweek) ?? m.gwRows[m.gwRows.length - 1];
    return { m, latest };
  });
  const ordered = [...withLatest];
  if (sortBy === "gw") ordered.sort((a, b) => (b.latest?.gwAdjusted ?? -Infinity) - (a.latest?.gwAdjusted ?? -Infinity));
  else if (sortBy === "total") ordered.sort((a, b) => b.m.overallPoints - a.m.overallPoints);
  else ordered.sort((a, b) => a.m.overallRank - b.m.overallRank);

  return ordered.map(({ m, latest }, i) => ({
    entryId: m.entryId,
    teamName: m.teamName,
    relegated: !!latest?.relegationFine,
    position: sortBy === "rank" ? m.overallRank : i + 1,
    valueLabel: sortBy === "gw" ? `${latest?.gwAdjusted ?? 0} DGH GW${gameweek}` : sortBy === "total" ? `${m.overallPoints} DGH Total` : `#${m.overallRank}`,
  }));
}
