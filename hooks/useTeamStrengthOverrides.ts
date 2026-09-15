import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadTeamStrengthOverrides,
  resetAllTeamStrengthOverrides,
  resetTeamStrengthOverride,
  setTeamStrengthOverride,
} from "../lib/teamStrengthStore";
import type { TeamStrengthOverride } from "../lib/analytics/teamStrength";

export const TEAM_STRENGTH_QUERY_KEY = ["dgh-team-strength-overrides"];

export function useTeamStrengthOverrides() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: TEAM_STRENGTH_QUERY_KEY,
    queryFn: loadTeamStrengthOverrides,
    staleTime: Infinity,
  });

  const setOverride = async (teamId: number, patch: TeamStrengthOverride) => {
    const next = await setTeamStrengthOverride(teamId, patch);
    queryClient.setQueryData(TEAM_STRENGTH_QUERY_KEY, next);
  };
  const resetTeam = async (teamId: number) => {
    const next = await resetTeamStrengthOverride(teamId);
    queryClient.setQueryData(TEAM_STRENGTH_QUERY_KEY, next);
  };
  const resetAll = async () => {
    const next = await resetAllTeamStrengthOverrides();
    queryClient.setQueryData(TEAM_STRENGTH_QUERY_KEY, next);
  };

  return { overrides: query.data ?? {}, isLoading: query.isLoading, setOverride, resetTeam, resetAll };
}
