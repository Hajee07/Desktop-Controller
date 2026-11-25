using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Collections.Generic;

static partial class Program {
 static long OfficeWindow(dynamic d){if(S("office")=="excel")return Convert.ToInt64(d.Windows[1].Hwnd);var processes=System.Diagnostics.Process.GetProcessesByName("POWERPNT");if(processes.Length!=1)throw new Exception("POWERPOINT_MULTIPLE_PROCESSES_AMBIGUOUS");using var process=processes[0];return process.MainWindowHandle.ToInt64();}
 static string OfficeId(dynamic d,dynamic app){if(S("office")=="excel")return Hash(((string)d.FullName).ToLowerInvariant()+"|"+OfficeWindow(d));var p=System.Diagnostics.Process.GetProcessesByName("POWERPNT");if(p.Length!=1)throw new Exception("POWERPOINT_MULTIPLE_PROCESSES_AMBIGUOUS");using var process=p[0];return Hash(((string)d.FullName).ToLowerInvariant()+"|"+process.Id+"|"+process.StartTime.ToUniversalTime().Ticks);}
 static object OfficeInfo(dynamic d,dynamic app)=>new {documentId=OfficeId(d,app),name=(string)d.Name,path=(string)d.Path==""?null:(string)d.FullName,saved=Convert.ToBoolean(d.Saved),windowId=OfficeWindow(d)};
 static object ExcelRange(dynamic d){
  dynamic sheet=d.Worksheets[S("sheet")];dynamic range=sheet.Range[S("range")];if(Convert.ToInt64(range.CountLarge)>1000)throw new Exception("EXCEL_RANGE_LIMIT_1000_CELLS");
  var cells=new List<object>();foreach(dynamic cell in range.Cells)cells.Add(new {address=(string)cell.Address,value=(object?)cell.Value2,formula=(object?)cell.Formula,numberFormat=(object?)cell.NumberFormat});
  return new {sheet=(string)sheet.Name,range=(string)range.Address,cells,revision=Hash(JsonSerializer.Serialize(cells))};
 }
 static object Slides(dynamic d){
  var slides=new List<object>();if((int)d.Slides.Count>200)throw new Exception("POWERPOINT_SLIDE_LIMIT");
  foreach(dynamic slide in d.Slides){var shapes=new List<object>();foreach(dynamic s in slide.Shapes){if(shapes.Count>=200)throw new Exception("POWERPOINT_SHAPE_LIMIT");string text="";if((int)s.HasTextFrame==-1&&((int)s.TextFrame.HasText)==-1)text=(string)s.TextFrame.TextRange.Text;shapes.Add(new {id=(int)s.Id,name=(string)s.Name,text,left=(float)s.Left,top=(float)s.Top,width=(float)s.Width,height=(float)s.Height});}var notes=new List<string>();foreach(dynamic note in slide.NotesPage.Shapes){if((int)note.HasTextFrame==-1&&((int)note.TextFrame.HasText)==-1)notes.Add((string)note.TextFrame.TextRange.Text);}slides.Add(new {id=(int)slide.SlideID,index=(int)slide.SlideIndex,shapes,notes});}
  return new {slides,revision=Hash(JsonSerializer.Serialize(slides))};
 }
 static object OfficeLiveAction(){
  bool excel=S("office")=="excel";string prog=excel?"Excel.Application":"PowerPoint.Application";
  if(S("office")!="excel"&&S("office")!="powerpoint")throw new Exception("OFFICE_KIND_INVALID");
  if(CLSIDFromProgID(prog,out var clsid)!=0)throw new Exception("OFFICE_UNAVAILABLE");object appObject;
  try{GetActiveObject(ref clsid,IntPtr.Zero,out appObject);}catch{if(S("action")=="office-open")appObject=Activator.CreateInstance(Type.GetTypeFromProgID(prog)!)!;else return new {available=false,documents=Array.Empty<object>(),reason="No existing registered session; adapter does not launch applications"};}
  dynamic app=appObject;dynamic collection=excel?app.Workbooks:app.Presentations;
  if(S("action")=="office-open"){
   string file=System.IO.Path.GetFullPath(S("path"));foreach(dynamic opened in collection)if(string.Equals((string)opened.FullName,file,StringComparison.OrdinalIgnoreCase))return OfficeInfo(opened,app);
   int security=(int)app.AutomationSecurity;try{if(excel)app.Visible=true;else app.Visible=-1;app.AutomationSecurity=3;dynamic opened=excel?app.Workbooks.Open(file,0,false):app.Presentations.Open(file,0,0,-1);return OfficeInfo(opened,app);}finally{app.AutomationSecurity=security;}
  }

