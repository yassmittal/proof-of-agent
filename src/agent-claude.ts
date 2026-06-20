import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODEL } from './config';
import {
  AGENT_TOOLS,
  SYSTEM_PROMPT,
  DEFAULT_TASK,
  startRun,
  applyToolCall,
  finishRun,
} from './agent-core';
import type { RunManifest } from './manifest';

const tools: Anthropic.Tool[] = AGENT_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.schema,
}));

/**
 * Run the covenant-governed agent on the first-party Anthropic API (Claude).
 *
 * Every tool the model invokes is enforced against the covenant before it runs and
 * recorded as a hash-chained receipt. The returned manifest is identical in shape to
 * every other run, so persisting, anchoring, and verifying it are unchanged.
 */
export async function runClaudeAgent(task?: string): Promise<RunManifest> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env to run the Claude agent.');
  }
  console.log(`agent provider: Anthropic API (${AGENT_MODEL})`);

  const ctx = await startRun();
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task ?? DEFAULT_TASK }];

  for (let turn = 0; turn < 8; turn++) {
    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason !== 'tool_use') break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const outcome = applyToolCall(ctx, block.name, block.input as Record<string, unknown>);
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: outcome.content,
        is_error: outcome.isError,
      });
    }
    messages.push({ role: 'user', content: results });
  }

  return finishRun(ctx);
}
