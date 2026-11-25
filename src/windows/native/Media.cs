using System;using System.IO;using System.Drawing;using System.Drawing.Imaging;using System.Linq;using System.Windows.Forms;using System.Windows.Automation;using System.Runtime.InteropServices;using System.Collections.Generic;
static partial class Program {
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out RECT rect);
 [DllImport("dwmapi.dll")]static extern int DwmGetWindowAttribute(IntPtr h,int attr,out RECT rect,int size);
 delegate bool EnumProc(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc callback,IntPtr l);
 [StructLayout(LayoutKind.Sequential)]struct RECT{public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)]struct LASTINPUT{public uint Size,Time;}
 [DllImport("user32.dll")]static extern bool GetLastInputInfo(ref LASTINPUT input);
 static Rectangle VisibleWindowRegion(IntPtr h,Rectangle winBounds){
  Rectangle visible=winBounds;
  if(DwmGetWindowAttribute(h,9,out var ext,Marshal.SizeOf<RECT>())==0){
   var dwm=Rectangle.FromLTRB(ext.Left,ext.Top,ext.Right,ext.Bottom);
   if(dwm.Width>0&&dwm.Height>0)visible=dwm;
  }
  if(IsZoomed(h)){
   var clamped=Rectangle.Intersect(visible,Screen.FromHandle(h).Bounds);
   if(clamped.Width>0&&clamped.Height>0)visible=clamped;
  }
  var intersected=Rectangle.Intersect(winBounds,visible);
  return intersected.Width>0&&intersected.Height>0?intersected:winBounds;
 }
 static void Present(){Desktop();var input=new LASTINPUT{Size=(uint)Marshal.SizeOf<LASTINPUT>()};if(!GetLastInputInfo(ref input)||unchecked((uint)Environment.TickCount-input.Time)>120000)throw new Exception("RECENT_USER_PRESENCE_REQUIRED");}
 static void SecureWindow(IntPtr h){
  GetWindowThreadProcessId(h,out var pid);using var process=System.Diagnostics.Process.GetProcessById((int)pid);
  var allowed=data.GetProperty("allowedProcesses").EnumerateArray().Select(x=>x.GetString()!.Replace(".exe","",StringComparison.OrdinalIgnoreCase));if(!allowed.Contains(process.ProcessName,StringComparer.OrdinalIgnoreCase))throw new Exception("CAPTURE_APP_NOT_APPROVED");
  var queue=new Queue<AutomationElement>();queue.Enqueue(AutomationElement.FromHandle(h));int count=0;var walker=TreeWalker.ControlViewWalker;
  while(queue.Count>0){if(++count>10000)throw new Exception("SECURE_FIELD_INSPECTION_LIMIT");var e=queue.Dequeue();if(e.Current.IsOffscreen)continue;string name=e.Current.Name+" "+e.Current.AutomationId;if(e.Current.IsPassword||System.Text.RegularExpressions.Regex.IsMatch(name,"password|passcode|credential|private.?key|secret|one.?time|verification.?code|security.?code|credit.?card|cvv|cvc",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new Exception("SECURE_FIELD_CAPTURE_DENIED");var child=walker.GetFirstChild(e);while(child!=null){queue.Enqueue(child);child=walker.GetNextSibling(child);}}
 }
 static object MediaAction(){
  if(S("action")=="monitors")return Screen.AllScreens.Select(s=>new {name=s.DeviceName,primary=s.Primary,x=s.Bounds.X,y=s.Bounds.Y,width=s.Bounds.Width,height=s.Bounds.Height}).ToArray();
  string output=S("destination");if(File.Exists(output))throw new Exception("OUTPUT_EXISTS");
  if(S("action")=="image-transform"){
   using var image=Image.FromFile(S("path"));if((long)image.Width*image.Height>40000000)throw new Exception("IMAGE_PIXEL_LIMIT");int x=I("x"),y=I("y"),width=I("width"),height=I("height");if(width==0)width=image.Width;if(height==0)height=image.Height;if(x<0||y<0||width<1||height<1||x+width>image.Width||y+height>image.Height)throw new Exception("INVALID_CROP");int ow=I("outputWidth")==0?width:I("outputWidth"),oh=I("outputHeight")==0?height:I("outputHeight");if(ow<1||oh<1||(long)ow*oh>40000000)throw new Exception("IMAGE_PIXEL_LIMIT");using var result=new Bitmap(ow,oh);using(var g=Graphics.FromImage(result)){g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(image,new Rectangle(0,0,ow,oh),new Rectangle(x,y,width,height),GraphicsUnit.Pixel);}result.Save(output,ImageFormat.Png);return new {path=output,width=ow,height=oh,kind="derived-image",originalUnchanged=true};
  }
  Present();string mode=S("mode");IntPtr hwnd=IntPtr.Zero;Rectangle region;
  if(mode=="window"||mode=="active"){
   hwnd=mode=="active"?GetForegroundWindow():new IntPtr(long.Parse(S("windowHandle")));if(!IsWindowVisible(hwnd)||IsIconic(hwnd))throw new Exception("VISIBLE_WINDOW_REQUIRED");GetWindowThreadProcessId(hwnd,out var pid);if(pid!=(uint)I("processId"))throw new Exception("WINDOW_PROCESS_CHANGED");SecureWindow(hwnd);if(!GetWindowRect(hwnd,out var r))throw new Exception("WINDOW_BOUNDS_UNAVAILABLE");region=new Rectangle(r.Left,r.Top,r.Right-r.Left,r.Bottom-r.Top);
  }else{
   var screens=Screen.AllScreens;if(I("monitor")<0||I("monitor")>=screens.Length)throw new Exception("MONITOR_INVALID");region=mode=="screen"?screens[I("monitor")].Bounds:new Rectangle(I("x"),I("y"),I("width"),I("height"));if(!SystemInformation.VirtualScreen.Contains(region))throw new Exception("REGION_OUTSIDE_DESKTOP");
   Exception? failure=null;EnumWindows((h,l)=>{try{if(IsWindowVisible(h)&&!IsIconic(h)&&GetWindowRect(h,out var r)&&region.IntersectsWith(new Rectangle(r.Left,r.Top,r.Right-r.Left,r.Bottom-r.Top)))SecureWindow(h);}catch(Exception e){failure=e;return false;}return true;},IntPtr.Zero);if(failure!=null)throw failure;
  }
  if(region.Width<1||region.Height<1||(long)region.Width*region.Height>40000000)throw new Exception("CAPTURE_PIXEL_LIMIT");
  using var bitmap=new Bitmap(region.Width,region.Height);
  using(var g=Graphics.FromImage(bitmap)){
   if(hwnd!=IntPtr.Zero){var dc=g.GetHdc();try{if(!PrintWindow(hwnd,dc,2))throw new Exception("APPLICATION_WINDOW_CAPTURE_UNSUPPORTED");}finally{g.ReleaseHdc(dc);}}
   else g.CopyFromScreen(region.Location,Point.Empty,region.Size);
  }
  Bitmap? cropped=null;
  try{
   var target=bitmap;
   if(hwnd!=IntPtr.Zero){
    var visible=VisibleWindowRegion(hwnd,region);
    if(visible!=region){
     cropped=bitmap.Clone(new Rectangle(visible.X-region.X,visible.Y-region.Y,visible.Width,visible.Height),bitmap.PixelFormat);
     target=cropped;
    }
    SecureWindow(hwnd);
   }
   target.Save(output,ImageFormat.Png);
   return new {path=output,width=target.Width,height=target.Height,mode,genuineCapture=true};
  }finally{cropped?.Dispose();}
 }
}
