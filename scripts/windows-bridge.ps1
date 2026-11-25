# Fixed-operation Windows bridge. Arguments are data; no dynamic script evaluation.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('info','drives','applications','discover-apps','windows','active','open','open-file','close','focus','inspect','click','type','scroll','screenshot','confirm','recycle')]
    [string]$Operation,
    [Parameter(Mandatory = $true)][string]$Payload
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
    if ($Payload.Length -gt 2000000) { throw 'Payload exceeds bridge limit.' }
    $data = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
    if ($null -eq $data) { throw 'Missing payload object.' }
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class WindowItem {
    public long windowHandle;
    public uint processId;
    public string processName;
    public string title;
    public bool responding;
    public bool minimized;
}
public static class LaptopNative {
    [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
    [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder text, uint length, out uint needed);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rectangle);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT rectangle, int size);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
    public static IntPtr EnterPerMonitorV2() {
        try { return SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { return IntPtr.Zero; }
    }
    public static void LeaveDpiContext(IntPtr previous) {
        if (previous != IntPtr.Zero) { try { SetThreadDpiAwarenessContext(previous); } catch {} }
    }
    public static string InputDesktopName() {
        IntPtr desktop = OpenInputDesktop(0, false, 1);
        if (desktop == IntPtr.Zero) return "";
        try { uint needed; var name = new StringBuilder(256); return GetUserObjectInformation(desktop, 2, name, 512, out needed) ? name.ToString() : ""; }
        finally { CloseDesktop(desktop); }
    }
    public static double IdleSeconds() {
        var info = new LASTINPUTINFO(); info.cbSize = (uint)Marshal.SizeOf(info);
        if (!GetLastInputInfo(ref info)) return double.PositiveInfinity;
        return unchecked((uint)Environment.TickCount - info.dwTime) / 1000.0;
    }
    public static WindowItem Describe(IntPtr handle) {
        uint processId; GetWindowThreadProcessId(handle, out processId);
        var name = new StringBuilder(2048); GetWindowText(handle, name, name.Capacity);
        string processName = ""; bool responding = false;
        try { var process = Process.GetProcessById((int)processId); processName = process.ProcessName; responding = process.Responding; } catch {}
        return new WindowItem { windowHandle = handle.ToInt64(), processId = processId, processName = processName, title = name.ToString(), responding = responding, minimized = IsIconic(handle) };
    }
    public static object[] Windows() {
        var result = new List<object>();
        EnumWindows((handle, parameter) => { if (IsWindowVisible(handle)) result.Add(Describe(handle)); return result.Count < 1000; }, IntPtr.Zero);
        return result.ToArray();
    }
    // Windows command line quoting for ProcessStartInfo in .NET Framework.
    public static string QuoteArgument(string argument) {
        if (argument == null) argument = "";
        var result = new StringBuilder("\""); int slashCount = 0;
        foreach (char value in argument) {
            if (value == '\\') { slashCount++; continue; }
            if (value == '"') result.Append('\\', slashCount * 2 + 1);
            else result.Append('\\', slashCount);
            result.Append(value); slashCount = 0;
        }
        result.Append('\\', slashCount * 2); return result.Append('"').ToString();
    }
}
'@
    function Assert-Unlocked {
        if (-not [Environment]::UserInteractive -or [LaptopNative]::InputDesktopName() -ne 'Default') { throw 'Desktop is locked, unavailable, or secure. No interaction is permitted.' }
    }
    function Assert-Present {
        Assert-Unlocked
        $maximumIdle = [double]$data.presenceMaxIdleSeconds
        if ($maximumIdle -lt 1 -or $maximumIdle -gt 600) { throw 'Invalid presence timeout.' }
        if ([LaptopNative]::IdleSeconds() -gt $maximumIdle) { throw 'Recent physical user activity is required. Move the mouse or use the keyboard and try again.' }
    }
    function Get-ApprovedWindow {
        param([switch]$RequireForeground)
        Assert-Present
        $windowHandleValue = [IntPtr]([long]$data.windowHandle)
        if (-not [LaptopNative]::IsWindow($windowHandleValue) -or -not [LaptopNative]::IsWindowVisible($windowHandleValue) -or [LaptopNative]::IsIconic($windowHandleValue)) { throw 'The target must be a visible, non-minimized window.' }
        [uint32]$processIdValue = 0
        [void][LaptopNative]::GetWindowThreadProcessId($windowHandleValue, [ref]$processIdValue)
        if ($processIdValue -ne [uint32]$data.processId) { throw 'Window/process identity changed. Inspect again.' }
        $process = Get-Process -Id $processIdValue
        $allowed = @($data.allowedProcesses | ForEach-Object { ([string]$_).ToLowerInvariant() -replace '\.exe$','' })
        if ($allowed.Count -eq 0 -or $allowed -notcontains $process.ProcessName.ToLowerInvariant()) { throw 'Process is not explicitly approved for this operation.' }
        if ($RequireForeground -and [LaptopNative]::GetForegroundWindow() -ne $windowHandleValue) { throw 'Focus the approved window first.' }
        return $windowHandleValue
    }
    function Is-SecureElement($element) {
        if ($element.Current.IsPassword) { return $true }
        $label = '{0} {1}' -f $element.Current.Name, $element.Current.AutomationId
        return $label -match '(?i)(password|passcode|credential|private.?key|secret|one.?time.?code|verification.?code|security.?code|credit.?card|cvv|cvc)'
    }
    function Get-WindowTree($root, [int]$maximum, [bool]$FailOnSecure) {
        $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        $queue = New-Object 'System.Collections.Generic.Queue[System.Windows.Automation.AutomationElement]'
        $list = New-Object 'System.Collections.Generic.List[System.Windows.Automation.AutomationElement]'
        $queue.Enqueue($root)
        while ($queue.Count -gt 0) {
            $element = $queue.Dequeue()
            if (Is-SecureElement $element) {
                if ($FailOnSecure) { throw 'A secure/credential control is present. Screenshot capture is prohibited.' }
                continue
            }
            if (-not $element.Current.IsOffscreen) { $list.Add($element) }
            if ($list.Count -ge $maximum) {
                if ($FailOnSecure) { throw 'Secure-control inspection exceeded its bound; screenshot refused.' }
                break
            }
            $child = $walker.GetFirstChild($element)
            while ($null -ne $child) {
                $queue.Enqueue($child)
                if ($queue.Count -gt 10000) { throw 'UI tree exceeds the safe inspection bound.' }
                $child = $walker.GetNextSibling($child)
            }
        }
        return ,$list
    }
    function Get-TargetElement($windowHandleValue) {
        if ([string]$data.elementId -notmatch '^-?\d+(\.-?\d+){1,30}$') { throw 'Invalid element runtime identifier.' }
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($windowHandleValue)
        $elements = Get-WindowTree $root 5000 $false
        foreach ($element in $elements) {
            if (($element.GetRuntimeId() -join '.') -eq [string]$data.elementId) {
                if ($element.Current.ProcessId -ne [int]$data.processId -or $element.Current.IsOffscreen -or -not $element.Current.IsEnabled -or (Is-SecureElement $element)) { throw 'Target control is hidden, disabled, secure, or belongs to another process.' }
                return $element
            }
        }
        throw 'The visible control no longer exists. Inspect the window again.'
    }
    $result = switch ($Operation) {
        'info' {
            $windows = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
            [ordered]@{ osVersion = [Environment]::OSVersion.VersionString; productName = $windows.ProductName; displayVersion = $windows.DisplayVersion; build = $windows.CurrentBuildNumber; architecture = $env:PROCESSOR_ARCHITECTURE; machineName = [Environment]::MachineName; logicalProcessors = [Environment]::ProcessorCount; powershellVersion = $PSVersionTable.PSVersion.ToString(); interactive = [Environment]::UserInteractive; desktopUnlocked = ([LaptopNative]::InputDesktopName() -eq 'Default') }
        }
        'drives' {
            @([System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ForEach-Object { [ordered]@{ name = $_.Name; type = $_.DriveType.ToString(); format = $_.DriveFormat; totalBytes = $_.TotalSize; freeBytes = $_.AvailableFreeSpace } })
        }
        'applications' {
            if ($data.kind -eq 'installed') {
                $registryPaths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
                @($registryPaths | ForEach-Object { Get-ItemProperty -Path $_ -ErrorAction SilentlyContinue } | Where-Object { $_.DisplayName } | Select-Object @{n='name';e={$_.DisplayName}}, @{n='version';e={$_.DisplayVersion}}, @{n='publisher';e={$_.Publisher}} | Sort-Object name -Unique)
            } elseif ($data.kind -eq 'running') {
                @(Get-Process | ForEach-Object {
                    $applicationProcess = $_; $applicationHandle = 0; $applicationTitle = ''; $applicationResponding = $null
                    try { $applicationHandle = $applicationProcess.MainWindowHandle.ToInt64(); $applicationTitle = $applicationProcess.MainWindowTitle; $applicationResponding = $applicationProcess.Responding } catch {}
                    [ordered]@{ processId = $applicationProcess.Id; processName = $applicationProcess.ProcessName; windowHandle = $applicationHandle; title = $applicationTitle; responding = $applicationResponding }
                })
            }
            else { throw 'Unsupported application list kind.' }
        }
        'discover-apps' {
            $apps = New-Object System.Collections.Generic.List[object]
            $keys=@('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths')
            foreach($key in $keys){foreach($entry in @(Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue)){
                $exe=([string]$entry.GetValue('')).Trim('"')
                if($exe -and -not $exe.StartsWith('\\') -and [IO.Path]::IsPathRooted($exe) -and [IO.Path]::GetExtension($exe) -ieq '.exe' -and [IO.File]::Exists($exe)){$apps.Add([pscustomobject]@{name=[IO.Path]::GetFileNameWithoutExtension($entry.PSChildName);executable=$exe})}
            }}
            $shell=New-Object -ComObject WScript.Shell
            try {
                $menus=@([Environment]::GetFolderPath('CommonPrograms'),[Environment]::GetFolderPath('Programs')) | Where-Object {$_}
                foreach($link in @($menus|ForEach-Object {Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue}|Select-Object -First 5000)){
                    $shortcut=$null
                    try{$shortcut=$shell.CreateShortcut($link.FullName);$exe=[string]$shortcut.TargetPath
                        if(-not $shortcut.Arguments -and $exe -and -not $exe.StartsWith('\\') -and [IO.Path]::IsPathRooted($exe) -and [IO.Path]::GetExtension($exe) -ieq '.exe' -and [IO.File]::Exists($exe)){$apps.Add([pscustomobject]@{name=$link.BaseName;executable=$exe})}
                    }catch{}finally{if($null -ne $shortcut){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)}}
                }
            }finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)}
            @($apps | Sort-Object name,executable -Unique)
        }
        'windows' { @([LaptopNative]::Windows()) }
        'active' { [LaptopNative]::Describe([LaptopNative]::GetForegroundWindow()) }
        'open' {
            Assert-Present
            $executablePath = [string]$data.executable
            if (-not [System.IO.Path]::IsPathRooted($executablePath) -or [System.IO.Path]::GetExtension($executablePath) -ne '.exe' -or -not [System.IO.File]::Exists($executablePath)) { throw 'Approved executable must be an existing absolute .exe path.' }
            $processName = [System.IO.Path]::GetFileNameWithoutExtension($executablePath)
            $existing = @(Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object {
                try { [string]::Equals($_.Path, $executablePath, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }
            })
            if ($existing.Count -gt 0 -and @($data.args).Count -eq 0) {
                [ordered]@{ launched = $false; alreadyRunning = $true; processId = $existing[0].Id; executable = $executablePath }
                break
            }
            $startInfo = New-Object System.Diagnostics.ProcessStartInfo
            $startInfo.FileName = $executablePath
            # GUI children must not retain this bridge's stdout/stderr pipe handles.
            $startInfo.UseShellExecute = $true
            $startInfo.Arguments = (@($data.args | ForEach-Object { [LaptopNative]::QuoteArgument([string]$_) }) -join ' ')
            $started = [System.Diagnostics.Process]::Start($startInfo)
            [ordered]@{ launched = $true; processId = $started.Id; executable = $executablePath }
        }
        'open-file' {
            Assert-Present
            $documentPath = [string]$data.path
            if (-not [System.IO.File]::Exists($documentPath) -or $documentPath -notmatch '(?i)\.(txt|md|json|csv|pdf|docx|xlsx|pptx|png|jpg|jpeg|gif|bmp|html|css)$') { throw 'An existing supported ordinary document is required. Open scripts only through an approved editor.' }
            $startInfo = New-Object System.Diagnostics.ProcessStartInfo
            $startInfo.FileName = $documentPath
            $startInfo.UseShellExecute = $true
            [void][System.Diagnostics.Process]::Start($startInfo)
            [ordered]@{ opened = $true; path = $documentPath }
        }
        'close' {
            $handle = Get-ApprovedWindow
            $processName = (Get-Process -Id ([int]$data.processId)).ProcessName.ToLowerInvariant()
            $critical = @('system','idle','registry','smss','csrss','wininit','services','lsass','winlogon','svchost','dwm','sihost','fontdrvhost','securityhealthservice','msmpeng','codex','node','powershell','pwsh')
            if ($critical -contains $processName) { throw 'Closing critical/system or controller processes is prohibited.' }
            if (-not [LaptopNative]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) { throw 'Windows refused the graceful close request.' }
            [ordered]@{ requested = $true; processId = $data.processId; windowHandle = $data.windowHandle; message = 'Graceful WM_CLOSE posted. The user must resolve any unsaved-work prompt.' }
        }
        'focus' {
            $handle = Get-ApprovedWindow
            if (-not [LaptopNative]::SetForegroundWindow($handle)) { throw 'Windows refused foreground activation. Select the window manually.' }
            [LaptopNative]::Describe($handle)
        }
        'inspect' {
            $handle = Get-ApprovedWindow
            $maximum = [int]$data.maxElements
            if ($maximum -lt 1 -or $maximum -gt 1000) { throw 'Invalid inspection bound.' }
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
            $elements = Get-WindowTree $root $maximum $false
            $items = @($elements | ForEach-Object {
                $current = $_.Current
                [ordered]@{ elementId = ($_.GetRuntimeId() -join '.'); name = $current.Name; automationId = $current.AutomationId; controlType = $current.ControlType.ProgrammaticName; enabled = $current.IsEnabled; bounds = [ordered]@{ x = $current.BoundingRectangle.X; y = $current.BoundingRectangle.Y; width = $current.BoundingRectangle.Width; height = $current.BoundingRectangle.Height }; patterns = @($_.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName }) }
            })
            [ordered]@{ windowHandle = $data.windowHandle; processId = $data.processId; elements = $items; truncated = ($items.Count -ge $maximum); secureFieldsOmitted = $true }
        }
        'click' {
            $handle = Get-ApprovedWindow -RequireForeground
            $element = Get-TargetElement $handle
            Assert-Present
            switch ([string]$data.action) {
                'invoke' { ([System.Windows.Automation.InvokePattern]$element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke() }
                'select' { ([System.Windows.Automation.SelectionItemPattern]$element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)).Select() }
                'toggle' { ([System.Windows.Automation.TogglePattern]$element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)).Toggle() }
                'expand' { ([System.Windows.Automation.ExpandCollapsePattern]$element.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand() }
                'collapse' { ([System.Windows.Automation.ExpandCollapsePattern]$element.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Collapse() }
                default { throw 'Unsupported accessible control action.' }
            }
            [ordered]@{ completed = $true; action = $data.action; elementId = $data.elementId }
        }
        'type' {
            $handle = Get-ApprovedWindow -RequireForeground
            $element = Get-TargetElement $handle
            if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit) { throw 'Text entry is restricted to ordinary Edit controls.' }
            if (([string]$data.text).Length -gt 100000) { throw 'Text exceeds the input bound.' }
            $value = [System.Windows.Automation.ValuePattern]$element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            if ($value.Current.IsReadOnly) { throw 'Field is read-only.' }
            Assert-Present
            $value.SetValue([string]$data.text)
            [ordered]@{ completed = $true; elementId = $data.elementId; characters = ([string]$data.text).Length }
        }
        'scroll' {
            $handle = Get-ApprovedWindow -RequireForeground
            $element = Get-TargetElement $handle
            $scroll = [System.Windows.Automation.ScrollPattern]$element.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern)
            $horizontal = [System.Windows.Automation.ScrollAmount]::NoAmount
            $vertical = [System.Windows.Automation.ScrollAmount]::NoAmount
            $small = $data.amount -eq 'small'
            if ($data.amount -notin @('small','large')) { throw 'Invalid scroll amount.' }
            switch ([string]$data.direction) {
                'up' { $vertical = if ($small) { [System.Windows.Automation.ScrollAmount]::SmallDecrement } else { [System.Windows.Automation.ScrollAmount]::LargeDecrement } }
                'down' { $vertical = if ($small) { [System.Windows.Automation.ScrollAmount]::SmallIncrement } else { [System.Windows.Automation.ScrollAmount]::LargeIncrement } }
                'left' { $horizontal = if ($small) { [System.Windows.Automation.ScrollAmount]::SmallDecrement } else { [System.Windows.Automation.ScrollAmount]::LargeDecrement } }
                'right' { $horizontal = if ($small) { [System.Windows.Automation.ScrollAmount]::SmallIncrement } else { [System.Windows.Automation.ScrollAmount]::LargeIncrement } }
                default { throw 'Invalid scroll direction.' }
            }
            Assert-Present
            $scroll.Scroll($horizontal, $vertical)
            [ordered]@{ completed = $true; elementId = $data.elementId; direction = $data.direction }
        }
        'screenshot' {
            $handle = Get-ApprovedWindow -RequireForeground
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
            $null = Get-WindowTree $root 10000 $true
            if ([System.IO.Path]::GetExtension([string]$data.path) -ne '.png') { throw 'Screenshot output must be PNG.' }
            $previousDpi = [LaptopNative]::EnterPerMonitorV2()
            $bitmap = $null
            $outputBitmap = $null
            $graphics = $null
            try {
                $rectangle = New-Object LaptopNative+RECT
                if (-not [LaptopNative]::GetWindowRect($handle, [ref]$rectangle)) { throw 'Cannot read approved window bounds.' }
                $rawLeft = $rectangle.Left; $rawTop = $rectangle.Top
                $rawWidth = $rectangle.Right - $rectangle.Left; $rawHeight = $rectangle.Bottom - $rectangle.Top
                if ($rawWidth -lt 1 -or $rawHeight -lt 1 -or $rawWidth -gt 16000 -or $rawHeight -gt 16000 -or ([long]$rawWidth * $rawHeight) -gt 40000000) { throw 'Window capture dimensions exceed safe bounds.' }
                $winBox = New-Object System.Drawing.Rectangle($rawLeft, $rawTop, $rawWidth, $rawHeight)
                $visibleBox = $winBox
                $extended = New-Object LaptopNative+RECT
                if ([LaptopNative]::DwmGetWindowAttribute($handle, 9, [ref]$extended, [System.Runtime.InteropServices.Marshal]::SizeOf($extended)) -eq 0) {
                    $dwmBox = [System.Drawing.Rectangle]::FromLTRB($extended.Left, $extended.Top, $extended.Right, $extended.Bottom)
                    if ($dwmBox.Width -gt 0 -and $dwmBox.Height -gt 0) { $visibleBox = $dwmBox }
                }
                if ([LaptopNative]::IsZoomed($handle)) {
                    $clamped = [System.Drawing.Rectangle]::Intersect($visibleBox, [System.Windows.Forms.Screen]::FromHandle($handle).Bounds)
                    if ($clamped.Width -gt 0 -and $clamped.Height -gt 0) { $visibleBox = $clamped }
                }
                $visibleBox = [System.Drawing.Rectangle]::Intersect($winBox, $visibleBox)
                if ($visibleBox.Width -lt 1 -or $visibleBox.Height -lt 1) { $visibleBox = $winBox }

                $bitmap = New-Object System.Drawing.Bitmap($rawWidth, $rawHeight)
                $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
                Assert-Present
                if ([LaptopNative]::GetForegroundWindow() -ne $handle) { throw 'Foreground window changed. Capture refused.' }
                $hdc = $graphics.GetHdc()
                try { $captured = [LaptopNative]::PrintWindow($handle, $hdc, 2) } finally { $graphics.ReleaseHdc($hdc) }
                if (-not $captured) { throw 'Application does not support safe individual-window capture.' }
                $graphics.Dispose(); $graphics = $null

                if ($visibleBox.X -ne $winBox.X -or $visibleBox.Y -ne $winBox.Y -or $visibleBox.Width -ne $winBox.Width -or $visibleBox.Height -ne $winBox.Height) {
                    $cropRect = New-Object System.Drawing.Rectangle(($visibleBox.X - $rawLeft), ($visibleBox.Y - $rawTop), $visibleBox.Width, $visibleBox.Height)
                    $outputBitmap = $bitmap.Clone($cropRect, $bitmap.PixelFormat)
                } else {
                    $outputBitmap = $bitmap
                    $bitmap = $null
                }
                [LaptopNative]::LeaveDpiContext($previousDpi); $previousDpi = [IntPtr]::Zero
                $null = Get-WindowTree ([System.Windows.Automation.AutomationElement]::FromHandle($handle)) 10000 $true
                $outputBitmap.Save([string]$data.path, [System.Drawing.Imaging.ImageFormat]::Png)
                $width = $outputBitmap.Width; $height = $outputBitmap.Height
            } finally {
                [LaptopNative]::LeaveDpiContext($previousDpi)
                if ($null -ne $graphics) { $graphics.Dispose() }
                if ($null -ne $outputBitmap) { $outputBitmap.Dispose() }
                if ($null -ne $bitmap) { $bitmap.Dispose() }
            }
            [ordered]@{ captured = $true; path = $data.path; width = $width; height = $height; windowHandle = $data.windowHandle }
        }
        'confirm' {
            Assert-Unlocked
            $title = [string]$data.title; $details = [string]$data.details
            if ($title.Length -gt 200 -or $details.Length -gt 24000) { throw 'Confirmation description exceeds dialog limits.' }
            $owner = New-Object System.Windows.Forms.Form
            $owner.TopMost = $true
            $owner.ShowInTaskbar = $true
            try {
                $owner.Show(); $owner.Activate()
                $answer = [System.Windows.Forms.MessageBox]::Show($owner, $details + "`r`n`r`nAllow this exact operation? Cancel denies it.", $title, [System.Windows.Forms.MessageBoxButtons]::OKCancel, [System.Windows.Forms.MessageBoxIcon]::Warning, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)
                [ordered]@{ accepted = ($answer -eq [System.Windows.Forms.DialogResult]::OK) }
            } finally { $owner.Close(); $owner.Dispose() }
        }
        'recycle' {
            Assert-Unlocked
            $filePath = [string]$data.path
            if (-not [System.IO.Path]::IsPathRooted($filePath) -or -not [System.IO.File]::Exists($filePath)) { throw 'Recycle operation requires exactly one existing absolute file.' }
            $fileInfo = New-Object System.IO.FileInfo($filePath)
            if (($fileInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse points cannot be recycled by this tool.' }
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace LaptopRecycle {
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler(IntPtr bindContext, ref Guid handler, ref Guid iid, out IntPtr result);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint nameType, out IntPtr name);
        void GetAttributes(uint mask, out uint attributes);
        void Compare(IShellItem other, uint hint, out int order);
    }
    [ComVisible(true), Guid("04B0F1A7-9490-44BC-96E1-4296A31252E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileOperationProgressSink {
        [PreserveSig] int StartOperations();
        [PreserveSig] int FinishOperations(int result);
        [PreserveSig] int PreRenameItem(uint flags, IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostRenameItem(uint flags, IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
        [PreserveSig] int PreMoveItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostMoveItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
        [PreserveSig] int PreCopyItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostCopyItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
        [PreserveSig] int PreDeleteItem(uint flags, IShellItem item);
        [PreserveSig] int PostDeleteItem(uint flags, IShellItem item, int result, IShellItem created);
        [PreserveSig] int PreNewItem(uint flags, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostNewItem(uint flags, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, uint attributes, int result, IShellItem created);
        [PreserveSig] int UpdateProgress(uint total, uint completed);
        [PreserveSig] int ResetTimer();
        [PreserveSig] int PauseTimer();
        [PreserveSig] int ResumeTimer();
    }
    [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileOperation {
        void Advise(IFileOperationProgressSink sink, out uint cookie);
        void Unadvise(uint cookie);
        void SetOperationFlags(uint flags);
        void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
        void SetProgressDialog(IntPtr dialog);
        void SetProperties(IntPtr properties);
        void SetOwnerWindow(IntPtr owner);
        void ApplyPropertiesToItem(IShellItem item);
        void ApplyPropertiesToItems([MarshalAs(UnmanagedType.IUnknown)] object items);
        void RenameItem(IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, IFileOperationProgressSink sink);
        void RenameItems([MarshalAs(UnmanagedType.IUnknown)] object items, [MarshalAs(UnmanagedType.LPWStr)] string name);
        void MoveItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IFileOperationProgressSink sink);
        void MoveItems([MarshalAs(UnmanagedType.IUnknown)] object items, IShellItem destination);
        void CopyItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IFileOperationProgressSink sink);
        void CopyItems([MarshalAs(UnmanagedType.IUnknown)] object items, IShellItem destination);
        void DeleteItem(IShellItem item, IFileOperationProgressSink sink);
        void DeleteItems([MarshalAs(UnmanagedType.IUnknown)] object items);
        void NewItem(IShellItem destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, IFileOperationProgressSink sink);
        void PerformOperations();
        void GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
    }
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class RecycleOnlySink : IFileOperationProgressSink {
        public bool SawRecycle; public bool VerifiedDestination; public int Failure;
        public int StartOperations() { return 0; }
        public int FinishOperations(int result) { if (result < 0) Failure = result; return 0; }
        public int PreRenameItem(uint flags, IShellItem item, string name) { return unchecked((int)0x80004004); }
        public int PostRenameItem(uint flags, IShellItem item, string name, int result, IShellItem created) { return 0; }
        public int PreMoveItem(uint flags, IShellItem item, IShellItem destination, string name) { return unchecked((int)0x80004004); }
        public int PostMoveItem(uint flags, IShellItem item, IShellItem destination, string name, int result, IShellItem created) { return 0; }
        public int PreCopyItem(uint flags, IShellItem item, IShellItem destination, string name) { return unchecked((int)0x80004004); }
        public int PostCopyItem(uint flags, IShellItem item, IShellItem destination, string name, int result, IShellItem created) { return 0; }
        public int PreDeleteItem(uint flags, IShellItem item) {
            // TSF_DELETE_RECYCLE_IF_POSSIBLE must be retained by the Shell. Refuse a permanent-delete path.
            if ((flags & 0x80) == 0) return unchecked((int)0x80004004);
            SawRecycle = true; return 0;
        }
        public int PostDeleteItem(uint flags, IShellItem item, int result, IShellItem created) {
            if (result < 0) Failure = result;
            VerifiedDestination = result >= 0 && created != null && (flags & 0x80) != 0;
            return 0;
        }
        public int PreNewItem(uint flags, IShellItem destination, string name) { return unchecked((int)0x80004004); }
        public int PostNewItem(uint flags, IShellItem destination, string name, string template, uint attributes, int result, IShellItem created) { return 0; }
        public int UpdateProgress(uint total, uint completed) { return 0; }
        public int ResetTimer() { return 0; }
        public int PauseTimer() { return 0; }
        public int ResumeTimer() { return 0; }
    }
    public static class Recycle {
        [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
        private static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItem item);
        public static bool File(string path) {
            var sink = new RecycleOnlySink();
            var operation = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
            IShellItem item = null;
            try {
                // FOFX_RECYCLEONDELETE | FOFX_EARLYFAILURE | FOFX_ADDUNDORECORD,
                // plus NOERRORUI, WANTNUKEWARNING, NO_CONNECTED_ELEMENTS, NORECURSION, NOCONFIRMATION.
                // No elevation flags are used. Any Shell attempt to skip recycling is cancelled by the sink.
                operation.SetOperationFlags(0x00080000 | 0x00100000 | 0x20000000 | 0x0400 | 0x4000 | 0x2000 | 0x1000 | 0x0010);
                Guid iid = typeof(IShellItem).GUID;
                SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
                operation.DeleteItem(item, sink);
                operation.PerformOperations();
                bool aborted; operation.GetAnyOperationsAborted(out aborted);
                if (aborted || sink.Failure < 0 || !sink.SawRecycle || !sink.VerifiedDestination) throw new InvalidOperationException("Recycle operation aborted or no recycled destination was verified; restore from the pre-operation backup if needed.");
                return true;
            } finally {
                if (item != null) Marshal.FinalReleaseComObject(item);
                Marshal.FinalReleaseComObject(operation);
                GC.KeepAlive(sink);
            }
        }
    }
}
'@
            $recycled = [LaptopRecycle.Recycle]::File($filePath)
            [ordered]@{ recycled = $recycled; path = $filePath; recycledDestinationVerified = $true }
        }
    }
    $arrayOperations = @('drives', 'applications', 'discover-apps', 'windows')
    if ($Operation -in $arrayOperations -and ($null -eq $result -or @($result).Count -eq 0)) {
        "[]"
    } elseif ($null -eq $result) {
        "null"
    } else {
        ConvertTo-Json -InputObject $result -Depth 20 -Compress
    }
} catch {
    [Console]::Error.WriteLine('Windows bridge failed: ' + $_.Exception.Message)
    exit 1
}
