import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadSavedWhatIfScenarios,
  saveWhatIfScenario,
  deleteWhatIfScenario,
  clearWhatIfScenarios,
  type SavedWhatIfScenario,
} from "../lib/savedWhatIfStore";
import type { WhatIfMove, WhatIfChipChoice } from "../lib/analytics/whatIf";

export const SAVED_WHATIF_QUERY_KEY = ["dgh-saved-whatif-scenarios"];

export function useSavedWhatIf() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SAVED_WHATIF_QUERY_KEY,
    queryFn: loadSavedWhatIfScenarios,
    staleTime: Infinity,
  });

  const saveScenario = async (input: {
    name: string;
    moves: WhatIfMove[];
    chip: WhatIfChipChoice;
    snapshot: SavedWhatIfScenario["snapshot"];
  }) => {
    const next = await saveWhatIfScenario(input);
    queryClient.setQueryData(SAVED_WHATIF_QUERY_KEY, next);
    return next;
  };

  const deleteScenario = async (id: string) => {
    const next = await deleteWhatIfScenario(id);
    queryClient.setQueryData(SAVED_WHATIF_QUERY_KEY, next);
    return next;
  };

  const clearAll = async () => {
    const next = await clearWhatIfScenarios();
    queryClient.setQueryData(SAVED_WHATIF_QUERY_KEY, next);
    return next;
  };

  return {
    scenarios: query.data ?? [],
    isLoading: query.isLoading,
    saveScenario,
    deleteScenario,
    clearAll,
  };
}
