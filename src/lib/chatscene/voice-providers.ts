import type { VoiceProvider } from "./voice-cast";
import type { VoiceProviderCapabilities, VoiceProviderMode } from "./voice";

export const PROVIDER_CAPABILITIES: Record<string, VoiceProviderCapabilities> = {
  "lovable-ai": { languages:["pt-BR"],maxCharacters:600,controls:{speed:true,pitch:true,energy:true,expressiveness:true,roughness:true,warmth:true,brightness:true,emotion:true},costEstimate:false,local:false },
  elevenlabs: { languages:["pt-BR"],maxCharacters:600,controls:{speed:true,pitch:true,energy:false,expressiveness:false,roughness:false,warmth:false,brightness:false,emotion:false},costEstimate:false,local:false },
  piper: { languages:["pt-BR"],maxCharacters:600,controls:{speed:true,pitch:true,energy:false,expressiveness:false,roughness:false,warmth:false,brightness:false,emotion:false},costEstimate:false,local:true },
  chatterbox: { languages:["pt-BR"],maxCharacters:600,controls:{speed:true,pitch:true,energy:false,expressiveness:false,roughness:false,warmth:false,brightness:false,emotion:false},costEstimate:false,local:true },
  "chatterbox-catalog": { languages:["pt-BR"],maxCharacters:600,controls:{speed:true,pitch:true,energy:false,expressiveness:false,roughness:false,warmth:false,brightness:false,emotion:false},costEstimate:false,local:true },
};

export class VoiceProviderRegistry {
  private providers=new Map<string,VoiceProvider>();
  register(provider:VoiceProvider){this.providers.set(provider.id,provider);return this;}
  get(id:string){return this.providers.get(id);}
  /** Produção exige voz real; ausência de provider é exibida como erro, nunca simulada. */
  resolve(_mode:VoiceProviderMode){ return this.get("lovable-ai"); }
  list(){return [...this.providers.values()];}
}
