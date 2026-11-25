/** A provider contract is separate from the host workflow; no GUI or borrowed login tokens. */
export interface ReasoningProviderCapabilities {id:string;mode:'host'|'supported_api';network:boolean;configured:boolean;automaticGeneration:boolean}
export interface GroundedSourcePacket {sourceId:string;path:string;sha256:string;title?:string;segments:{id:string;text:string;location:Record<string,unknown>;kind:string;excerptTruncated:boolean}[];warnings:string[]}
export interface HostReasoningPacket {requestId:string;taskId:string;provider:'codex_host';status:'awaiting_host_reasoning';instructions:string[];questions:{id:string;text:string;marks:number|null;commandWord:string|null;depthGuidance:string}[];formatting:string[];sources:GroundedSourcePacket[];observations:{name:string;value:string;unit?:string;sourcePath:string;sourceSha256:string;location?:string}[];responseSchema:Record<string,unknown>}
export interface ReasoningProvider {capabilities():ReasoningProviderCapabilities;prepare(packet:HostReasoningPacket):HostReasoningPacket}
export class CodexHostReasoningProvider implements ReasoningProvider {
  capabilities():ReasoningProviderCapabilities{return{id:'codex_host',mode:'host',network:false,configured:true,automaticGeneration:false};}
  prepare(packet:HostReasoningPacket):HostReasoningPacket{return packet;}
}
/** Optional API adapters must implement actual documented network calls when configured. */
export interface EmbeddingProviderContract {readonly id:string;readonly model:string;readonly dimensions:number;embedBatch(texts:string[],signal:AbortSignal):Promise<number[][]>}