  if(S("action")=="office-discover"){
   var docs=new List<object>();foreach(dynamic item in collection)docs.Add(OfficeInfo(item,app));string? active=null;try{active=OfficeId(excel?app.ActiveWorkbook:app.ActivePresentation,app);}catch{}
   return new {available=true,documents=docs,activeDocumentId=active,discovery="Existing registered application instance only"};
  }
  object? selected=null;foreach(dynamic item in collection)if(OfficeId(item,app)==S("documentId"))selected=item;
  if(selected==null)throw new Exception("OFFICE_DOCUMENT_DISCONNECTED");dynamic d=selected;
  if((string)d.FullName!=S("path"))throw new Exception("OFFICE_DOCUMENT_DISCONNECTED");
  string action=S("action");
  if(action=="office-properties"){
   var sheets=new List<object>();if(excel)foreach(dynamic s in d.Worksheets)sheets.Add(new {name=(string)s.Name,usedRange=(string)s.UsedRange.Address});
   return new {document=OfficeInfo(d,app),sheets};
  }
  if(action=="office-read")return excel?ExcelRange(d):Slides(d);
  if(action=="office-save"){d.Save();return new {saved=Convert.ToBoolean(d.Saved)};}
  if(action=="office-pdf"){if(excel)d.ExportAsFixedFormat(0,S("destination"));else d.SaveCopyAs(S("destination"),32);return new {exported=true,path=S("destination")};}
  if(action!="office-edit")throw new Exception("OFFICE_ACTION_DENIED");
  object before=excel?ExcelRange(d):Slides(d);string revision=JsonSerializer.SerializeToElement(before).GetProperty("revision").GetString()!;
  if(revision!=S("expectedRevision"))throw new Exception("OFFICE_STALE_REVISION");
  if(File.Exists(S("checkpointPath")))throw new Exception("CHECKPOINT_EXISTS");
  d.SaveCopyAs(S("checkpointPath"));
  string kind=S("kind");
  if(excel){
   if((bool)d.ReadOnly)throw new Exception("EXCEL_READONLY");dynamic range=d.Worksheets[S("sheet")].Range[S("range")];
   if(kind=="values"||kind=="formulas"){
    var rows=data.GetProperty("rows");if(rows.GetArrayLength()!=(int)range.Rows.Count||rows[0].GetArrayLength()!=(int)range.Columns.Count)throw new Exception("EXCEL_DIMENSIONS_MISMATCH");
    object?[,] values=new object?[rows.GetArrayLength(),rows[0].GetArrayLength()];
    for(int i=0;i<rows.GetArrayLength();i++)for(int j=0;j<rows[i].GetArrayLength();j++){var v=rows[i][j];object? value=v.ValueKind==JsonValueKind.Number?v.GetDouble():v.ValueKind==JsonValueKind.True?true:v.ValueKind==JsonValueKind.False?false:v.ValueKind==JsonValueKind.Null?null:v.GetString();if(kind=="values"&&value is string t&&t.StartsWith("="))value="'"+t;values[i,j]=value;}
    if(kind=="formulas")range.Formula=values;else range.Value2=values;range.Calculate();
   }else if(kind=="format"){range.NumberFormat=S("numberFormat");range.Font.Bold=data.GetProperty("bold").GetBoolean();}
   else if(kind=="table"){dynamic t=d.Worksheets[S("sheet")].ListObjects.Add(1,range,Type.Missing,1);t.Name=S("name");}
   else if(kind=="chart"){dynamic chart=d.Worksheets[S("sheet")].ChartObjects().Add(300,20,420,260);chart.Chart.SetSourceData(range);chart.Chart.ChartType=51;}
   else throw new Exception("EXCEL_OPERATION_DENIED");
   return new {applied=true,checkpointPath=S("checkpointPath"),result=ExcelRange(d)};
  }
  if(kind=="add-slide"){int layout=I("layoutSlide");dynamic s=d.Slides.AddSlide((int)d.Slides.Count+1,d.Slides[layout].CustomLayout);if((int)s.Shapes.HasTitle==-1)s.Shapes.Title.TextFrame.TextRange.Text=S("text");}
  else {
   dynamic slide=d.Slides.FindBySlideID(I("slideId"));
   if(kind=="text"){bool found=false;foreach(dynamic s in slide.Shapes)if((int)s.Id==I("shapeId")){s.TextFrame.TextRange.Text=S("text");found=true;break;}if(!found)throw new Exception("POWERPOINT_SHAPE_NOT_FOUND");}
   else if(kind=="image")slide.Shapes.AddPicture(S("imagePath"),0,-1,36,80,400,-1);
   else if(kind=="notes")slide.NotesPage.Shapes.Placeholders[2].TextFrame.TextRange.Text=S("text");
   else if(kind=="table"){var rows=data.GetProperty("rows");int columns=rows[0].GetArrayLength();dynamic table=slide.Shapes.AddTable(rows.GetArrayLength(),columns,36,120,640,Math.Min(350,rows.GetArrayLength()*35)).Table;for(int r=0;r<rows.GetArrayLength();r++)for(int c=0;c<columns;c++)table.Cell(r+1,c+1).Shape.TextFrame.TextRange.Text=rows[r][c].ToString();}

   else throw new Exception("POWERPOINT_OPERATION_DENIED");
  }
  return new {applied=true,checkpointPath=S("checkpointPath"),result=Slides(d)};
 }
}
