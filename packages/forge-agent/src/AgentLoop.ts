import type { ToolRegistry, ToolResult } from "./ToolRegistry.js";
import type { MemoryLayer } from "./MemoryLayer.js";

export type ReflectionDecision = "continue" | "retry" | "skip" | "abort";

export type StepReflection = {
  goal: string;
  toolName: string;
  attempt: number;
  result: ToolResult;
  decision: ReflectionDecision;
  note: string;
  timestamp: string;
};

export type AgentRunResult = {
  goalsTotal: number;
  goalsCompleted: number;
  goalsSkipped: number;
  reflections: StepReflection[];
  durationMs: number;
};

export type GoalStep = {
  goal: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
};

export type AgentLoopOptions = {
  registry: ToolRegistry;
  memory: MemoryLayer;
  maxRetries?: number;
  onStepStart?: (step: GoalStep, attempt: number) => void;
  onStepEnd?: (reflection: StepReflection) => void;
  reflect?: (result: ToolResult, attempt: number, maxRetries: number) => ReflectionDecision;
};

function defaultReflect(
  result: ToolResult,
  attempt: number,
  maxRetries: number
): ReflectionDecision {
  if (result.success) return "continue";
  if (attempt < maxRetries) return "retry";
  return "skip";
}

export class AgentLoop {
  private readonly steps: GoalStep[] = [];
  private readonly maxRetries: number;
  private readonly reflect: NonNullable<AgentLoopOptions["reflect"]>;

  constructor(private readonly options: AgentLoopOptions) {
    this.maxRetries = options.maxRetries ?? 2;
    this.reflect = options.reflect ?? defaultReflect;
  }

  addGoal(goal: string, toolName: string, toolArgs: Record<string, unknown> = {}): this {
    this.steps.push({ goal, toolName, toolArgs });
    return this;
  }

  async run(): Promise<AgentRunResult> {
    const startMs = Date.now();
    const reflections: StepReflection[] = [];
    let completed = 0;
    let skipped = 0;

    await this.options.memory.load();

    for (const step of this.steps) {
      const tool = this.options.registry.get(step.toolName);
      if (!tool) {
        const reflection: StepReflection = {
          goal: step.goal,
          toolName: step.toolName,
          attempt: 0,
          result: { success: false, output: "", error: `Tool '${step.toolName}' not registered.` },
          decision: "skip",
          note: `Skipped: tool '${step.toolName}' not found in registry.`,
          timestamp: new Date().toISOString()
        };
        reflections.push(reflection);
        await this.options.memory.append("reflections", reflection);
        skipped++;
        continue;
      }

      let attempt = 0;
      let settled = false;

      while (!settled) {
        this.options.onStepStart?.(step, attempt);

        const result = await tool.execute({ ...step.toolArgs, goal: step.goal });
        const decision = this.reflect(result, attempt, this.maxRetries);

        const reflection: StepReflection = {
          goal: step.goal,
          toolName: step.toolName,
          attempt,
          result,
          decision,
          note: result.success
            ? `Completed: ${step.goal}`
            : `Failed (attempt ${attempt + 1}): ${result.error ?? result.output}`,
          timestamp: new Date().toISOString()
        };

        reflections.push(reflection);
        await this.options.memory.append("reflections", reflection);

        this.options.onStepEnd?.(reflection);

        if (decision === "continue") {
          completed++;
          settled = true;
        } else if (decision === "retry") {
          attempt++;
        } else if (decision === "abort") {
          return {
            goalsTotal: this.steps.length,
            goalsCompleted: completed,
            goalsSkipped: skipped,
            reflections,
            durationMs: Date.now() - startMs
          };
        } else {
          skipped++;
          settled = true;
        }
      }
    }

    return {
      goalsTotal: this.steps.length,
      goalsCompleted: completed,
      goalsSkipped: skipped,
      reflections,
      durationMs: Date.now() - startMs
    };
  }
}
