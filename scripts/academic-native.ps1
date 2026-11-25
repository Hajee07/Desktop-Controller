# Cursor-free, fixed-operation native academic bridge. Payload is base64 JSON data.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('capabilities','ocr','render-docx')][string]$Operation,
    [Parameter(Mandatory=$true)][string]$Payload
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)

try {
    if($Payload.Length -gt 40000){throw 'Payload exceeds the native academic limit.'}
    $data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class AcademicNative {
    [StructLayout(LayoutKind.Sequential)] struct TOKEN_ELEVATION { public uint Elevated; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long ProcessTime,JobTime; public uint Flags; public UIntPtr MinWorkingSet,MaxWorkingSet; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint Priority,Scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong ReadOperations,WriteOperations,OtherOperations,ReadBytes,WriteBytes,OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT Basic; public IO_COUNTERS Io; public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory; }
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int type,out TOKEN_ELEVATION elevation,uint size,out uint returned);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,IntPtr info,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int processId);
    [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle,out uint processId);
    public static bool Elevated() {
        IntPtr token; if(!OpenProcessToken(GetCurrentProcess(),8,out token)) throw new Win32Exception();
        try { TOKEN_ELEVATION info; uint returned; if(!GetTokenInformation(token,20,out info,(uint)Marshal.SizeOf(typeof(TOKEN_ELEVATION)),out returned)) throw new Win32Exception(); return info.Elevated!=0; }
        finally { CloseHandle(token); }
    }
    public static IntPtr ContainOwnedWord(int processId) {
        IntPtr job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero) throw new Win32Exception();
        try {
            var limits=new EXTENDED_LIMIT(); limits.Basic.Flags=0x00002000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            int size=Marshal.SizeOf(limits); IntPtr pointer=Marshal.AllocHGlobal(size);
            try { Marshal.StructureToPtr(limits,pointer,false); if(!SetInformationJobObject(job,9,pointer,(uint)size)) throw new Win32Exception(); }
            finally { Marshal.FreeHGlobal(pointer); }
            IntPtr process=OpenProcess(0x0100|0x0001|0x1000,false,processId); if(process==IntPtr.Zero) throw new Win32Exception();
            try { if(!AssignProcessToJobObject(job,process)) throw new Win32Exception(); }
            finally { CloseHandle(process); }
            return job;
        } catch { CloseHandle(job); throw; }
    }
}
'@
    function Initialize-Ocr {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
        $null=[Windows.Storage.FileAccessMode,Windows.Storage,ContentType=WindowsRuntime]
        $null=[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
        $null=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
        $null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
        $null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
        $null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
        $null=[Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]
        $null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
    }
    function Await-WinRt($operation,[Type]$resultType){
        $method=[WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
        if($null -eq $method){throw 'WinRT task adapter is unavailable.'}
        $task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation))
        if(-not $task.Wait(30000)){$operation.Cancel();throw 'WinRT operation timed out.'}
        return $task.GetAwaiter().GetResult()
    }
    function Assert-LocalFile([string]$file,[string]$extension){
        if(-not [IO.Path]::IsPathRooted($file) -or $file.StartsWith('\\') -or -not [IO.File]::Exists($file)){throw 'An existing absolute local input file is required.'}
        if($extension -and [IO.Path]::GetExtension($file) -ne $extension){throw 'Unexpected file extension.'}
        $info=New-Object IO.FileInfo($file)
        if(($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Input reparse points are prohibited.'}
    }
    $result=switch($Operation){
        'capabilities' {
            $ocr=[ordered]@{available=$false;languages=@()}
            try{Initialize-Ocr;$languages=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object{[ordered]@{tag=$_.LanguageTag;displayName=$_.DisplayName}});$ocr=[ordered]@{available=($languages.Count -gt 0);languages=$languages;maxImageDimension=[Windows.Media.Ocr.OcrEngine]::MaxImageDimension}}catch{$ocr.error='Windows OCR or its language resources are unavailable.'}
            $word=[ordered]@{available=($null -ne [Type]::GetTypeFromProgID('Word.Application'))}
            $wordKey=Get-Item -LiteralPath 'Registry::HKEY_CLASSES_ROOT\Word.Application\CLSID' -ErrorAction SilentlyContinue
            if($wordKey){$cls=$wordKey.GetValue('');$server=Get-Item -LiteralPath ('Registry::HKEY_CLASSES_ROOT\CLSID\'+$cls+'\LocalServer32') -ErrorAction SilentlyContinue;if($server){$word.executable=$server.GetValue('')}}
            $commands=[ordered]@{}
            foreach($name in @('node.exe','python.exe','javac.exe','java.exe','gcc.exe','g++.exe','clang.exe','clang++.exe','cl.exe','git.exe','dotnet.exe')){
                $paths=@(Get-Command $name -All -ErrorAction SilentlyContinue | Where-Object{$_.CommandType -eq 'Application'} | ForEach-Object{$_.Source} | Select-Object -Unique)
                $commands[$name]=$paths
            }
            [ordered]@{platform='win32';elevated=[AcademicNative]::Elevated();word=$word;ocr=$ocr;commands=$commands}
        }
        'ocr' {
            $imagePath=[string]$data.imagePath
            Assert-LocalFile $imagePath ''
            if($imagePath -notmatch '(?i)\.(png|jpe?g|bmp|tiff?)$'){throw 'Unsupported OCR image format.'}
            if(([IO.FileInfo]$imagePath).Length -gt 25000000){throw 'OCR file exceeds the bridge read limit.'}
            Initialize-Ocr
            $language=[string]$data.language
            if($language -eq 'auto'){$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
            else{if($language -notmatch '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$'){throw 'Invalid OCR language tag.'};$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language($language)))}
            if($null -eq $engine){throw 'Requested OCR language is not installed. Inspect native capabilities; no language resources are installed automatically.'}
            $file=Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
            $stream=$null;$bitmap=$null
            try{
                $stream=Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
                $decoder=Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
                $maximum=[Windows.Media.Ocr.OcrEngine]::MaxImageDimension
                if($decoder.PixelWidth -gt $maximum -or $decoder.PixelHeight -gt $maximum){throw ('OCR image exceeds the native maximum dimension '+$maximum+'. Render a smaller page image.')}
                $bitmap=Await-WinRt ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
                $recognized=Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
                $lines=@();$count=0
                foreach($line in $recognized.Lines){
                    $left=[double]::PositiveInfinity;$top=[double]::PositiveInfinity;$right=0.0;$bottom=0.0
                    foreach($word in $line.Words){$rect=$word.BoundingRect;$left=[Math]::Min($left,$rect.X);$top=[Math]::Min($top,$rect.Y);$right=[Math]::Max($right,$rect.X+$rect.Width);$bottom=[Math]::Max($bottom,$rect.Y+$rect.Height)}
                    $entry=[ordered]@{text=$line.Text};if(-not [double]::IsInfinity($left)){$entry.bounds=[ordered]@{x=$left;y=$top;width=$right-$left;height=$bottom-$top}}
                    $lines+=,$entry;$count++;if($count -ge 10000){break}
                }
                $text=[string]$recognized.Text;$warnings=@('OCR is machine recognition; verify equations, tables, identifiers, and numerical values against the source image.')
                if($text.Length -gt 250000){$text=$text.Substring(0,250000);$warnings+='OCR text was truncated at 250000 characters.'}
                [ordered]@{text=$text;lines=$lines;language=$engine.RecognizerLanguage.LanguageTag;warnings=$warnings;width=$bitmap.PixelWidth;height=$bitmap.PixelHeight;textAngle=$recognized.TextAngle}
            }finally{if($bitmap){$bitmap.Dispose()};if($stream){$stream.Dispose()}}
        }
        'render-docx' {
            $source=[string]$data.source;$output=[string]$data.outputPdf
            Assert-LocalFile $source '.docx'
            if(-not [IO.Path]::IsPathRooted($output) -or $output.StartsWith('\\') -or [IO.Path]::GetExtension($output) -ne '.pdf' -or [IO.File]::Exists($output)){throw 'A new absolute local PDF output is required.'}
            if(-not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($output))){throw 'PDF staging parent is missing.'}
            $beforeWord=@(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object{$_.Id})
            if($beforeWord.Count -gt 0){throw 'A Word process is already running. To protect existing sessions, close Word or use direct PDF generation before native DOCX rendering.'}
            $word=$null;$document=$null;$job=[IntPtr]::Zero;$owned=$false;$originalSettings=$null;$createdProcessId=0
            try{
                $word=New-Object -ComObject Word.Application
                $newProcesses=@(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object{$beforeWord -notcontains $_.Id})
                if($newProcesses.Count -ne 1){throw 'Cannot uniquely identify a newly created Word instance. Existing sessions were not used or closed.'}
                $createdProcessId=[int]$newProcesses[0].Id
                $owned=$true
                $job=[AcademicNative]::ContainOwnedWord($createdProcessId)
                if($data.ownershipReportPath){
                    $ownershipPath=[string]$data.ownershipReportPath
                    if([IO.Path]::GetDirectoryName($ownershipPath) -ne [IO.Path]::GetDirectoryName($output) -or [IO.Path]::GetFileName($ownershipPath) -ne 'owned-word.json' -or [IO.File]::Exists($ownershipPath)){throw 'Invalid native ownership-report path.'}
                    [IO.File]::WriteAllText($ownershipPath,(@{processId=$createdProcessId;ownedProcess=$true;killOnJobClose=$true} | ConvertTo-Json -Compress))
                }
                $originalSettings=@{Visible=$word.Visible;DisplayAlerts=$word.DisplayAlerts;AutomationSecurity=$word.AutomationSecurity;UpdateLinksAtOpen=$word.Options.UpdateLinksAtOpen;SaveNormalPrompt=$word.Options.SaveNormalPrompt}
                $word.Visible=$false
                $word.DisplayAlerts=0
                $word.AutomationSecurity=3 # msoAutomationSecurityForceDisable, before opening any document.
                $word.Options.UpdateLinksAtOpen=$false
                $word.Options.SaveNormalPrompt=$false
                $document=$word.Documents.Open($source,$false,$true,$false)
                $word.Visible=$false
                [uint32]$documentProcessId=0
                [void][AcademicNative]::GetWindowThreadProcessId([IntPtr]$document.ActiveWindow.Hwnd,[ref]$documentProcessId)
                if($documentProcessId -ne $createdProcessId){throw 'Word document process identity does not match the owned automation instance.'}
                $document.Repaginate()
                $tocUpdated=0
                foreach($contents in $document.TablesOfContents){$contents.Update();$tocUpdated++}
                $document.Repaginate()
                $pageFieldsUpdated=0;$storyCount=0
                foreach($story in $document.StoryRanges){
                    $range=$story
                    while($null -ne $range){
                        $storyCount++;if($storyCount -gt 1000){throw 'Document story-range limit exceeded during safe page-field update.'}
                        # Main body and header/footer stories only. Never call generic Fields.Update.
                        if([int]$range.StoryType -in @(1,6,7,8,9,10,11)){
                            foreach($field in $range.Fields){
                                # wdFieldPage=33; wdFieldNumPages=26. Other field types are never updated here.
                                if([int]$field.Type -in @(33,26)){
                                    $pageFieldsUpdated++;if($pageFieldsUpdated -gt 5000){throw 'Page-field update limit exceeded.'}
                                    if(-not $field.Update()){throw 'Word could not update a PAGE or NUMPAGES field.'}
                                }
                            }
                        }
                        $range=$range.NextStoryRange
                    }
                }
                $document.Repaginate()
                $pages=[int]$document.ComputeStatistics(2)
                $document.ExportAsFixedFormat($output,17,$false)
                [ordered]@{pages=$pages;tablesOfContentsUpdated=$tocUpdated;pageFieldsUpdated=$pageFieldsUpdated;renderedWith='Microsoft Word COM';wordVersion=[string]$word.Version;cursorMoved=$false;sourceOpenedReadOnly=$true;macrosDisabled=$true;ownedProcess=$true}
            }finally{
                if($document){try{$document.Close(0)}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)}
                if($word -and $owned -and $originalSettings){try{$word.Options.UpdateLinksAtOpen=$originalSettings.UpdateLinksAtOpen;$word.Options.SaveNormalPrompt=$originalSettings.SaveNormalPrompt;$word.AutomationSecurity=$originalSettings.AutomationSecurity;$word.DisplayAlerts=$originalSettings.DisplayAlerts}catch{}}
                if($word){if($owned){try{$word.Quit(0)}catch{}};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
                if($job -ne [IntPtr]::Zero){[void][AcademicNative]::CloseHandle($job)}
                [GC]::Collect();[GC]::WaitForPendingFinalizers()
            }
        }
    }
    ConvertTo-Json -InputObject $result -Depth 20 -Compress
}catch{[Console]::Error.WriteLine('Academic native operation failed: '+$_.Exception.Message);exit 1}
