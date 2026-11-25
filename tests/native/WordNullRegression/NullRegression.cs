using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Text.Json;

public sealed class FakeStyle { public object? NameLocal {get;set;}="Normal"; }
public sealed class FakeList { public object? ListString {get;set;}=""; }
public class FakeRange {
 public int Start {get;set;}=0; public int End {get;set;}=10;
 public object? Text {get;set;}="fixture\r\a";
 public object? Style {get;set;}
 public virtual object? ListFormat {get;set;}=new FakeList();
 public object? WordOpenXML {get;set;}="<document/>";
}
public sealed class BrokenRange:FakeRange {
 public override object? ListFormat { get=>throw new COMException("RPC disconnected",unchecked((int)0x80010108));set{} }
}
public sealed class FakeParagraph {
 public object? Range {get;set;}=new FakeRange();
 public object? Style {get;set;}=new FakeStyle {NameLocal="TOC 1"};
 public int OutlineLevel {get;set;}=10;
}
public sealed class FakeDocument { public object? Content {get;set;}=new FakeRange();public object? Bibliography {get;set;} }
public sealed class FakeBibliography {public object? Sources {get;set;} }

static class NullRegression {
 static readonly Type Native=Assembly.Load("WindowsHelper").GetType("Program",true)!;
 static int passed;
 static object? Invoke(string name,params object?[] values) {
  try{return Native.GetMethod(name,BindingFlags.Static|BindingFlags.NonPublic)!.Invoke(null,values);}
  catch(TargetInvocationException error) when(error.InnerException!=null){ExceptionDispatchInfo.Capture(error.InnerException).Throw();throw;}
 }
 static void Check(bool ok,string reason){if(!ok)throw new Exception(reason);}
 static JsonElement Read(FakeParagraph p)=>JsonSerializer.SerializeToElement(Invoke("WordParagraph",p,"revision",1));
 static void Case(string name,Action action){action();passed++;Console.WriteLine("PASS "+name);}
 static void Reject(string method,string code,params object?[] values){try{Invoke(method,values);throw new Exception("Expected "+code);}catch(Exception error) when(error.Message.StartsWith(code,StringComparison.Ordinal)){} }
 static void Main(){
  Case("TOC paragraph retains its actual style when Range.Style is null",()=>{var row=Read(new FakeParagraph());Check(row.GetProperty("style").GetString()=="TOC 1","Lost real paragraph style");Check(row.GetProperty("text").GetString()=="fixture","Lost text");});
  Case("paragraph style wins over character style",()=>{var row=Read(new FakeParagraph{Range=new FakeRange{Style=new FakeStyle{NameLocal="Emphasis"}}});Check(row.GetProperty("style").GetString()=="TOC 1","Returned character style");});
  Case("string style variants are supported",()=>Check(Read(new FakeParagraph{Style="Heading 1"}).GetProperty("style").GetString()=="Heading 1","String variant"));
  Case("range style fallback preserves metadata",()=>Check(Read(new FakeParagraph{Style=null,Range=new FakeRange{Style=new FakeStyle{NameLocal="Fallback"}}}).GetProperty("style").GetString()=="Fallback","Fallback"));
  Case("unavailable style is reported without invented default",()=>{var row=Read(new FakeParagraph{Style=DBNull.Value});Check(row.GetProperty("style").GetString()==""&&!row.GetProperty("styleAvailable").GetBoolean(),"Missing style mislabeled");});
  Case("null style name is safe",()=>Check(!Read(new FakeParagraph{Style=new FakeStyle{NameLocal=null}}).GetProperty("styleAvailable").GetBoolean(),"Null name"));
  Case("null optional text and numbering remain explicit",()=>{var row=Read(new FakeParagraph{Range=new FakeRange{Text=null,ListFormat=null}});Check(row.GetProperty("text").GetString()==""&&!row.GetProperty("numberingAvailable").GetBoolean(),"Missing metadata");});
  Case("numbered lists keep their actual labels",()=>Check(Read(new FakeParagraph{Range=new FakeRange{Text=DBNull.Value,ListFormat=new FakeList{ListString="2.10.1"}}}).GetProperty("number").GetString()=="2.10.1","Lost numbering"));
  Case("missing required paragraph fails clearly",()=>Reject("WordParagraph","WORD_OBJECT_UNAVAILABLE",null,"revision",1));
  Case("missing required paragraph range fails clearly",()=>Reject("WordParagraph","WORD_OBJECT_UNAVAILABLE",new FakeParagraph{Range=null},"revision",1));
  Case("missing selection range fails clearly",()=>Reject("RangeInfo","WORD_OBJECT_UNAVAILABLE",null,"revision"));
  Case("empty selection text is supported",()=>Check(JsonSerializer.SerializeToElement(Invoke("RangeInfo",new FakeRange{Text=null},"revision")).GetProperty("text").GetString()=="","Empty selection"));
  Case("missing document content cannot produce a checkpoint",()=>Reject("ReadWordXml","WORD_OBJECT_UNAVAILABLE",new FakeDocument{Content=null}));
  Case("null and empty XML cannot produce a revision/checkpoint",()=>{foreach(var xml in new object?[]{null,""})Reject("ReadWordXml","WORD_XML_UNAVAILABLE",new FakeDocument{Content=new FakeRange{WordOpenXML=xml}});});
  Case("missing bibliography and sources fail clearly",()=>{Reject("WordSources","WORD_OBJECT_UNAVAILABLE",new FakeDocument());Reject("WordSources","WORD_OBJECT_UNAVAILABLE",new FakeDocument{Bibliography=new FakeBibliography()});});
  Case("real COM errors are propagated rather than empty success",()=>{try{Read(new FakeParagraph{Range=new BrokenRange()});throw new Exception("COM error swallowed");}catch(COMException error){Check(error.HResult==unchecked((int)0x80010108),"COM error changed");}});
  Console.WriteLine("Native Word null regression: "+passed+" passed");
 }
}
