import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useWarRoomData } from "../hooks/useWarRoomData";
import { useTeamStrengthOverrides } from "../hooks/useTeamStrengthOverrides";
import { LoadingShell, ErrorBlock, FreshnessBanner } from "../components/StatusStates";
import { Page, Header, Surface, Section, Pill, Row } from "../components/Premium";
import {
  effectiveTeamStrength,
  isOverridden,
  normalize0to100,
  STRENGTH_RAW_MIN,
  STRENGTH_RAW_MAX,
  type TeamStrengthRaw,
} from "../lib/analytics/teamStrength";

const STEP = 10;

function Stepper({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: theme.foreground, fontSize: 11, fontWeight: "900" }}>
          {value} · {normalize0to100(value)}/100
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(Math.max(STRENGTH_RAW_MIN, value - STEP))}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.surfaceAlt, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
        >
          <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 16 }}>−</Text>
        </Pressable>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.border, overflow: "hidden" }}>
          <View
            style={{
              width: `${normalize0to100(value)}%`,
              height: "100%",
              backgroundColor: theme.primary,
            }}
          />
        </View>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(Math.min(STRENGTH_RAW_MAX, value + STEP))}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.surfaceAlt, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
        >
          <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 16 }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TeamStrengthScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError, error, refetch } = useWarRoomData();
  const { overrides, isLoading: overridesLoading, setOverride, resetTeam, resetAll } = useTeamStrengthOverrides();
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);

  const teams = useMemo(() => {
    if (!data) return [];
    return [...data.bootstrap.teams].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  if (isLoading || overridesLoading) return <LoadingShell label="Loading team strength model…" />;
  if (isError || !data) return <ErrorBlock message={String((error as Error)?.message ?? "Data unavailable")} onRetry={() => refetch()} />;

  const overriddenCount = Object.values(overrides).filter((o) => isOverridden(o)).length;

  return (
    <Page>
      <Header
        eyebrow="TEAM STRENGTH INTELLIGENCE"
        title="Strength Editor"
        subtitle="Supplementary to official FPL FDR — never replaces it. Adjust any club's attack/defence rating and it persists across restarts."
      />
      <FreshnessBanner stale={data.stale} fetchedAt={data.fetchedAt} />

      <Surface style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 13 }}>{overriddenCount} team{overriddenCount === 1 ? "" : "s"} overridden</Text>
          <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>Everything else uses the official FPL bootstrap values.</Text>
        </View>
        {overriddenCount ? (
          <Pressable onPress={() => void resetAll()} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.error }}>
            <Text style={{ color: theme.error, fontWeight: "800", fontSize: 11 }}>RESET ALL</Text>
          </Pressable>
        ) : null}
      </Surface>

      <Section title="Clubs" />
      {teams.map((team) => {
        const override = overrides[team.id];
        const overridden = isOverridden(override);
        const eff: TeamStrengthRaw = effectiveTeamStrength(team, override);
        const open = expandedTeamId === team.id;
        return (
          <Surface key={team.id} style={{ borderColor: overridden ? theme.primary : theme.border }}>
            <Pressable onPress={() => setExpandedTeamId(open ? null : team.id)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: theme.foreground, fontWeight: "900", fontSize: 13 }}>{team.name}</Text>
                {overridden ? <Pill label="OVERRIDDEN" tone="primary" /> : <Pill label="OFFICIAL" tone="neutral" />}
              </View>
              <Text style={{ color: theme.muted, fontSize: 16 }}>{open ? "−" : "+"}</Text>
            </Pressable>

            {open ? (
              <View style={{ marginTop: 12 }}>
                <Stepper label="Attack — Home" value={eff.attackHome} onChange={(v) => void setOverride(team.id, { attackHome: v })} />
                <Stepper label="Attack — Away" value={eff.attackAway} onChange={(v) => void setOverride(team.id, { attackAway: v })} />
                <Stepper label="Defence — Home" value={eff.defenceHome} onChange={(v) => void setOverride(team.id, { defenceHome: v })} />
                <Stepper label="Defence — Away" value={eff.defenceAway} onChange={(v) => void setOverride(team.id, { defenceAway: v })} />
                <Row label="Official overall (home/away)" value={`${team.strength_overall_home} / ${team.strength_overall_away}`} />
                {overridden ? (
                  <Pressable onPress={() => void resetTeam(team.id)} style={{ marginTop: 10, alignSelf: "flex-start" }}>
                    <Text style={{ color: theme.error, fontWeight: "800", fontSize: 11 }}>RESET {team.short_name} TO OFFICIAL</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Row label="Attack / Defence (H · A)" value={`${eff.attackHome}/${eff.attackAway} · ${eff.defenceHome}/${eff.defenceAway}`} />
            )}
          </Surface>
        );
      })}

      <Text style={{ color: theme.muted, fontSize: 10, textAlign: "center", marginTop: 4 }}>
        DGH&apos;s strength model and fixture-difficulty score are built from these values but are always shown alongside — never in place of — official FPL FDR.
      </Text>
    </Page>
  );
}
