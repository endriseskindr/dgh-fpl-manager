import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { getChipStatuses } from "../lib/analytics/chips";
import { buildDominationSheet, renderDominationSheetText, renderDominationSheetCsv } from "../lib/analytics/dominationSheet";
import { exportText } from "../lib/export";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../components/StatusStates";
import { Page, Header, Surface, Section, Pill } from "../components/Premium";

export default function DominationSheetScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [busy, setBusy] = useState<"" | "csv" | "txt">("");

  const sheet = useMemo(() => {
    if (!data) return null;
    const chipsAvailable = getChipStatuses(data.chipsUsed, data.gameweek)
      .filter((c) => c.available)
      .map((c) => c.label);
    return buildDominationSheet({
      table: data.dghTable,
      gameweek: data.gameweek,
      myEntryId: data.myRow?.entry ?? null,
      activeChip: data.activeChip,
      currentTransferHits: data.currentTransferHits,
      currentFreeTransfers: data.currentFreeTransfers,
      bank: data.bank,
      teamValue: data.teamValue,
      nextDeadlineISO: data.planningDeadline,
      chipsAvailable,
    });
  }, [data]);

  const exportAs = async (kind: "csv" | "txt") => {
    if (!sheet) return;
    setBusy(kind);
    try {
      if (kind === "csv") await exportText(`gw${sheet.gameweek}_domination_sheet.csv`, renderDominationSheetCsv(sheet));
      else await exportText(`gw${sheet.gameweek}_domination_sheet.txt`, renderDominationSheetText(sheet));
    } finally {
      setBusy("");
    }
  };

  if (isLoading) return <LoadingShell label="Building the domination sheet…" />;
  if (isError || !data || !sheet) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  return (
    <Page>
      <Header eyebrow="WEEKLY REPORT" title="GW Domination Sheet" subtitle="A–G structured breakdown of this gameweek — exportable and submittable to the league." right={<Pill label={`GW${sheet.gameweek}`} tone="primary" />} />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      {sheet.sections.map((s) => (
        <Surface key={s.id}>
          <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, marginBottom: 4 }}>
            {s.letter}. {s.title.toUpperCase()}
          </Text>
          {s.lines.length === 0 ? (
            <Text style={{ color: theme.muted, fontSize: 11 }}>No data.</Text>
          ) : (
            s.lines.map((line, i) => (
              <Text key={i} style={{ color: theme.foreground, fontSize: 12, lineHeight: 18, marginTop: 3 }}>
                {line}
              </Text>
            ))
          )}
        </Surface>
      ))}

      <Section title="Export" />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Pressable onPress={() => void exportAs("txt")} disabled={!!busy} style={{ flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: theme.background, fontWeight: "900", fontSize: 12 }}>{busy === "txt" ? "…" : "SHARE AS TEXT"}</Text>
        </Pressable>
        <Pressable onPress={() => void exportAs("csv")} disabled={!!busy} style={{ flex: 1, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 12 }}>{busy === "csv" ? "…" : "EXPORT CSV"}</Text>
        </Pressable>
      </View>
    </Page>
  );
}
