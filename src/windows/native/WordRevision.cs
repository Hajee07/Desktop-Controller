using System;
using System.IO;
using System.Text;
using System.Xml;
using System.Security.Cryptography;

static partial class Program {
 static int WordXmlLimit()=>I("maxXmlCharacters")>0?I("maxXmlCharacters"):384*1024*1024;
 static string ReadWordXml(dynamic document){
  string? xml=WordContent(document).WordOpenXML;
  if(string.IsNullOrEmpty(xml))throw new Exception("WORD_XML_UNAVAILABLE: no reliable live revision could be read; inspect document state before retrying");
  if(xml.Length>WordXmlLimit())throw new Exception("LIVE_WORD_DOCUMENT_LIMIT: "+xml.Length+" XML characters exceeds configured maxLiveWordXmlCharacters="+WordXmlLimit());
  return xml;
 }
 static string Revision(dynamic document)=>WordXmlRevision(ReadWordXml(document),WordXmlLimit());
 internal static string WordXmlRevision(string xml,int limit){
  if(xml.Length>limit)throw new Exception("LIVE_WORD_DOCUMENT_LIMIT: actual="+xml.Length+", maxLiveWordXmlCharacters="+limit);
  const string word="http://schemas.openxmlformats.org/wordprocessingml/2006/main",drawing="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing";
  using var hash=SHA256.Create();using var stream=new CryptoStream(Stream.Null,hash,CryptoStreamMode.Write);
  using(var writer=XmlWriter.Create(stream,new XmlWriterSettings{Encoding=new UTF8Encoding(false),CloseOutput=false,ConformanceLevel=ConformanceLevel.Fragment,NewLineHandling=NewLineHandling.None})){
   using var reader=XmlReader.Create(new StringReader(xml),new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=limit});
   var buffer=new char[16384];bool available=reader.Read();
   while(available){
    if(reader.NodeType==XmlNodeType.Element&&reader.NamespaceURI==word&&reader.LocalName.StartsWith("rsid",StringComparison.Ordinal)){reader.Skip();available=!reader.EOF;continue;}
    switch(reader.NodeType){
     case XmlNodeType.Element:
      writer.WriteStartElement(reader.Prefix,reader.LocalName,reader.NamespaceURI);bool empty=reader.IsEmptyElement;
      if(reader.MoveToFirstAttribute())do{
       if(reader.NamespaceURI==word&&reader.LocalName.StartsWith("rsid",StringComparison.Ordinal)||reader.NamespaceURI==drawing&&(reader.LocalName=="anchorId"||reader.LocalName=="editId"))continue;
       writer.WriteAttributeString(reader.Prefix,reader.LocalName,reader.NamespaceURI,reader.Value);
      }while(reader.MoveToNextAttribute());reader.MoveToElement();if(empty)writer.WriteEndElement();break;
     case XmlNodeType.EndElement:writer.WriteFullEndElement();break;
     case XmlNodeType.Text:case XmlNodeType.CDATA:case XmlNodeType.Whitespace:case XmlNodeType.SignificantWhitespace:
      int read;while((read=reader.ReadValueChunk(buffer,0,buffer.Length))>0)writer.WriteChars(buffer,0,read);break;
     case XmlNodeType.Comment:writer.WriteComment(reader.Value);break;
     case XmlNodeType.ProcessingInstruction:writer.WriteProcessingInstruction(reader.Name,reader.Value);break;
    }
    available=reader.Read();
   }
   writer.Flush();
  }
  stream.FlushFinalBlock();return Convert.ToHexString(hash.Hash!).ToLowerInvariant();
 }
}
