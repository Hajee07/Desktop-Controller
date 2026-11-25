using System;
using System.Text;
using System.Text.Json;
using System.Runtime.InteropServices;
static partial class Program {
 static JsonElement data;
 static string S(string key)=>data.TryGetProperty(key,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString()??"":"";
 static int I(string key)=>data.TryGetProperty(key,out var v)&&v.ValueKind==JsonValueKind.Number?v.GetInt32():0;
 [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint f,bool inherit,uint access);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr d);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr h,int i,StringBuilder s,int n,out int length);
 static void Desktop(){var d=OpenInputDesktop(0,false,1);if(d==IntPtr.Zero)throw new Exception("DESKTOP_LOCKED_OR_SECURE");try{var name=new StringBuilder(256);if(!GetUserObjectInformation(d,2,name,512,out var needed)||name.ToString()!="Default"||!Environment.UserInteractive)throw new Exception("DESKTOP_LOCKED_OR_SECURE");}finally{CloseDesktop(d);}}
 [STAThread]static int Main(string[] args){System.Windows.Forms.Application.SetHighDpiMode(System.Windows.Forms.HighDpiMode.PerMonitorV2);if(args.Length==3&&args[0]=="--dashboard"){Dashboard(args[1],args[2]);return 0;}Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);return WordLiveLoop();}
}
