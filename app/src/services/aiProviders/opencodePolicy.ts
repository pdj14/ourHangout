/** Chat Completions subset of https://opencode.ai/v2/docs/console/models/.
 * Responses, Anthropic Messages, Gemini and System One models use different wire protocols.
 */
export function isOpenCodeChatModel(id: string) {
  return id === 'big-pickle' || id === 'qwen3.8-max'
    || /^(deepseek-|minimax-|glm-|kimi-|mistral-|beam-|flint-|longcat-|exo-|mimo-|nemotron-)/.test(id.toLowerCase());
}
