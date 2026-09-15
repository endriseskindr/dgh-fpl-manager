import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { useWarRoomData } from "../../hooks/useWarRoomData";
import { Badge } from "../../components/Badge";
import { EmptyBlock, ErrorBlock, FreshnessBanner, LoadingShell } from "../../components/StatusStates";
import { LEAGUE_ID, MY_ENTRY_ID } from "../../lib/config";
import { Page, Header, Surface, Hero, Metric, Pill } from "../../components/Premium";

export default function RivalsScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"rank" | "gw" | "total">("rank");
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } };

  const rows = useMemo(() => {
    if (!data) return [];
    const dghById = new Map(data.dghTable.managers.map((m) => [m.entryId, m]));
    let list = [...data.standings].map((r) => ({ ...r, dgh: dghById.get(r.entry) ?? null }));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.player_name.toLowerCase().includes(q) || r.entry_name.toLowerCase().includes(q));
    }
    if (sortBy === "gw") list.sort((a, b) => (b.dgh?.gwRows.find(x => x.event === data.gameweek)?.gwAdjusted ?? -Infinity) - (a.dgh?.gwRows.find(x => x.event === data.gameweek)?.gwAdjusted ?? -Infinity));
    else if (sortBy === "total") list.sort((a, b) => (b.dgh?.overallPoints ?? -Infinity) - (a.dgh?.overallPoints ?? -Infinity));
    else list.sort((a, b) => (a.dgh?.overallRank ?? Infinity) - (b.dgh?.overallRank ?? Infinity));
    return list;
  }, [data, search, sortBy]);

  if (isLoading) return <LoadingShell label="Loading mini-league standings…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Unknown error")} onRetry={() => refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.entry)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void doRefresh()} tintColor={theme.primary} colors={[theme.primary]} />}
        ListEmptyComponent={
          <EmptyBlock
            icon="people-outline"
            title="No managers match"
            message={search.trim() ? `Nothing found for "${search.trim()}" — try a different name or clear the search.` : "This league has no standings to show yet."}
          />
        }
        ListHeaderComponent={
          <Page scroll={false}>
            <Header eyebrow="MINI-LEAGUE" title="Rivals" subtitle={`League ${LEAGUE_ID} · ${data.standings.length} managers`} />
            <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />
            <Hero variant="green">
              <Pill label={`LEAGUE ${LEAGUE_ID}`} tone="onHero" />
              <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900", marginTop: 10 }}>#{data.myRow?.dghRank ?? data.myRow?.rank ?? "—"} in the mini-league</Text>
              <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 3 }}>{data.standings.length} managers tracked</Text>
              <View style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
                <Metric label="Total" value={String(data.myRow?.dghTotalPoints ?? data.myRow?.total ?? "—")} onHero />
                <Metric label="GW points" value={String(data.myRow?.dghGwPoints ?? data.myRow?.event_total ?? "—")} onHero />
                <Metric label="Leader gap" value={`${Math.max(0, Math.max(...data.standings.map(s=>s.dghTotalPoints ?? s.total), 0) - (data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0))}`} onHero />
              </View>
            </Hero>
            <TextInput
              placeholder="Search manager or team…"
              placeholderTextColor={theme.muted}
              value={search}
              onChangeText={setSearch}
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: theme.foreground,
                marginBottom: 8,
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {(["rank", "gw", "total"] as const).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setSortBy(key)}
                  style={{
                    backgroundColor: sortBy === key ? theme.primary : theme.surfaceAlt,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    marginRight: 8,
                  }}
                >
                  <Text style={{ color: sortBy === key ? "#04140D" : theme.foreground, fontWeight: "700", fontSize: 12 }}>
                    {key === "rank" ? "Rank" : key === "gw" ? "GW Points" : "Total Points"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Page>
        }
        renderItem={({ item }) => {
          const isMe = item.entry === MY_ENTRY_ID;
          const movement = item.last_rank - item.rank;
          const dghGw = item.dgh?.gwRows.find(x => x.event === data.gameweek)?.gwAdjusted ?? null;
          const dghTotal = item.dgh?.overallPoints ?? null;
          const dghRank = item.dgh?.overallRank ?? null;
          const position = sortBy === "gw" ? (rows.findIndex(r => r.entry === item.entry) + 1) : dghRank;
          const emphasized = sortBy === "gw" ? dghGw : sortBy === "total" ? dghTotal : dghRank;
          return (
            <View style={{ marginHorizontal: 18, marginBottom: 8 }}>
              <Pressable onPress={() => !isMe && router.push(`/rival/${item.entry}`)}>
                <Surface style={isMe ? { borderColor: theme.primary, borderWidth: 1.5, marginBottom: 0 } : { marginBottom: 0 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.foreground, fontWeight: "700" }}>
                        #{position ?? "—"} {item.player_name} {isMe ? "(YOU)" : ""}
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }}>{item.entry_name} · DGH gap {((item.dgh?.overallPoints ?? item.total) - (data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0)) > 0 ? "+" : ""}{(item.dgh?.overallPoints ?? item.total) - (data.myRow?.dghTotalPoints ?? data.myRow?.total ?? 0)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: theme.foreground, fontWeight: "900" }}>{sortBy === "rank" ? `#${emphasized ?? "—"}` : `${emphasized ?? "—"} pts`}</Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }}>{sortBy === "gw" ? `DGH GW${data.gameweek}` : sortBy === "total" ? "DGH Total" : `DGH GW${data.gameweek} · ${dghGw ?? "—"}`}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", marginTop: 6 }}>
                    {movement > 0 ? <Badge label={`▲ ${movement}`} color={theme.success} /> : movement < 0 ? <Badge label={`▼ ${Math.abs(movement)}`} color={theme.error} /> : <Badge label="—" color={theme.muted} />}
                  </View>
                </Surface>
              </Pressable>
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}
