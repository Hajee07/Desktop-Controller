using System;

static partial class Program {
 // A missing required COM object is a disconnected/unavailable target, never
 // an empty document. Keep this distinct from optional formatting metadata.
 static dynamic RequireWordObject(object? value,string component) {
  if(value is null || value is DBNull || ReferenceEquals(value,Type.Missing))
   throw new Exception("WORD_OBJECT_UNAVAILABLE: "+component+"; refresh the document/session before retrying");
  return value;
 }
 static string WordText(object? value)=>value is null || value is DBNull || ReferenceEquals(value,Type.Missing)?"":Convert.ToString(value)??"";
 static string WordRangeText(dynamic range)=>WordText(RequireWordObject((object?)range,"Range").Text).TrimEnd('\r','\a');
 static dynamic WordContent(dynamic document)=>RequireWordObject(RequireWordObject((object?)document,"Document").Content,"Document.Content");
 static dynamic WordSources(dynamic document)=>RequireWordObject(RequireWordObject(RequireWordObject((object?)document,"Document").Bibliography,"Document.Bibliography").Sources,"Bibliography.Sources");
 static string WordStyleName(object? value) {
  if(value is null || value is DBNull || ReferenceEquals(value,Type.Missing))return "";
  if(value is string name)return name;
  dynamic style=value;
  return WordText(style.NameLocal);
 }
 static object WordParagraph(dynamic paragraph,string revision,int index) {
  paragraph=RequireWordObject((object?)paragraph,"Paragraph["+index+"]");
  dynamic range=RequireWordObject(paragraph.Range,"Paragraph["+index+"].Range");
  // Range.Style may be null for TOC/field paragraphs even while Paragraph.Style
  // is valid. Paragraph style also avoids reporting a run's character style.
  string style=WordStyleName((object?)paragraph.Style);
  if(style.Length==0)style=WordStyleName((object?)range.Style);
  object? listObject=range.ListFormat;
  bool numberingAvailable=listObject is not null && listObject is not DBNull && !ReferenceEquals(listObject,Type.Missing);
  string number=numberingAvailable?WordText(((dynamic)listObject!).ListString):"";
  return new {index,start=(int)range.Start,end=(int)range.End,text=WordRangeText(range),level=(int)paragraph.OutlineLevel,style,number,styleAvailable=style.Length>0,numberingAvailable,revision};
 }
}
