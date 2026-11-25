param([Parameter(Mandatory=$true)][int]$ProcessId,[Parameter(Mandatory=$true)][string]$DeviceName,[ValidateSet('CLI','Desktop')][string]$TargetTab='CLI')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class PTWindowInput {
 [DllImport("user32.dll")]public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr ChildWindowFromPointEx(IntPtr h,P p,uint flags);
 public static IntPtr ChildAt(IntPtr root,P screen){var h=root;for(int i=0;i<20;i++){var p=screen;ScreenToClient(h,ref p);var child=ChildWindowFromPointEx(h,p,7);if(child==IntPtr.Zero||child==h)return h;h=child;}throw new Exception("CHILD_WINDOW_DEPTH_LIMIT");}
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(P p);
 [DllImport("user32.dll")]public static extern bool ScreenToClient(IntPtr h,ref P p);
 [DllImport("user32.dll")]public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [StructLayout(LayoutKind.Sequential)]public struct P{public int X,Y;}
}
'@
[void][PTWindowInput]::SetProcessDPIAware()
$process=Get-Process -Id $ProcessId
if($process.ProcessName -ne 'PacketTracer'){throw 'PACKET_TRACER_PROCESS_REQUIRED'}
function Windows { @([Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$ProcessId))) }
function ById($root,$id){$root.FindFirst([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty,$id))}
function WaitWindow($name){for($i=0;$i -lt 20;$i++){$found=@(Windows|Where-Object {$_.Current.Name -eq $name});if($found.Count -eq 1){return $found[0]};Start-Sleep -Milliseconds 100};throw "PACKET_TRACER_WINDOW_NOT_FOUND: $name"}
$dialog=@(Windows|Where-Object {$_.Current.Name -eq $DeviceName})
if($dialog.Count -gt 1){throw 'DEVICE_WINDOW_AMBIGUOUS'}
if($dialog.Count -eq 0){
 $list=@(Windows|Where-Object {$_.Current.Name -eq 'Workspace List'})
 if($list.Count -eq 0){$main=[Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle);$button=ById $main 'CAppWindowBase.m_pToolBar.Show Workspace List';if(!$button){throw 'WORKSPACE_LIST_CONTROL_UNAVAILABLE'};$button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()}
 $window=WaitWindow 'Workspace List';$table=ById $window 'WorkspaceList.deviceFrame.deviceList'
 $grid=$table.GetCurrentPattern([Windows.Automation.GridPattern]::Pattern);$cell=$null
 for($row=0;$row -lt [Math]::Min($grid.Current.RowCount,2000);$row++){ $candidate=$grid.GetItem($row,0);if($candidate.Current.Name -eq $DeviceName){if($cell){throw 'DEVICE_NAME_AMBIGUOUS'};$cell=$candidate} }
 if(!$cell){throw 'DEVICE_NOT_IN_WORKSPACE_LIST'}
 for($attempt=0;$attempt -lt 30;$attempt++){
  $bounds=$table.Current.BoundingRectangle;$rect=$cell.Current.BoundingRectangle
  if($rect.Top -ge $bounds.Top+20 -and $rect.Bottom -le $bounds.Bottom){break}
  $point=[PTWindowInput+P]::new();$point.X=[int]($bounds.Left+50);$point.Y=[int]($bounds.Top+$bounds.Height/2)
  $handle=[PTWindowInput]::ChildAt([IntPtr]$window.Current.NativeWindowHandle,$point);[uint32]$owner=0;[void][PTWindowInput]::GetWindowThreadProcessId($handle,[ref]$owner);if($owner -ne $ProcessId){throw 'TARGET_PROCESS_CHANGED'}
  $delta=if($rect.Top -lt $bounds.Top){120}else{-120}
  [void][PTWindowInput]::SendMessage($handle,0x20A,[IntPtr]($delta -shl 16),[IntPtr](($point.Y-shl 16)-bor $point.X))
 }
 $bounds=$table.Current.BoundingRectangle;$rect=$cell.Current.BoundingRectangle
 if($rect.Top -lt $bounds.Top+20 -or $rect.Bottom -gt $bounds.Bottom){throw 'DEVICE_ROW_NOT_VISIBLE'}
 $point=[PTWindowInput+P]::new();$point.X=[int]($rect.Left+$rect.Width/2);$point.Y=[int]($rect.Top+$rect.Height/2)
 $handle=[PTWindowInput]::ChildAt([IntPtr]$window.Current.NativeWindowHandle,$point);[uint32]$owner=0;[void][PTWindowInput]::GetWindowThreadProcessId($handle,[ref]$owner);if($owner -ne $ProcessId){throw 'TARGET_PROCESS_CHANGED'}
 [void][PTWindowInput]::ScreenToClient($handle,[ref]$point);$position=[IntPtr](($point.Y-shl 16)-bor($point.X-band 65535))
 foreach($message in @(0x201,0x202,0x203,0x202)){[void][PTWindowInput]::SendMessage($handle,$message,[IntPtr]$(if($message -in @(0x201,0x203)){1}else{0}),$position)}
 $dialog=@(WaitWindow $DeviceName)
}
$target=$dialog[0];$tabs=$target.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,$TargetTab))
$selected=$false
foreach($tab in $tabs){if($tab.Current.ControlType -ne [Windows.Automation.ControlType]::TabItem){continue};$pattern=$null;if($tab.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern,[ref]$pattern)){$pattern.Select();break};if($tab.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$pattern.Invoke();break}}
if($TargetTab -eq 'Desktop'){
 $items=$target.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
 $matches=@($items|Where-Object {$_.Current.AutomationId -match '\.CommandPromptBtn$' -and !$_.Current.IsOffscreen})
 if($matches.Count -ne 1){throw 'DESKTOP_COMMAND_PROMPT_UNAVAILABLE'}
 $matches[0].GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
 [ordered]@{device=$DeviceName;processId=$ProcessId;windowHandle=$target.Current.NativeWindowHandle;desktopCommandPromptRequested=$true}|ConvertTo-Json -Compress
 exit
}
$controls=$target.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
foreach($control in $controls){if($control.Current.AutomationId -match 'm_cliTab\.CCommandLine1$' -and !$control.Current.IsOffscreen){$selected=$true}}
if(!$selected){throw 'CLI_TAB_ACCESSIBILITY_UNAVAILABLE'}
[ordered]@{device=$DeviceName;processId=$ProcessId;windowHandle=$target.Current.NativeWindowHandle;cliSelected=$selected;method='UIAutomation + scoped window messages; no cursor movement'}|ConvertTo-Json -Compress

