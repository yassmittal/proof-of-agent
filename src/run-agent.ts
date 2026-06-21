import { simulateAgentRun } from './agent';
import { runClaudeAgent } from './agent-claude';
import { runBedrockAgent, hasBedrockCredentials } from './agent-bedrock';
import type { CitedDataset } from './datasets';
import type { RunManifest } from './manifest';

/**
 * Run the live agent for whichever provider is configured (Bedrock or first-party
 * Anthropic), falling back to the deterministic stand-in when no model credentials
 * are present so the pipeline always runs. `datasets` are inputs pre-seeded on Walrus
 * for the agent to consume and cite.
 */
export function runAgent(
  task?: string,
  datasets?: Map<string, CitedDataset>,
): Promise<RunManifest> {
  if (hasBedrockCredentials()) return runBedrockAgent(task, datasets);
  if (process.env.ANTHROPIC_API_KEY) return runClaudeAgent(task, datasets);
  console.log('--- simulating agent run (no model credentials) ---');
  return simulateAgentRun();
}
