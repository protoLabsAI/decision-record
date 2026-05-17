import {
  EffectiveGateConfig,
  EffortLevel,
  GateConfig,
  GateOverrides,
} from "./schemas/index.js";

const PRESETS: Record<EffortLevel, EffectiveGateConfig> = {
  poc: {
    decisions_required_status: "accepted",
    review_required_phases: [],
    review_required_per_decision: false,
    max_task_estimate_hours: 16,
    require_human_signoff_phases: ["handing-off"],
    min_decisions: 0,
    min_tasks: 3,
  },
  mvp: {
    decisions_required_status: "accepted",
    review_required_phases: ["scoping", "decomposing"],
    review_required_per_decision: false,
    max_task_estimate_hours: 8,
    require_human_signoff_phases: ["scoping", "decomposing", "handing-off"],
    min_decisions: 3,
    min_tasks: 8,
  },
  full: {
    decisions_required_status: "accepted",
    review_required_phases: ["scoping", "deciding", "decomposing"],
    review_required_per_decision: true,
    max_task_estimate_hours: 4,
    require_human_signoff_phases: [
      "scoping",
      "deciding",
      "decomposing",
      "handing-off",
    ],
    min_decisions: 6,
    min_tasks: 15,
  },
};

export function resolveEffectiveGateConfig(
  config: GateConfig
): EffectiveGateConfig {
  const base = PRESETS[config.preset];
  const overrides: GateOverrides = config.overrides ?? {};
  return {
    decisions_required_status:
      overrides.decisions_required_status ?? base.decisions_required_status,
    review_required_phases:
      overrides.review_required_phases ?? base.review_required_phases,
    review_required_per_decision:
      overrides.review_required_per_decision ?? base.review_required_per_decision,
    max_task_estimate_hours:
      overrides.max_task_estimate_hours ?? base.max_task_estimate_hours,
    require_human_signoff_phases:
      overrides.require_human_signoff_phases ?? base.require_human_signoff_phases,
    min_decisions: overrides.min_decisions ?? base.min_decisions,
    min_tasks: overrides.min_tasks ?? base.min_tasks,
  };
}

export function presetFor(level: EffortLevel): EffectiveGateConfig {
  return PRESETS[level];
}
