# Windows setup and desktop acceptance

Use Windows 11 with Node.js 24.15 or newer supported LTS, npm, the installed Codex CLI, and Windows PowerShell 5.1. The fixed bridge uses Windows' built-in UI Automation, Win32 APIs, Windows Forms, System.Drawing, and Shell IFileOperation; no background input recorder, service, global keyboard hook, or administrator escalation is installed.

The development environment reported Windows build 26200, display version 25H2, Node 24.15.0, and Windows PowerShell 5.1. Registry `ProductName` can retain the legacy Windows 10 label; the build/version fields are reported separately. During this Codex session, sandboxed Windows PowerShell denied script execution, while the same read-only bridge test outside the sandbox succeeded without policy changes. Do not add `-ExecutionPolicy Bypass` to the launcher. If your normal Windows terminal enforces a script-signing policy, use approved signing or ask your Windows administrator for the appropriate policy; the project does not change it automatically.

## Authorize an application

Applications use absolute `.exe` paths and configured fixed arguments. For example, create an `application.json` inside this project:

```json
{
  "id": "notepad",
  "executable": "C:\\Windows\\System32\\notepad.exe",
  "args": [],
  "processNames": ["notepad"]
}
```

Then run the local configuration command, review the preview, and type `AUTHORIZE`:

```powershell
npm.cmd run configure -- --add-application .\application.json
npm.cmd run configure -- --enable-desktop notepad
```

Repeat with the actual installed `.exe` path/process names for VS Code, Windows Terminal, Word (`WINWORD`), Excel (`EXCEL`), PowerPoint (`POWERPNT`), File Explorer (`explorer`), Java or Android Studio tools. Installation paths vary; confirm them locally. A `.cmd` launcher is not an application executable; configure the actual executable. The server never supplies arbitrary shell arguments to an application launch. Code/script files such as `.py`, `.js`, and `.ts` must open through an approved editor rather than a default Windows association that could execute them.

Desktop automation is disabled initially. Enabling a process explicitly grants access to that application's visible accessible controls. Restart the MCP server after configuration changes. Keep only the intended application window in the foreground when applying input. Every input operation rechecks that the input desktop is `Default`, recent physical user activity is within the configured limit, the window is visible, and its process identity still matches. Idle detection is a recent-activity safeguard; it cannot prove continued physical presence or identity.

## UI Automation behavior

`desktop_inspect` returns bounded visible control names, runtime identifiers, types, supported patterns, and bounds. It omits secure fields and their subtrees, and never reads `ValuePattern.Value` or global keystrokes. `desktop_click` uses accessible Invoke, SelectionItem, Toggle, or ExpandCollapse patterns. `desktop_type` uses ValuePattern only on ordinary writable Edit controls, with password and credential checks. It does not inject Enter or global keys. `desktop_scroll` uses ScrollPattern. Controls whose providers lack these patterns are rejected; custom canvas interfaces may require a different approved integration.

`desktop_screenshot` uses `PrintWindow` on one explicitly approved foreground window. It refuses capture if a secure/credential control exists, secure-control inspection exceeds its bound, the foreground window changes, or safe window capture is unsupported. It does not fall back to whole-screen capture. Some GPU-rendered applications return incomplete/black content despite successful `PrintWindow`; verify the output visually. A UI provider that mislabels sensitive content cannot be made trustworthy by these controls alone, so keep credential workflows outside authorized automation windows.

`application_close` sends a graceful `WM_CLOSE` request after confirmation. It does not call `Stop-Process`, `taskkill`, or terminate processes. Windows keeps normal unsaved-work dialogs; the user handles them. Critical system/controller processes are refused even if included in configuration. App/window enumeration does not collect command lines or process environment variables.

Single-file deletion uses Shell `IFileOperation` with `FOFX_RECYCLEONDELETE`. A progress sink cancels a delete lacking the recycle transfer flag, and successful output requires a verified recycled destination. No permanent-delete fallback or elevation flag is enabled. The filesystem module makes a pre-operation backup; retain it if the Shell reports an uncertain or aborted result. Native helper compilation and the recycle-only cancellation guard are automated tests; actual Shell recycling still needs the supervised disposable-file acceptance test below. Microsoft's [operation flags reference](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags) documents the recycle flag.

## Acceptance tests using disposable files

The automated suite tests adapters with stubs and parses the full PowerShell bridge. With `WINDOWS_LIVE_TESTS=1`, it also executes real read-only info, drive, visible-window, and active-window operations:

```powershell
$env:WINDOWS_LIVE_TESTS = '1'
npm.cmd test
Remove-Item Env:WINDOWS_LIVE_TESTS
```

Interactive effects need a separate supervised acceptance pass. Use the server's own `workspace` directory and an empty, disposable Notepad window. Close personal document windows before the test. Remain present, keep the desktop unlocked, and approve only the exact fixture operations displayed in Codex and the local dialog.

| Feature | Disposable acceptance action | Expected result |
| --- | --- | --- |
| Application launch | Preview then apply `application_open` for approved Notepad with a fixture text path | Preview has no effect; apply opens the file after approval |
| Window identity | Run `window_list` and `window_get_active`, then preview/apply `window_focus` for the fixture | Correct handle/process pair; stale pairs fail |
| Inspection | Run `desktop_inspect` for the authorized Notepad window | Ordinary visible UI names and runtime IDs; no passwords/values |
| Ordinary text | Preview then apply `desktop_type` to the fixture's writable Edit control | Only that field is replaced; no submission occurs |
| Accessible control | Preview then apply `desktop_click` to an innocuous fixture menu/button | Only the supported accessible action occurs after approval |
| Scroll | Apply `desktop_scroll` to a fixture exposing ScrollPattern | Container scrolls, or an unsupported-pattern error is returned |
| Capture | Preview then apply `desktop_screenshot` to a new workspace PNG | Only the fixture window is saved; visually inspect the PNG |
| Secure control | Use a purpose-built dummy password form, with no real secret | Secure fields are omitted; type and screenshot are denied |
| Cancellation | Cancel Codex approval or the local Windows dialog | No input/file/app change occurs |
| Presence/lock | Try input after exceeding the idle limit or locking Windows | Input is refused; user returns/unlocks before retrying |
| Unsaved close | Edit the fixture, then preview/apply `application_close` | Normal unsaved-work prompt remains; choose Cancel to keep the fixture |
| Recycle Bin | Create and back up one disposable workspace file, preview/delete it | Exact single file moves to Recycle Bin after two approvals; no permanent-delete fallback |
| Recovery | Restore a fixture using its backup tool, or restore from Recycle Bin | Original fixture contents return |
| Emergency stop | Start only a disposable operation, invoke emergency stop | Managed work stops; new work remains blocked until local RESUME |

These interactive actions were not exercised against personal applications during development. Passing adapter/static tests does not establish that every installed third-party application's accessibility provider behaves correctly.

## Troubleshooting

- **Desktop disabled/process not approved:** authorize the executable and desktop process name locally, then restart the server.
- **User absent/desktop locked:** return to the computer, unlock it, and physically move the mouse or use the keyboard.
- **Foreground mismatch:** select the intended approved window and inspect it again.
- **Stale element/window:** rerun inspection and use the new runtime identifier/handle/process pair.
- **Unsupported pattern:** use another accessible control or the application's approved file/API integration.
- **Script policy failure only inside Codex:** inspect the client sandbox and managed Windows policy; do not weaken policies automatically.
- **Screenshot refused:** keep passwords/credential controls outside the window. A refusal never triggers a full-screen fallback.

Microsoft's [UI Automation pattern overview](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-control-patterns-overview) describes the provider-dependent patterns used here.
