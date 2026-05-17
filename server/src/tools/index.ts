import { registerPipelineTools } from "./pipeline.js";
import { registerDecisionTools } from "./decisions.js";
import { registerTaskTools } from "./tasks.js";
import { registerSeedTools } from "./seeds.js";
import { registerRenderTools } from "./render.js";
import { registerHandoffTools } from "./handoff.js";
import { registerOutcomeTools } from "./outcomes.js";
import { registerSearchTools } from "./search.js";

export function registerAllTools(): void {
  registerPipelineTools();
  registerDecisionTools();
  registerTaskTools();
  registerSeedTools();
  registerRenderTools();
  registerHandoffTools();
  registerOutcomeTools();
  registerSearchTools();
}
