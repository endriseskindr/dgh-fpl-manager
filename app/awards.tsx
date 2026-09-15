import { useMemo } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { buildMonthlyAwards } from "../lib/analytics/monthlyAwards";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../components/StatusStates";
import { Page, Header, Surface, Section, Pill } from "../components/Premium";

export default function AwardsScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();

  const months = useMemo(() => (data ? buildMonthlyAwards(data.dghTable, data.bootstrap.events) : []), [data]);

  const weeklyRecords = useMemo(() => {
    if (!data) return [];
    const all = data.dghTable.managers.flatMap((m) => m.gwRows.map((r) => ({ ...r, teamName: m.teamName, managerName: m.managerName })));
    return [...all].sort((a, b) => b.gwAdjusted - a.gwAdjusted).slice(0, 10);
  }, [data]);

  if (isLoading) return <LoadingShell label="Crunching the season's awards…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  return (
    <Page>
      <Header eyebrow="LEAGUE AWARDS" title="Awards" subtitle="Monthly award categories and all-time single-GW records, from the DGH ledger." />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Section title="Monthly awards" />
      {months.length === 0 ? (
        <Surface>
          <Text style={{ color: theme.muted, fontSize: 12 }}>No ledger history yet — sync the DGH ledger from the League tab to build monthly awards.</Text>
        </Surface>
      ) : (
        months.map((month) => (
          <Surface key={month.monthKey}>
            <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 14, marginBottom: 10 }}>{month.monthLabel}</Text>
            {month.categories.map((cat) => (
              <View key={cat.key} style={{ marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border + "60" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 }}>{cat.label.toUpperCase()}</Text>
                    <Text style={{ color: theme.muted, fontSize: 9, marginTop: 2 }}>{cat.description}</Text>
                  </View>
                  {cat.winner ? <Pill label="CROWNED" tone="success" /> : <Pill label="NO WINNER" tone="neutral" />}
                </View>
                {cat.winner ? (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ color: theme.foreground, fontWeight: "800", fontSize: 13 }}>{cat.winner.teamName}</Text>
                    <Text style={{ color: theme.muted, fontSize: 10, marginTop: 1 }}>{cat.winner.detail}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </Surface>
        ))
      )}

      <Section title="All-time single-GW records" />
      <Surface>
        {weeklyRecords.length === 0 ? (
          <Text style={{ color: theme.muted, fontSize: 12 }}>No ledger history yet.</Text>
        ) : (
          weeklyRecords.map((r, i) => (
            <View key={`${r.entryId}-${r.event}`} style={{ minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: theme.border + "60" }}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {i + 1}. {r.teamName} <Text style={{ color: theme.muted, fontWeight: "400" }}>· GW{r.event}</Text>
              </Text>
              <Text style={{ color: i === 0 ? theme.primary : theme.foreground, fontSize: 12, fontWeight: "800" }}>{r.gwAdjusted} pts</Text>
            </View>
          ))
        )}
      </Surface>
    </Page>
  );
}
