export interface ImpactItem {
  id: string;
  name: string;
}
export interface Impact {
  agents: ImpactItem[];
  projects: ImpactItem[];
}
/** Returns who depends on a provider connection; later features add their own. */
export type ImpactSource = (connectionId: string) => Partial<Impact>;

/** Models agents currently use on a connection; those are re-checked hourly. */
export type ModelsInUseSource = (connectionId: string) => string[];

export interface ImpactRegistry {
  registerImpactSource(source: ImpactSource): void;
  getImpact(connectionId: string): Impact;
  registerModelsInUseSource(source: ModelsInUseSource): void;
  modelsInUse(connectionId: string): string[];
}

function merge(items: ImpactItem[]): ImpactItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Agents (US4) and projects (US5) register what they depend on; the provider
 * module never reads those tables, so US2 stands on its own. Until a source is
 * registered the answer is empty.
 */
export function createImpactRegistry(): ImpactRegistry {
  const sources: ImpactSource[] = [];
  const modelSources: ModelsInUseSource[] = [];
  return {
    registerModelsInUseSource(source) {
      modelSources.push(source);
    },
    modelsInUse(connectionId) {
      return [...new Set(modelSources.flatMap((s) => s(connectionId)))];
    },
    registerImpactSource(source) {
      sources.push(source);
    },
    getImpact(connectionId) {
      const results = sources.map((source) => source(connectionId));
      return {
        agents: merge(results.flatMap((r) => r.agents ?? [])),
        projects: merge(results.flatMap((r) => r.projects ?? [])),
      };
    },
  };
}

export const defaultImpactRegistry = createImpactRegistry();
