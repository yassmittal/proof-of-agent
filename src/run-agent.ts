import { simulateAgentRun } from './agent';
import { runClaudeAgent } from './agent-claude';
import { runBedrockAgent, hasBedrockCredentials } from './agent-bedrock';
import type { RunManifest } from './manifest';

/**
 * Run the live agent for whichever provider is configured (Bedrock or first-party
 * Anthropic), falling back to the deterministic stand-in when no model credentials
 * are present so the pipeline always runs.
 */
export function runAgent(task?: string): Promise<RunManifest> {
  if (hasBedrockCredentials()) return runBedrockAgent(task);
  if (process.env.ANTHROPIC_API_KEY) return runClaudeAgent(task);
  console.log('--- simulating agent run (no model credentials) ---');
  return simulateAgentRun();
}
