import { Platform } from 'react-native';
import { initLlama, type LlamaContext, type RNLlamaOAICompatibleMessage } from 'llama.rn';

import {
  NativeAiModelStorage,
  type NativeAiModelFile,
  type NativeAiModelsDirectory,
  type NativeAiRuntimeCapacity,
} from '../native';
import type { OnDeviceResponseLength } from './guardianProfile';
import type { ChatAttachment } from '../types';

export type OnDeviceChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachment?: ChatAttachment;
};

export type OnDeviceModelLoadProgress = {
  phase: 'preparing' | 'loading';
  progress: number;
};

export type OnDeviceCompletionOptions = {
  maxTokens?: number;
  systemPrompt?: string;
  responseLength?: OnDeviceResponseLength;
  onContinuation?: () => void;
};

const GIB = 1024 * 1024 * 1024;
const LOCAL_CONTINUATION_TAIL_CHARS = 1200;
const STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<|endoftext|>',
  // LFM 계열 특수 토큰과 소형 모델에서 흔한 역할 누출 방지.
  '<|sep|>',
  '<|pad|>',
  '\nUser:',
  '\nAssistant:',
];

function requireStorageModule() {
  if (Platform.OS !== 'android' || !NativeAiModelStorage) {
    throw new Error('온디바이스 AI는 네이티브 모듈이 포함된 Android 빌드에서만 사용할 수 있습니다.');
  }
  return NativeAiModelStorage;
}

export async function getOnDeviceModels(): Promise<NativeAiModelsDirectory> {
  return requireStorageModule().getModels();
}

export async function pickOnDeviceModelsDirectory(): Promise<NativeAiModelsDirectory> {
  return requireStorageModule().pickModelsDirectory();
}

export async function getOnDeviceRuntimeCapacity(): Promise<NativeAiRuntimeCapacity> {
  return requireStorageModule().getRuntimeCapacity();
}

function pathToFileUri(path: string) {
  if (path.startsWith('file://')) return path;
  return `file://${path}`;
}

function trimConversation(messages: OnDeviceChatMessage[], characterBudget: number) {
  const selected: OnDeviceChatMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0 && selected.length < 10; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    let content = message.content.trim();
    if (!content) continue;
    if (selected.length === 0 && content.length > characterBudget) {
      content = content.slice(0, characterBudget);
    }
    const cost = content.length + 24;
    if (selected.length > 0 && used + cost > characterBudget) break;
    selected.unshift({ ...message, content });
    used += cost;
  }
  return selected;
}

function selectContextSize(capacity: NativeAiRuntimeCapacity, modelSizeBytes: number) {
  const highMemoryDevice = capacity.totalMemoryBytes >= 10 * GIB
    && capacity.availableMemoryBytes >= 4 * GIB
    && (modelSizeBytes <= 0 || modelSizeBytes <= 6 * GIB);
  if (highMemoryDevice) return 4096;
  if (capacity.totalMemoryBytes >= 7 * GIB && capacity.availableMemoryBytes >= 2 * GIB) return 2048;
  return 1024;
}

function maxPredictTokensFor(contextSize: number, responseLength: OnDeviceResponseLength) {
  if (contextSize >= 4096) {
    if (responseLength === 'short') return 512;
    return responseLength === 'long' ? 1536 : 1280;
  }
  if (contextSize >= 2048) {
    if (responseLength === 'short') return 384;
    return responseLength === 'long' ? 1024 : 768;
  }
  if (responseLength === 'short') return 256;
  return responseLength === 'long' ? 512 : 384;
}

function mergeContinuation(base: string, continuation: string) {
  const left = base.trimEnd();
  const right = continuation.trimStart();
  if (!left) return right;
  if (!right) return left;
  const maxOverlap = Math.min(400, left.length, right.length);
  for (let size = maxOverlap; size >= 20; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return `${left}${right.slice(size)}`;
    }
  }
  return `${left}\n${right}`;
}

