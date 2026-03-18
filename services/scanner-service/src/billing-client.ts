export type PlanSlug = "free" | "starter" | "professional" | "enterprise";

const PLAN_LIMITS: Record<PlanSlug, { maxAssets: number; maxModels: number; maxRepoScans: number }> = {
  free:         { maxAssets: 100,   maxModels: 10,    maxRepoScans: 5 },
  starter:      { maxAssets: 500,   maxModels: 50,    maxRepoScans: 25 },
  professional: { maxAssets: 5000,  maxModels: 500,   maxRepoScans: 250 },
  enterprise:   { maxAssets: 50000, maxModels: 5000,  maxRepoScans: 2500 },
};

export function getPlanLimits(plan: PlanSlug) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}
