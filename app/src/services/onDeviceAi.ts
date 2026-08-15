import { Platform } from 'react-native';
import { initLlama, type LlamaContext, type RNLlamaOAICompatibleMessage } from 'llama.rn';

import {
  NativeAiModelStorage,
  type NativeAiModelFile,
  type NativeAiModelsDirectory,
  type NativeAiRuntimeCapacity,
} from '../native';

export type OnDeviceChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  imageUri?: string;
};

export type OnDeviceModelLoadProgress = {
  phase: 'preparing' | 'loading';
  progress: number;
};

const GIB = 1024 * 1024 * 1024;
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
    const content = message.content.trim();
    if (!content) continue;
    const cost = content.length + 24;
    if (selected.length > 0 && used + cost > characterBudget) break;
    selected.unshift(message);
    used += cost;
  }
  return selected;
}

class OnDeviceAiEngine {
  private context: LlamaContext | null = null;
  private modelUri = '';
  private projectorUri = '';
  private operationId = 0;
  private contextSize = 2048;
  private imageTokenLimit = 256;
  private generating = false;

  isLoaded(modelUri?: string) {
    return !!this.context && (!modelUri || this.modelUri === modelUri);
  }

  isVisionReady(projectorUri?: string) {
    return !!this.context && !!this.projectorUri && (!projectorUri || this.projectorUri === projectorUri);
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

    this.contextSize = capacity.totalMemoryBytes < 7 * GIB ? 1024 : 2048;
    this.imageTokenLimit = capacity.totalMemoryBytes < 8 * GIB ? 256 : 384;
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

  async configureVision(
    projector: NativeAiModelFile,
    onProgress?: (progress: OnDeviceModelLoadProgress) => void
  ) {
    const context = this.context;
    if (!context) throw new Error('먼저 대화 모델을 준비해 주세요.');
    if (this.isVisionReady(projector.uri)) return;

    const operationId = this.operationId;
    if (this.projectorUri) {
      await context.releaseMultimodal().catch(() => undefined);
      this.projectorUri = '';
    }

    onProgress?.({ phase: 'preparing', progress: projector.prepared ? 1 : 0 });
    const preparedPath = await requireStorageModule().prepareModel(projector.uri);
    if (operationId !== this.operationId || context !== this.context) return;

    try {
      onProgress?.({ phase: 'loading', progress: 0 });
      const initialized = await context.initMultimodal({
        path: pathToFileUri(preparedPath),
        use_gpu: false,
        image_min_tokens: 128,
        image_max_tokens: this.imageTokenLimit,
      });
      if (!initialized) throw new Error('이 비전 프로젝터를 초기화하지 못했습니다. 모델과 mmproj 조합을 확인해 주세요.');

      const support = await context.getMultimodalSupport();
      if (!support.vision) throw new Error('선택한 mmproj는 이미지 입력을 지원하지 않습니다.');
      if (operationId !== this.operationId || context !== this.context) {
        await context.releaseMultimodal().catch(() => undefined);
        return;
      }
      this.projectorUri = projector.uri;
      onProgress?.({ phase: 'loading', progress: 1 });
    } catch (error) {
      await context.releaseMultimodal().catch(() => undefined);
      this.projectorUri = '';
      throw error;
    }
  }

  async disableVision() {
    const context = this.context;
    this.projectorUri = '';
    if (context) await context.releaseMultimodal().catch(() => undefined);
  }

  async complete(
    messages: OnDeviceChatMessage[],
    onPartial: (content: string) => void,
    imageUri?: string
  ): Promise<string> {
    const context = this.context;
    if (!context) throw new Error('먼저 사용할 GGUF 모델을 선택해 주세요.');
    if (this.generating) throw new Error('이미 답변을 생성하고 있습니다.');
    if (imageUri && !this.isVisionReady()) {
      throw new Error('사진 대화를 사용하려면 이 VLM과 맞는 mmproj 파일을 연결해 주세요.');
    }

    const characterBudget = this.contextSize <= 1024 ? 1200 : 2800;
    const recentMessages = trimConversation(messages, characterBudget);
    const imageMessageId = imageUri ? recentMessages.at(-1)?.id : undefined;
    const promptMessages: RNLlamaOAICompatibleMessage[] = [
      {
        role: 'system',
        content: '당신은 우리들의 아지트를 지키는 작은 숲 지킴이입니다. 다정하고 차분하며 실용적으로 답하세요. 사용자가 다른 언어를 요청하지 않으면 자연스러운 한국어를 사용하고, 모르는 내용은 솔직히 말하세요.',
      },
      ...recentMessages.map((message) => {
        if (imageUri && message.id === imageMessageId) {
          return {
            role: message.role,
            content: [
              { type: 'text', text: message.content },
              { type: 'image_url', image_url: { url: imageUri } },
            ],
          } satisfies RNLlamaOAICompatibleMessage;
        }
        return { role: message.role, content: message.content } satisfies RNLlamaOAICompatibleMessage;
      }),
    ];

    this.generating = true;
    let accumulated = '';
    let lastEmittedAt = 0;
    try {
      const result = await context.completion(
        {
          messages: promptMessages,
          jinja: true,
          enable_thinking: false,
          reasoning_format: 'none',
          force_pure_content: true,
          n_predict: this.contextSize <= 1024 ? 256 : 384,
          temperature: 0.3,
          min_p: 0.15,
          penalty_repeat: 1.05,
          stop: STOP_WORDS,
        },
        (data) => {
          if (typeof data.accumulated_text === 'string') {
            accumulated = data.accumulated_text;
          } else {
            accumulated += data.content ?? data.token ?? '';
          }
          const now = Date.now();
          if (now - lastEmittedAt >= 50) {
            onPartial(accumulated);
            lastEmittedAt = now;
          }
        }
      );
      const finalText = String(result.text || accumulated).trim();
      onPartial(finalText);
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
    this.projectorUri = '';
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
