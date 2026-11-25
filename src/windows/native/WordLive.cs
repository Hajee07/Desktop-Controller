using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Security.Cryptography;

static partial class Program {
 [DllImport("ole32.dll")] static extern int CLSIDFromProgID([MarshalAs(UnmanagedType.LPWStr)]string name,out Guid clsid);
 [DllImport("oleaut32.dll",PreserveSig=false)] static extern void GetActiveObject(ref Guid clsid,IntPtr reserved,[MarshalAs(UnmanagedType.IUnknown)]out object app);
 [DllImport("ole32.dll")] static extern int GetRunningObjectTable(int reserved,out IRunningObjectTable table);
 static readonly Dictionary<string,object> LiveDocs=new();
 static readonly Dictionary<string,object> LiveHeadings=new();
 static string Hash(string value)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
 static dynamic WordWindow(dynamic d){dynamic windows=RequireWordObject(RequireWordObject((object?)d,"Document").Windows,"Document.Windows");if((int)windows.Count<1)throw new Exception("WORD_WINDOW_UNAVAILABLE: document has no live window");return RequireWordObject(windows[1],"Document.Windows[1]");}
 static string DocId(dynamic d)=>Hash(WordText(RequireWordObject((object?)d,"Document").FullName).ToLowerInvariant()+"|"+(int)WordWindow(d).Hwnd);
 static object DocInfo(dynamic d)=>new {documentId=DocId(d),name=WordText(d.Name),path=WordText(d.Path)==""?null:WordText(d.FullName),saved=(bool)d.Saved,readOnly=(bool)d.ReadOnly,windowId=(int)WordWindow(d).Hwnd};
 static object DiscoverWord(){
  var apps=new Dictionary<int,object>();
  void Add(object? candidate){try{dynamic app=RequireWordObject(candidate,"Application");if(WordText(app.Name).Contains("Word"))apps[(int)RequireWordObject(RequireWordObject(app.Windows,"Application.Windows")[1],"Application.Window").Hwnd]=app;}catch{}}
  if(CLSIDFromProgID("Word.Application",out var clsid)==0){try{GetActiveObject(ref clsid,IntPtr.Zero,out var app);Add(app);}catch(COMException){}}
  GetRunningObjectTable(0,out var rot);rot.EnumRunning(out var iterator);var monikers=new IMoniker[1];
  while(iterator.Next(1,monikers,IntPtr.Zero)==0){try{rot.GetObject(monikers[0],out var obj);if(obj!=null){try{dynamic doc=obj;Add(doc.Application);}catch{}}}catch{}finally{if(monikers[0]!=null)Marshal.ReleaseComObject(monikers[0]);}}
  Marshal.ReleaseComObject(iterator);Marshal.ReleaseComObject(rot);
  var docs=new List<object>();var active=new List<string>();LiveDocs.Clear();
  foreach(dynamic app in apps.Values){foreach(dynamic item in RequireWordObject(app.Documents,"Application.Documents")){dynamic doc=RequireWordObject((object?)item,"Document");string id=DocId(doc);LiveDocs[id]=doc;docs.Add(DocInfo(doc));}try{active.Add(DocId(app.ActiveDocument));}catch{}}
  return new {documents=docs,activeDocumentIds=active.Distinct().ToArray(),attachedInstances=apps.Count,runningProcesses=System.Diagnostics.Process.GetProcessesByName("WINWORD").Length,discovery="Existing ROT-registered sessions only; unavailable instances are not launched"};
 }
 static dynamic LiveDocument(){
  if(!LiveDocs.TryGetValue(S("documentId"),out var obj)){DiscoverWord();if(!LiveDocs.TryGetValue(S("documentId"),out obj))throw new Exception("WORD_DOCUMENT_DISCONNECTED");}
  dynamic d=RequireWordObject(obj,"Document");try{if(DocId(d)!=S("documentId"))throw new Exception("WORD_DOCUMENT_ID_CHANGED");_ = WordContent(d).End;}catch{LiveDocs.Remove(S("documentId"));throw new Exception("WORD_DOCUMENT_DISCONNECTED");}
  if((string)d.FullName!=S("path"))throw new Exception("WORD_DOCUMENT_PATH_CHANGED");return d;
 }
 static object RangeInfo(dynamic r,string revision){r=RequireWordObject((object?)r,"Range");return new {start=(int)r.Start,end=(int)r.End,text=WordRangeText(r),revision};}
 static dynamic LiveRange(dynamic d,JsonElement item){int start=item.GetProperty("start").GetInt32(),end=item.GetProperty("end").GetInt32();if(start<0||end<start||end>(int)WordContent(d).End-1)throw new Exception("WORD_RANGE_INVALID");return RequireWordObject(d.Range(start,end),"Document.Range");}
 static object WordLiveAction(){
  Desktop();string action=S("action");if(action=="editor-open"){Present();var start=new System.Diagnostics.ProcessStartInfo(S("executable")){UseShellExecute=true};start.ArgumentList.Add("--reuse-window");start.ArgumentList.Add("--goto");start.ArgumentList.Add(S("path")+":"+I("line")+":"+I("column"));var process=System.Diagnostics.Process.Start(start);return new {dispatched=true,pid=process?.Id,path=S("path"),line=I("line"),reuseWindow=true};}if(action=="capture"||action=="image-transform"||action=="monitors")return MediaAction();if(action.StartsWith("office-"))return OfficeLiveAction();if(action=="discover")return DiscoverWord();
  if(action=="open"){
   string file=System.IO.Path.GetFullPath(S("path"));dynamic app;object? appObject=null;
   if(CLSIDFromProgID("Word.Application",out var clsid)!=0)throw new Exception("WORD_UNAVAILABLE");
   try{GetActiveObject(ref clsid,IntPtr.Zero,out appObject);}catch{appObject=Activator.CreateInstance(Type.GetTypeFromProgID("Word.Application")!);}
   app=RequireWordObject(appObject,"Application");dynamic documents=RequireWordObject(app.Documents,"Application.Documents");foreach(dynamic item in documents){dynamic existing=RequireWordObject((object?)item,"Document");if(string.Equals((string)existing.FullName,file,StringComparison.OrdinalIgnoreCase))return DocInfo(existing);}
   dynamic options=RequireWordObject(app.Options,"Application.Options");int security=(int)app.AutomationSecurity;bool links=(bool)options.UpdateLinksAtOpen;
   try{app.AutomationSecurity=3;options.UpdateLinksAtOpen=false;dynamic opened=RequireWordObject(documents.Open(FileName:file,ConfirmConversions:false,ReadOnly:false,AddToRecentFiles:false,Visible:true),"OpenedDocument");app.Visible=true;LiveDocs[DocId(opened)]=opened;return DocInfo(opened);}finally{app.AutomationSecurity=security;options.UpdateLinksAtOpen=links;}
  }
  dynamic d=LiveDocument();string sourceXml=ReadWordXml(d),revision=WordXmlRevision(sourceXml,WordXmlLimit());
  if(action=="references")return ReadReferences(d,revision);
  if(action=="headings"){
   string key=S("documentId")+":"+revision;if(LiveHeadings.TryGetValue(key,out var cached))return cached;
   var headings=new List<object>();int i=0;dynamic collection=RequireWordObject(d.Paragraphs,"Document.Paragraphs");
   foreach(dynamic item in collection){dynamic p=RequireWordObject((object?)item,"Paragraph");++i;if((int)p.OutlineLevel<10)headings.Add(WordParagraph(p,revision,i));}
   object result=new {documentId=S("documentId"),revision,headings};
   if(LiveHeadings.Count>=8)LiveHeadings.Remove(LiveHeadings.Keys.First());LiveHeadings[key]=result;return result;
  }
  if(action=="section"){
   if(S("expectedRevision")!=revision)throw new Exception("WORD_STALE_REVISION: expected="+S("expectedRevision")+" actual="+revision);dynamic range=LiveRange(d,data);var paragraphs=new List<object>();int i=0;
   foreach(dynamic p in RequireWordObject(range.Paragraphs,"Range.Paragraphs")){dynamic paragraphRange=RequireWordObject(RequireWordObject((object?)p,"Paragraph").Range,"Paragraph.Range");if((int)paragraphRange.Start>=I("end"))break;if(paragraphs.Count>=2000)throw new Exception("WORD_SECTION_LIMIT: use paginated word_get_paragraphs");paragraphs.Add(WordParagraph(p,revision,++i));}
   return new {documentId=S("documentId"),revision,paragraphs};
  }
  if(action=="checkpoint"){using(var output=new FileStream(S("checkpointPath"),FileMode.CreateNew,FileAccess.Write))using(var writer=new StreamWriter(output,new UTF8Encoding(false),65536)){writer.Write(sourceXml);}return new {revision,checkpointPath=S("checkpointPath")};}
  if(action=="properties")return new {document=DocInfo(d),revision,checkpointBytes=Encoding.UTF8.GetByteCount(sourceXml),contentEnd=(int)WordContent(d).End,paragraphs=(int)RequireWordObject(d.Paragraphs,"Document.Paragraphs").Count,tables=(int)RequireWordObject(d.Tables,"Document.Tables").Count,images=(int)RequireWordObject(d.InlineShapes,"Document.InlineShapes").Count,trackChanges=(bool)d.TrackRevisions};
  if(action=="read"){
   dynamic collection=RequireWordObject(d.Paragraphs,"Document.Paragraphs");var rows=new List<object>();int offset=I("offset"),limit=Math.Clamp(I("limit"),1,200),count=(int)collection.Count;
   for(int i=offset+1;i<=Math.Min(count,offset+limit);i++)rows.Add(WordParagraph(collection[i],revision,i));
   return new {documentId=S("documentId"),revision,total=count,offset,hasMore=offset+limit<count,paragraphs=rows};
  }
  if(action=="tables"){
   var tables=new List<object>();int offset=I("offset"),limit=Math.Clamp(I("limit"),1,20);
   dynamic collection=RequireWordObject(d.Tables,"Document.Tables");for(int index=offset+1;index<=Math.Min((int)collection.Count,offset+limit);index++){dynamic table=RequireWordObject(collection[index],"Table"),range=RequireWordObject(table.Range,"Table.Range");var cells=new List<object>();foreach(dynamic item in RequireWordObject(range.Cells,"Table.Cells")){dynamic cell=RequireWordObject((object?)item,"Cell");if(cells.Count>=1000)throw new Exception("WORD_TABLE_CELL_LIMIT");cells.Add(new {row=(int)cell.RowIndex,column=(int)cell.ColumnIndex,text=WordRangeText(cell.Range)});}tables.Add(new {index,start=(int)range.Start,end=(int)range.End,cells});}
   return new {documentId=S("documentId"),revision,tables,total=(int)collection.Count};
  }
  if(action=="selection"){dynamic app=RequireWordObject(d.Application,"Application");if(app.ActiveDocument==null||DocId(app.ActiveDocument)!=S("documentId"))throw new Exception("WORD_TARGET_NOT_ACTIVE");return RangeInfo(RequireWordObject(app.Selection,"Application.Selection").Range,revision);}
  if(action=="range")return RangeInfo(LiveRange(d,data),revision);
  if(S("expectedRevision")!=revision)throw new Exception("WORD_STALE_REVISION: expected="+S("expectedRevision")+" actual="+revision);
  if(action=="navigate"){d.Activate();LiveRange(d,data).Select();return new {navigated=true,documentId=S("documentId"),revision};}
  if((bool)d.ReadOnly||(int)d.ProtectionType!=-1)throw new Exception("WORD_DOCUMENT_PROTECTED");
  if(action=="save"){d.Save();return new {saved=(bool)d.Saved,revision=Revision(d)};}
  if(action=="pdf"){d.ExportAsFixedFormat(S("destination"),17);return new {path=S("destination"),revision};}
  if(action=="undo"){bool ok=d.Undo(1);return new {undone=ok,revision=Revision(d)};}
  if(action!="edit"&&action!="restore")throw new Exception("WORD_ACTION_DENIED");
  using(var output=new FileStream(S("checkpointPath"),FileMode.CreateNew,FileAccess.Write))using(var writer=new StreamWriter(output,new UTF8Encoding(false),65536)){writer.Write(sourceXml);}
  string before=revision;int applied=0;string operationContext="";var addedSources=new List<string>();dynamic undoRecord=RequireWordObject(RequireWordObject(d.Application,"Application").UndoRecord,"Application.UndoRecord");undoRecord.StartCustomRecord("Windows Laptop Control MCP");
  try{
   if(action=="restore"){WordContent(d).InsertXML(File.ReadAllText(S("restorePath"),Encoding.UTF8));applied=1;}
   else {
    bool refreshReferences=false;
    // Descending positions preserve offsets across a batch. No conflicting ranges.
    foreach(var op in data.GetProperty("operations").EnumerateArray().OrderByDescending(o=>o.GetProperty("start").GetInt32())){
     string kind=op.GetProperty("kind").GetString()!;operationContext=kind+" ["+op.GetProperty("start").GetInt32()+","+op.GetProperty("end").GetInt32()+"]";dynamic r=LiveRange(d,op);
     string Text(string key)=>op.TryGetProperty(key,out var v)?v.GetString()??"":"";
     if(kind=="insert"){r.Collapse(1);r.Text=Text("text").Replace("\n","\r");}
     else if(kind=="replace")r.Text=Text("text").Replace("\n","\r");
     else if(kind=="style")r.Style=Text("style");
     else if(kind=="image"){r.Collapse(1);dynamic pic=RequireWordObject(RequireWordObject(d.InlineShapes,"Document.InlineShapes").AddPicture(Text("path"),false,true,r),"InsertedImage");pic.LockAspectRatio=-1;pic.Width=op.GetProperty("widthPt").GetDouble();if(Text("text")!=""){dynamic picRange=RequireWordObject(pic.Range,"Image.Range");dynamic after=RequireWordObject(d.Range((int)picRange.End,(int)picRange.End),"Image.AfterRange");after.InsertAfter("\r"+Text("text").Replace("\n","\r")+"\r");}}
     else if(kind=="table"){
      r.Collapse(1);var rows=op.GetProperty("rows");int columns=rows[0].GetArrayLength();dynamic table=RequireWordObject(RequireWordObject(d.Tables,"Document.Tables").Add(r,rows.GetArrayLength(),columns),"InsertedTable");RequireWordObject(table.Range,"Table.Range").Style=-1;
      for(int i=0;i<rows.GetArrayLength();i++)for(int j=0;j<columns;j++)RequireWordObject(RequireWordObject(table.Cell(i+1,j+1),"Table.Cell").Range,"Cell.Range").Text=rows[i][j].GetString()??"";
     }
     else if(kind=="cell"){dynamic table=RequireWordObject(RequireWordObject(d.Tables,"Document.Tables")[op.GetProperty("table").GetInt32()],"Table");dynamic cell=RequireWordObject(RequireWordObject(table.Cell(op.GetProperty("row").GetInt32(),op.GetProperty("column").GetInt32()),"Table.Cell").Range,"Cell.Range");cell.End-=1;cell.Text=Text("text");}
     else if(kind=="track")d.TrackRevisions=op.GetProperty("enabled").GetBoolean();
     else if(kind=="format"){
      bool hasItalic=op.TryGetProperty("italic",out var italic);dynamic rangeFont=RequireWordObject(r.Font,"Range.Font");
      if(op.TryGetProperty("font",out var font))rangeFont.Name=font.GetString();else if(!hasItalic)rangeFont.Name="Times New Roman";
      if(op.TryGetProperty("fontSizePt",out var size))rangeFont.Size=size.GetDouble();else if(!hasItalic)rangeFont.Size=12;
      if(op.TryGetProperty("bold",out var bold))rangeFont.Bold=bold.GetBoolean()?-1:0;else if(!hasItalic)rangeFont.Bold=0;
      if(hasItalic)rangeFont.Italic=italic.GetBoolean()?-1:0;
      if(op.TryGetProperty("spaceAfterPt",out var spacing))RequireWordObject(r.ParagraphFormat,"Range.ParagraphFormat").SpaceAfter=spacing.GetDouble();else if(!hasItalic)RequireWordObject(r.ParagraphFormat,"Range.ParagraphFormat").SpaceAfter=6;
      if(op.TryGetProperty("alignment",out var alignment))RequireWordObject(r.ParagraphFormat,"Range.ParagraphFormat").Alignment=alignment.GetInt32();else if(!hasItalic)RequireWordObject(r.ParagraphFormat,"Range.ParagraphFormat").Alignment=0;
     }
     else if(kind=="header-footer"){dynamic section=RequireWordObject(RequireWordObject(d.Sections,"Document.Sections")[op.GetProperty("section").GetInt32()],"Section");dynamic header=RequireWordObject(RequireWordObject(section.Headers,"Section.Headers")[1],"Header"),footer=RequireWordObject(RequireWordObject(section.Footers,"Section.Footers")[1],"Footer");RequireWordObject(header.Range,"Header.Range").Text=Text("header");RequireWordObject(footer.Range,"Footer.Range").Text=Text("footer");if(op.GetProperty("pageNumbers").GetBoolean())RequireWordObject(footer.PageNumbers,"Footer.PageNumbers").Add();}
     else if(kind=="toc"){r.Collapse(1);RequireWordObject(d.TablesOfContents,"Document.TablesOfContents").Add(r,true,1,3);}
     else if(kind=="bibliography-refresh")refreshReferences=true;
     else if(kind is "citation" or "bibliography" or "reference-source"){ReferenceOperation(d,r,op,kind,addedSources);refreshReferences|=kind=="bibliography";}

     else throw new Exception("WORD_EDIT_KIND_DENIED");
     applied++;
    }
    if(refreshReferences)RefreshReferences(d);
   }
  }catch(Exception error){
   undoRecord.EndCustomRecord();
   bool changed=Revision(d)!=before;
   if(changed&&!((bool)d.Undo(1)))throw new Exception("WORD_EDIT_ROLLBACK_FAILED: "+operationContext+"; inspect the live document before retrying",error);
   foreach(string tag in addedSources){dynamic sources=WordSources(d);for(int i=(int)sources.Count;i>=1;i--){dynamic source=RequireWordObject(sources[i],"Bibliography.Source");if(string.Equals(WordText(source.Tag),tag,StringComparison.OrdinalIgnoreCase))source.Delete();}}
   if(error.Message.Contains("not allowed to edit this selection because it is protected",StringComparison.OrdinalIgnoreCase))throw new Exception("WORD_SELECTION_PROTECTED: "+operationContext+"; Word has locked this target range. Inspect content controls/edit restrictions; no protection was removed. Rollback="+(changed?"performed":"not needed"),error);
   throw;
  }
  undoRecord.EndCustomRecord();return new {documentId=S("documentId"),beforeRevision=before,revision=Revision(d),applied,saved=(bool)d.Saved,checkpointPath=S("checkpointPath")};
 }
 static int WordLiveLoop(){
  string? line;while((line=Console.ReadLine())!=null){try{data=JsonDocument.Parse(line).RootElement;Console.WriteLine(JsonSerializer.Serialize(new {ok=true,result=WordLiveAction()}));}catch(Exception e){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error=e.Message}));}}
  LiveDocs.Clear();return 0;
 }
}
