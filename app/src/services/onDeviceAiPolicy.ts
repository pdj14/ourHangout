const GIB = 1024 ** 3;

type RuntimeCapacity = {
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  lowMemoryThresholdBytes: number;
  lowMemory: boolean;
  cpuCount?: number;
};

export function modelRuntimePlan(capacity: RuntimeCapacity, modelSizeBytes: number) {
  const reserve = Math.max(512 * 1024 ** 2, capacity.lowMemoryThresholdBytes * 2);
  if (capacity.lowMemory || capacity.availableMemoryBytes < reserve) {
    throw new Error('메모리가 부족해요. 다른 앱을 닫고 다시 시도해 주세요.');
  }
  // mmap avoids eagerly copying all weights into RAM, but the working set must fit.
  if (modelSizeBytes > capacity.totalMemoryBytes * 0.65) {
    throw new Error('이 기기에는 모델이 너무 커요. 더 작은 모델을 선택해 주세요.');
  }
  const headroom = capacity.availableMemoryBytes - reserve;
  const contextSize = capacity.totalMemoryBytes >= 10 * GIB && headroom >= 4 * GIB && modelSizeBytes <= 6 * GIB
    ? 4096 : capacity.totalMemoryBytes >= 7 * GIB && headroom >= 2 * GIB ? 2048 : 1024;
  const cores = Number.isFinite(capacity.cpuCount) ? Math.max(1, Math.floor(capacity.cpuCount!)) : 4;
  return {
    contextSize,
    threadCount: Math.max(1, Math.min(capacity.totalMemoryBytes < 6 * GIB ? 3 : 4, cores - 1)),
    batchSize: contextSize === 1024 ? 128 : 256,
  };
}

export type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** Fits the actual model template, keeping the latest question and reserving output tokens. */
export async function fitPrompt(
  messages: PromptMessage[],
  contextSize: number,
  requestedTokens: number,
  countTokens: (messages: PromptMessage[]) => Promise<number>,
  checkCancelled: () => void = () => {}
) {
  const reserve = Math.min(requestedTokens, Math.floor(contextSize * 0.45));
  const promptBudget = contextSize - reserve - 32;
  let selected = messages.map(message => ({ ...message }));
  for (let attempt = 0; attempt < 24; attempt += 1) {
    checkCancelled();
    const tokens = await countTokens(selected);
    checkCancelled();
    if (tokens <= promptBudget) return { messages: selected, maxTokens: Math.min(requestedTokens, contextSize - tokens - 32) };
    if (selected.length > 2) {
      selected.splice(1, 1);
      // Avoid beginning history with an orphaned assistant reply.
      while (selected.length > 2 && selected[1].role === 'assistant') selected.splice(1, 1);
      continue;
    }
    const system = selected[0];
    const latest = selected.at(-1);
    if (system?.role === 'system' && system.content.length > 160) {
      system.content = system.content.slice(0, Math.max(160, Math.floor(system.content.length * 0.65)));
    } else if (latest && latest !== system && latest.content.length > 120) {
      // Preserve both the question and its ending rather than silently dropping the tail.
      const target = Math.max(120, Math.floor(latest.content.length * 0.65));
      latest.content = `${latest.content.slice(0, Math.floor(target / 2))}\n…\n${latest.content.slice(-Math.floor(target / 2))}`;
    } else {
      throw new Error('이 모델의 대화 공간이 부족해요. 더 짧게 질문하거나 다른 모델을 선택해 주세요.');
    }
  }
  throw new Error('질문을 준비하지 못했어요. 더 짧게 질문해 주세요.');
}