function completionReachedLimit(
  result: Awaited<ReturnType<LlamaContext['completion']>>,
  requestedTokens: number
) {
  return !!result.truncated
    || !!result.context_full
    || Number(result.stopped_limit || 0) > 0
    || (
      Number(result.tokens_predicted || 0) >= requestedTokens - 1
      && !result.stopped_eos
      && !result.stopped_word
      && !result.interrupted
    );
}

function stripReasoningBlocks(value: string) {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<analysis>[\s\S]*$/gi, '')
    .trim();
}

class OnDeviceAiEngine {
  private context: LlamaContext | null = null;
  private modelUri = '';
  private operationId = 0;
  private contextSize = 2048;
  private generating = false;

  isLoaded(modelUri?: string) {
    return !!this.context && (!modelUri || this.modelUri === modelUri);
  }

  async loadModel(
    model: NativeAiModelFile,
    onProgress?: (progress: OnDeviceModelLoadProgress) => void
  ) {
    if (this.isLoaded(model.uri)) return;
    const operationId = ++this.operationId;
    await this.releaseContext();

    const storage = requireStorageModule();
    const capacity = await storage.getRuntimeCapacity();
    if (capacity.lowMemory) {
      throw new Error('현재 기기 메모리가 부족합니다. 다른 앱을 종료한 뒤 다시 시도해 주세요.');
    }
    if (model.sizeBytes > 0 && capacity.availableStorageBytes < model.sizeBytes + 128 * 1024 * 1024) {
      throw new Error('모델을 준비할 저장 공간이 부족합니다. 기기 저장 공간을 확보해 주세요.');
    }

    onProgress?.({ phase: 'preparing', progress: model.prepared ? 1 : 0 });
    const preparedPath = await storage.prepareModel(model.uri);
    if (operationId !== this.operationId) return;

    this.contextSize = selectContextSize(capacity, model.sizeBytes);
    const threadCount = capacity.totalMemoryBytes < 6 * GIB ? 3 : 4;
    onProgress?.({ phase: 'loading', progress: 0 });

    const nextContext = await initLlama(
      {
        model: pathToFileUri(preparedPath),
        n_ctx: this.contextSize,
        n_batch: 256,
        n_ubatch: 128,
        n_parallel: 1,
        n_threads: threadCount,
        n_gpu_layers: 0,
        flash_attn_type: 'off',
        use_mmap: true,
        use_mlock: false,
        no_extra_bufts: true,
        ctx_shift: false,
        state_cache_budget_mb: 0,
        state_cache_max_checkpoints: 0,
      },
      (progress) => onProgress?.({
        phase: 'loading',
        progress: Math.max(0, Math.min(1, progress / 100)),
      })
    );

    if (operationId !== this.operationId) {
      await nextContext.release().catch(() => undefined);
      return;
    }
    this.context = nextContext;
    this.modelUri = model.uri;
    onProgress?.({ phase: 'loading', progress: 1 });
  }

  async complete(
    messages: OnDeviceChatMessage[],
    onPartial: (content: string) => void,
    options: OnDeviceCompletionOptions = {}
  ): Promise<string> {
    const context = this.context;
    if (!context) throw new Error('먼저 사용할 GGUF 모델을 선택해 주세요.');
    if (this.generating) throw new Error('이미 답변을 생성하고 있습니다.');

    const characterBudget = this.contextSize >= 4096 ? 4000 : this.contextSize >= 2048 ? 1800 : 900;
    const recentMessages = trimConversation(messages, characterBudget);
    const defaultSystemPrompt = '당신은 우리들의 아지트를 지키는 작은 숲 지키미입니다. 다정하고 차분하며 실용적으로 답하세요. 확실하지 않은 내용은 꾸며내지 말고, 내부 사고 과정은 보여주지 마세요.';
    const systemPrompt = String(options.systemPrompt || defaultSystemPrompt)
      .trim()
      .slice(0, this.contextSize >= 4096 ? 3600 : this.contextSize >= 2048 ? 2400 : 1200);
    const promptMessages: RNLlamaOAICompatibleMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...recentMessages.map((message) => (
        { role: message.role, content: message.content } satisfies RNLlamaOAICompatibleMessage
      )),
    ];

