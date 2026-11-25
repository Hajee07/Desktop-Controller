/** Explicit server-owned media result; document content cannot opt itself into MCP content blocks. */
export class ToolMediaResult {
  constructor(readonly value:unknown,readonly images:{data:string;mimeType:'image/png'|'image/jpeg'}[]){}
}
