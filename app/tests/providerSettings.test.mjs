import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const secrets=new Map();
globalThis.__providerVault={WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,isAvailableAsync:async()=>true,getItemAsync:async key=>secrets.get(key)||null,deleteItemAsync:async key=>secrets.delete(key),setItemAsync:async(key,value)=>{assert.match(key,/^[a-zA-Z0-9._-]+$/);secrets.set(key,value);}};
const moduleUrl=code=>'data:text/javascript,'+encodeURIComponent(code);
registerHooks({resolve(specifier,context,next){
  if(specifier==='expo-secure-store')return {url:moduleUrl('const v=globalThis.__providerVault;export const {WHEN_UNLOCKED_THIS_DEVICE_ONLY,isAvailableAsync,getItemAsync,deleteItemAsync,setItemAsync}=v;'),shortCircuit:true};
  if(specifier==='../openRouterAuth')return {url:moduleUrl('export const getOpenRouterApiKey=async()=>null;'),shortCircuit:true};
  if(specifier==='./openRouterClient')return {url:moduleUrl('export const DEFAULT_OPENROUTER_MODEL_ID="openrouter/free";'),shortCircuit:true};
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(fileURLToPath(url)))return{url:url.href,shortCircuit:true};}
  return next(specifier,context);
}});
const {normalizeProviderSettings,OPEN_AI_COMPATIBLE_PROVIDERS}=await import('../src/services/aiProviders/registry.ts');
const {storeProviderApiKey,getProviderApiKey,deleteProviderApiKey}=await import('../src/services/aiProviders/credentials.ts');
const {normalizeGuardianProfile,buildGuardianOnDeviceMicroPrompt}=await import('../src/services/guardianProfile.ts');
test('removed providers cannot retain an endpoint that receives another provider credential',()=>{
  assert.deepEqual(OPEN_AI_COMPATIBLE_PROVIDERS.map(p=>p.id),['openRouter','opencode','custom']);
  const saved=normalizeProviderSettings({providerId:'xai',baseUrl:'https://api.x.ai/v1',modelId:'grok'});
  assert.equal(saved.baseUrl,'https://openrouter.ai/api/v1');assert.equal(saved.modelId,'openrouter/free');
  const profile=normalizeGuardianProfile({cloudProviderId:'ollama',cloudBaseUrl:'http://192.0.2.1:11434/v1',cloudModelId:'old-model'});
  assert.equal(profile.cloudBaseUrl,'https://openrouter.ai/api/v1');assert.equal(profile.cloudModelId,'openrouter/free');
});
test('OpenCode credentials use a valid SecureStore key and can be removed',async()=>{
  await storeProviderApiKey('opencode','sample-secret');assert.equal(await getProviderApiKey('opencode'),'sample-secret');
  await deleteProviderApiKey('opencode');assert.equal(await getProviderApiKey('opencode'),null);
});
test('the selected conversation tone is included for small on-device models',()=>{
  const casual=normalizeGuardianProfile({tone:'casual'}),warm=normalizeGuardianProfile({tone:'warm'});
  assert.match(buildGuardianOnDeviceMicroPrompt(casual),/반말/);assert.match(buildGuardianOnDeviceMicroPrompt(warm),/존댓말/);
});
