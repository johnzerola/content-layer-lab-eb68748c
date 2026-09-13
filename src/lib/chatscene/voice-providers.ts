import { decodeClip, type VoiceClip, type VoiceProvider } from "./voice-cast";
import { voiceKey, voicePreset, type MessageVoiceDirection, type VoiceProfile, type VoiceProviderCapabilities, type VoiceProviderMode } from "./voice";

export const PROVIDER_CAPABILITIES: Record<string, VoiceProviderCapabilities> = {
  mock: { languages:["pt-BR"],maxCharacters:600,controls:{speed:true,pitch:true,energy:true,expressiveness:false,roughness:false,warmth:false,brightness:false,emotion:true},costEstimate:false,local:true },
  "lovable-ai": { languages:["pt-BR"],maxCharacters:600,controls:{speed:true,pitch:true,energy:true,expressiveness:true,roughness:true,warmth:true,brightness:true,emotion:true},costEstimate:false,local:false },
};

function wavTone(seconds:number, frequency:number): Blob {
  const rate=24000, count=Math.round(rate*seconds), bytes=new ArrayBuffer(44+count*2), view=new DataView(bytes);
  const put=(o:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
  put(0,"RIFF"); view.setUint32(4,36+count*2,true); put(8,"WAVEfmt "); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,rate,true); view.setUint32(28,rate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); put(36,"data"); view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const env=Math.min(1,i/(rate*.04))*Math.min(1,(count-i)/(rate*.08)); const wave=Math.sin(2*Math.PI*frequency*i/rate)*.14*env; view.setInt16(44+i*2,Math.round(wave*32767),true);}
  return new Blob([bytes],{type:"audio/wav"});
}

export function createMockVoiceProvider(): VoiceProvider {
  return {
    id:"mock",
    listVoices: async()=>[],
    getCapabilities:()=>PROVIDER_CAPABILITIES["mock"]!,
    previewVoice: async(profile,text)=>createMockVoiceProvider().synthesize(text,profile),
    async synthesize(text: string, profile: VoiceProfile, direction?: MessageVoiceDirection): Promise<VoiceClip> {
      const key=voiceKey(text,profile,direction); const seconds=Math.max(.65,Math.min(3.2,text.length/18))/Math.max(.7,profile.speed*(direction?.speedMultiplier??1)); const frequency=190+(voicePreset(profile.presetId).gender==="feminina"?90:0)+(profile.pitch??0)*8; return decodeClip(key,wavTone(seconds,frequency));
    },
  };
}

export class VoiceProviderRegistry {
  private providers=new Map<string,VoiceProvider>();
  register(provider:VoiceProvider){this.providers.set(provider.id,provider);return this;}
  get(id:string){return this.providers.get(id);}
  /** O provedor real é sempre a primeira escolha; o simulador só existe para testes. */
  resolve(_mode:VoiceProviderMode){ return this.get("lovable-ai")??this.get("mock"); }
  list(){return [...this.providers.values()];}
}
