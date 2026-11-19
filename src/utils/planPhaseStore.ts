export interface PlanPhase {
  id: string;
  name: string;
  description: string;
}

export interface PlanPathState {
  phases: PlanPhase[];
  currentPhaseId: string;
  source?: 'user' | 'demo';
  isSample?: boolean;
}

export const PLAN_PATH_STORAGE_KEY = 'genki.plan.path.v1';
export const MAX_PLAN_PHASES = 3;

export const DEFAULT_PLAN_PHASES: PlanPhase[] = [
  {
    id: 'phase-start-small',
    name: 'Start small',
    description: 'Find activities that fit your week.',
  },
  {
    id: 'phase-find-rhythm',
    name: 'Find your rhythm',
    description: 'Keep what feels manageable.',
  },
  {
    id: 'phase-build-gently',
    name: 'Build gently',
    description: 'Add time or variety when you’re ready.',
  },
];

function cloneDefaultPhases(): PlanPhase[] {
  return DEFAULT_PLAN_PHASES.map((phase) => ({ ...phase }));
}

export function normalizePlanPathState(raw: unknown): PlanPathState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.phases) || obj.phases.length === 0) return null;

  const phases: PlanPhase[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < Math.min(MAX_PLAN_PHASES, obj.phases.length); i++) {
    const item = obj.phases[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const fallback = DEFAULT_PLAN_PHASES[i] ?? DEFAULT_PLAN_PHASES[0];

    const id =
      typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : fallback.id;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name =
      typeof rec.name === 'string' && rec.name.trim()
        ? rec.name.trim()
        : fallback.name;
    const description =
      typeof rec.description === 'string' && rec.description.trim()
        ? rec.description.trim()
        : fallback.description;

    phases.push({ id, name, description });
  }

  if (phases.length === 0) return null;

  const requestedId =
    typeof obj.currentPhaseId === 'string' ? obj.currentPhaseId.trim() : '';
  const hasMatch = phases.some((p) => p.id === requestedId);
  const source: 'user' | 'demo' =
    obj.source === 'demo' || (obj.source !== 'user' && obj.isSample === true) ? 'demo' : 'user';

  return {
    phases,
    currentPhaseId: hasMatch ? requestedId : phases[0].id,
    source,
    isSample: source === 'demo',
  };
}

export function loadInitialPlanPath(initialFocusPhaseName?: string): PlanPathState {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedRaw = window.localStorage.getItem(PLAN_PATH_STORAGE_KEY);
      if (savedRaw) {
        const parsed = normalizePlanPathState(JSON.parse(savedRaw));
        if (parsed) return parsed;
      }
    } catch {
      // Ignore malformed JSON in localStorage and fall back to defaults
    }
  }

  const phases = cloneDefaultPhases();
  const normalizedFocusPhase = (initialFocusPhaseName || '').trim();

  if (normalizedFocusPhase) {
    const matched = phases.find(
      (p) => p.name.toLowerCase() === normalizedFocusPhase.toLowerCase()
    );
    if (matched) {
      return {
        phases,
        currentPhaseId: matched.id,
        source: 'demo',
        isSample: true,
      };
    }

    phases[0] = {
      ...phases[0],
      name: normalizedFocusPhase,
    };
  }

  return {
    phases,
    currentPhaseId: phases[0].id,
    source: 'demo',
    isSample: true,
  };
}

export function savePlanPathState(state: PlanPathState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const source: 'user' | 'demo' = state.source === 'demo' ? 'demo' : 'user';
    const payload: PlanPathState = {
      phases: state.phases.slice(0, MAX_PLAN_PHASES).map((p) => ({
        id: p.id,
        name: p.name.trim(),
        description: p.description.trim(),
      })),
      currentPhaseId: state.currentPhaseId,
      source,
      isSample: source === 'demo',
    };
    window.localStorage.setItem(PLAN_PATH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private mode errors
  }
}
