using System.Xml.Linq;
using System;
using System.Collections.Generic;
using System.Text.Json;

static partial class Program {
 static readonly XNamespace Bib = "http://schemas.microsoft.com/office/word/2004/10/bibliography";
 static object ReadReferences(dynamic document, string revision) {
  int offset=I("offset"), limit=Math.Clamp(I("limit"),1,100);
  dynamic sources=WordSources(document);
  int sourceCount=(int)sources.Count;
  var entries=new List<object>();
  for(int i=offset+1;i<=Math.Min(sourceCount,offset+limit);i++) {
   dynamic item=RequireWordObject(sources[i],"Bibliography.Source");
   entries.Add(new {tag=WordText(item.Tag),xml=WordText(item.XML)});
  }
  var fields=new List<object>();
  int count=0;
  foreach(dynamic entry in RequireWordObject(document.Fields,"Document.Fields")) {
   dynamic field=RequireWordObject((object?)entry,"Field");
   int type=(int)field.Type;
   if(type!=96&&type!=97)continue;
   if(count++<offset||fields.Count>=limit)continue;
   dynamic code=RequireWordObject(field.Code,"Field.Code"),result=RequireWordObject(field.Result,"Field.Result");
   fields.Add(new {kind=type==96?"citation":"bibliography",code=WordText(code.Text).Trim(),text=WordText(result.Text).Trim(),start=(int)code.Start-1,end=(int)result.End+1});
  }
  return new {revision,style=WordText(document.Bibliography.BibliographyStyle),sources=entries,fields,sourceCount,fieldCount=count,offset};
 }

 static void RefreshReferences(dynamic document) {
  foreach(dynamic entry in RequireWordObject(document.Fields,"Document.Fields")){dynamic field=RequireWordObject((object?)entry,"Field");if((int)field.Type is 96 or 97)field.Update();}
 }

 static void ReferenceOperation(dynamic document,dynamic range,JsonElement op,string kind,List<string> added) {
  if(kind=="bibliography") { RequireWordObject(document.Fields,"Document.Fields").Add(range,97); return; }
  string tag=op.GetProperty("tag").GetString()!;
  dynamic sources=WordSources(document);
  bool exists=false;
  foreach(dynamic item in sources)if(string.Equals(WordText(RequireWordObject((object?)item,"Bibliography.Source").Tag),tag,StringComparison.OrdinalIgnoreCase)){exists=true;break;}
  bool hasSource=op.TryGetProperty("source",out var source);
  if(exists&&hasSource)throw new Exception("WORD_SOURCE_TAG_EXISTS: omit source to cite the existing tag");
  if(!exists&&(hasSource||kind=="reference-source")) {
   var xml=new XElement(Bib+"Source",new XAttribute(XNamespace.Xmlns+"b",Bib),new XElement(Bib+"Tag",tag));
   if(!hasSource)throw new Exception("WORD_SOURCE_METADATA_REQUIRED");
   {
    xml.Add(new XElement(Bib+"SourceType",source.GetProperty("type").GetString()));
    if(source.TryGetProperty("authors",out var authors)) {
     var list=new XElement(Bib+"NameList");
     foreach(var author in authors.EnumerateArray()) {
      var person=new XElement(Bib+"Person",new XElement(Bib+"Last",author.GetProperty("last").GetString()));
      if(author.TryGetProperty("first",out var first))person.Add(new XElement(Bib+"First",first.GetString()));
      list.Add(person);
     }
     xml.Add(new XElement(Bib+"Author",new XElement(Bib+"Author",list)));
    } else xml.Add(new XElement(Bib+"Author",new XElement(Bib+"Author",new XElement(Bib+"Corporate",source.GetProperty("corporateAuthor").GetString()))));
    foreach(var (input,element) in new[]{("title","Title"),("year","Year"),("city","City"),("publisher","Publisher"),("journal","JournalName"),("volume","Volume"),("issue","Issue"),("pages","Pages"),("url","URL"),("standardNumber","StandardNumber")})
     if(source.TryGetProperty(input,out var value))xml.Add(new XElement(Bib+element,value.GetString()));
   }
   sources.Add(xml.ToString(SaveOptions.DisableFormatting));
   added.Add(tag);
   exists=true;
  }
  if(kind=="citation") {
   if(!exists)throw new Exception("WORD_SOURCE_NOT_FOUND: supply source metadata or an existing Word source tag");
   string code=tag;
   if(op.TryGetProperty("pages",out var pages))code+=" \\p \""+pages.GetString()+"\"";
   RequireWordObject(RequireWordObject(document.Fields,"Document.Fields").Add(range,96,code),"Citation.Field").Update();
  }
 }
}