    this.generating = true;
    let visibleContent = '';
    let lastEmittedAt = 0;
    const responseLength = options.responseLength || 'balanced';
    const maxPredictTokens = maxPredictTokensFor(this.contextSize, responseLength);
    const requestedTokens = Math.max(
      64,
      Math.min(
        maxPredictTokens,
        Math.floor(options.maxTokens || Number.POSITIVE_INFINITY)
      )
    );
    try {
      const result = await context.completion(
        {
          messages: promptMessages,
          jinja: true,
          enable_thinking: false,
          reasoning_format: 'none',
          n_predict: requestedTokens,
          temperature: 0.12,
          min_p: 0.15,
          penalty_repeat: 1.05,
          stop: STOP_WORDS,
        },
        (data) => {
          if (typeof data.content !== 'string') return;
          visibleContent = stripReasoningBlocks(data.content);
          if (!visibleContent) return;
          const now = Date.now();
          if (now - lastEmittedAt >= 50) {
            onPartial(visibleContent);
            lastEmittedAt = now;
          }
        }
      );
      let finalText = stripReasoningBlocks(String(result.content || visibleContent || result.text || ''));
      onPartial(finalText);

      if (
        responseLength !== 'short'
        && finalText
        && completionReachedLimit(result, requestedTokens)
        && !result.interrupted
      ) {
        options.onContinuation?.();
        const previousTail = finalText.slice(-LOCAL_CONTINUATION_TAIL_CHARS);
        let continuationVisible = '';
        let continuationEmittedAt = 0;
        const continuationTokens = Math.min(
          requestedTokens,
          responseLength === 'long' ? 1024 : 768
        );
        const continuationResult = await context.completion(
          {
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: [
                  '이전 답변이 출력 한도에서 끊겼습니다.',
                  '앞부분을 반복하거나 새로 시작하지 말고 아래 끝부분 바로 다음부터 자연스럽게 이어서 답변을 완성하세요.',
                  '',
                  '[이전 답변 끝부분]',
                  previousTail,
                ].join('\n'),
              },
            ],
            jinja: true,
            enable_thinking: false,
            reasoning_format: 'none',
            n_predict: continuationTokens,
            temperature: 0.12,
            min_p: 0.15,
            penalty_repeat: 1.08,
            stop: STOP_WORDS,
          },
          (data) => {
            if (typeof data.content !== 'string') return;
            continuationVisible = stripReasoningBlocks(data.content);
            if (!continuationVisible) return;
            const now = Date.now();
            if (now - continuationEmittedAt >= 50) {
              onPartial(mergeContinuation(finalText, continuationVisible));
              continuationEmittedAt = now;
            }
          }
        );
        const continuationText = stripReasoningBlocks(String(
          continuationResult.content || continuationVisible || continuationResult.text || ''
        ));
        finalText = mergeContinuation(finalText, continuationText);
        onPartial(finalText);
      }
      return finalText;
    } finally {
      this.generating = false;
    }
  }

  async clearConversation() {
    if (this.context) await this.context.clearCache(true);
  }

  async stop() {
    if (this.context && this.generating) await this.context.stopCompletion();
  }

  async unload() {
    this.operationId += 1;
    await this.stop().catch(() => undefined);
    await this.releaseContext();
  }

  private async releaseContext() {
    const context = this.context;
    this.context = null;
    this.modelUri = '';
    this.generating = false;
    if (context) await context.release().catch(() => undefined);
  }
}

export const onDeviceAiEngine = new OnDeviceAiEngine();

export function isFolderPickerCancellation(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('AI_MODELS_PICK_CANCELLED') || message.includes('selection was cancelled');
}

export function normalizeOnDeviceAiError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const message = String(error || '').trim();
  return message || '온디바이스 AI 처리 중 오류가 발생했습니다.';
}
