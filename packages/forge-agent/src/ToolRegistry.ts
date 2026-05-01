export type ToolResult = {
  success: boolean;
  output: string;
  error?: string;
};

export type AgentTool = {
  name: string;
  description: string;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
};

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export function createDefaultRegistry(): ToolRegistry {
  return new ToolRegistry();
}
