import { BEDROCK_REGION, BEDROCK_MODEL } from './config';
import {
  AGENT_TOOLS,
  SYSTEM_PROMPT,
  DEFAULT_TASK,
  startRun,
  applyToolCall,
  finishRun,
} from './agent-core';
import type { RunManifest } from './manifest';

// Minimal shapes for the Bedrock Converse API we depend on. Using raw fetch keeps the
// agent free of the AWS SDK; an Amazon Bedrock API key authenticates as a bearer token.
interface ConverseToolUse {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}
interface ConverseBlock {
  text?: string;
  toolUse?: ConverseToolUse;
}
interface ConverseResponse {
  output: { message: { role: string; content: ConverseBlock[] } };
  stopReason: string;
}

/** True when an Amazon Bedrock API key is available. */
export function hasBedrockCredentials(): boolean {
  return !!process.env.AWS_BEARER_TOKEN_BEDROCK;
}

/**
 * Run the covenant-governed agent on Amazon Bedrock via the Converse API.
 *
 * Converse is provider-neutral, so the same agent drives Mistral, OpenAI, or Claude
 * models on Bedrock. Enforcement and receipts are shared with the Claude path — only
 * the transport differs, which is exactly the point: the audit layer wraps any agent.
 */
export async function runBedrockAgent(task?: string): Promise<RunManifest> {
  const key = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!key) {
    throw new Error('AWS_BEARER_TOKEN_BEDROCK is not set. Add it to .env to run the Bedrock agent.');
  }
  const region = process.env.AWS_REGION ?? BEDROCK_REGION;
  const model = process.env.BEDROCK_MODEL ?? BEDROCK_MODEL;
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse`;
  console.log(`agent provider: Amazon Bedrock Converse (${region}) — ${model}`);

  const ctx = await startRun();
  const toolConfig = {
    tools: AGENT_TOOLS.map((t) => ({
      toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.schema } },
    })),
  };

  const messages: { role: string; content: unknown[] }[] = [
    { role: 'user', content: [{ text: task ?? DEFAULT_TASK }] },
  ];

  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: [{ text: SYSTEM_PROMPT }],
        messages,
        toolConfig,
        inferenceConfig: { maxTokens: 1024 },
      }),
    });
    if (!res.ok) {
      throw new Error(`Bedrock Converse ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const data = (await res.json()) as ConverseResponse;
    const message = data.output.message;
    messages.push(message);
    if (data.stopReason !== 'tool_use') break;

    const toolResults = [];
    for (const block of message.content) {
      if (!block.toolUse) continue;
      const outcome = applyToolCall(ctx, block.toolUse.name, block.toolUse.input ?? {});
      toolResults.push({
        toolResult: {
          toolUseId: block.toolUse.toolUseId,
          content: [{ text: outcome.content }],
          ...(outcome.isError ? { status: 'error' } : {}),
        },
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return finishRun(ctx);
}
