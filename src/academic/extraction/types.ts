export interface SourceLocation { page?:number;slide?:number;paragraph?:number;sheet?:string;cell?:string;section?:string }
export interface DocumentSegment {id:string;text:string;location:SourceLocation;kind:string}
export interface StructuredDocument {
 sourceId:string;path:string;sha256:string;format:string;title?:string;segments:DocumentSegment[];
 tables:any[];images?:any[];metadata:Record<string,unknown>;warnings:string[];
}
