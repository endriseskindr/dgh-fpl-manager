import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { buildGwNewsletter } from "../lib/analytics/newsletter";
import { exportText } from "../lib/export";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../components/StatusStates";
import { Page, Header, Surface, Section, Pill } from "../components/Premium";

export default function NewsletterScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState<"idle" | "shared" | "saved">("idle");

  // Newsletters read best once a gameweek is finished — default to the most
  // recently completed event when the current one is still live/upcoming.
  const targetEvent = useMemo(() => {
    if (!data) return null;
    const lastFinished = [...data.bootstrap.events].filter((e) => e.finished).sort((a, b) => b.id - a.id)[0];
    return lastFinished?.id ?? data.gameweek;
  }, [data]);

  const text = useMemo(() => {
    if (!data || targetEvent === null) return "";
    return buildGwNewsletter({ table: data.dghTable, gameweek: targetEvent, myEntryId: data.myRow?.entry ?? null });
  }, [data, targetEvent]);

  const share = async () => {
    if (!text || targetEvent === null) return;
    setSharing(true);
    setShared("idle");
    try {
      const res = await exportText(`gw${targetEvent}_newsletter.txt`, text);
      setShared(res.shared ? "shared" : "saved");
    } finally {
      setSharing(false);
    }
  };

  if (isLoading) return <LoadingShell label="Writing the recap…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  return (
    <Page>
      <Header eyebrow="LEAGUE COMMS" title="Newsletter" subtitle={`Comparative GW${targetEvent ?? data.gameweek} recap — post it straight to your league group chat.`} right={<Pill label={`GW${targetEvent ?? data.gameweek}`} tone="primary" />} />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Section title="Preview" />
      <Surface>
        {text ? (
          <Text style={{ color: theme.foreground, fontSize: 12, lineHeight: 19, fontFamily: "monospace" }}>{text}</Text>
        ) : (
          <Text style={{ color: theme.muted, fontSize: 12 }}>No ledger data yet — sync the DGH ledger from the League tab first.</Text>
        )}
      </Surface>

      <Pressable onPress={() => void share()} disabled={sharing || !text} style={{ minHeight: 48, borderRadius: 13, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", opacity: sharing || !text ? 0.6 : 1, marginBottom: 8 }}>
        <Text style={{ color: theme.background, fontWeight: "900", fontSize: 13 }}>{sharing ? "PREPARING…" : "SHARE TO LEAGUE"}</Text>
      </Pressable>
      {shared === "shared" ? <Text style={{ color: theme.success, fontSize: 11, fontWeight: "700", textAlign: "center" }}>Opened the share sheet.</Text> : null}
      {shared === "saved" ? <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "700", textAlign: "center" }}>Saved as a text file (no share target picked).</Text> : null}

      <View style={{ marginTop: 4 }}>
        <Text style={{ color: theme.muted, fontSize: 10, textAlign: "center", lineHeight: 15 }}>
          Auto-written from the DGH ledger — winner, bottom of the table, your result, biggest hit, chips played and the top-5 season table.
        </Text>
      </View>
    </Page>
  );
}
