# Desktop capture permission

Capture is configured for previously authorized Notepad, Chrome, VS Code and Word process names. `desktop.captureEnabled: true` independently permits the existing per-window screenshot tool. `desktop.enabled: false` keeps desktop inspection/click/type/scroll automation disabled. Older configurations without captureEnabled continue to inherit their existing desktop.enabled setting for capture.

Tool previews remain inert. Actual capture retains host and local confirmation, authorized PNG paths, approved foreground window identity, recent physical presence, unlocked desktop, credential-field checks and image bounds. Only the requested application window is captured.

Build and 20 focused tests passed. One live bridge test was skipped pending execution-policy setup. Fresh STDIO configuration_get verified the capture flag and process allowlist. No actual screenshot was taken. Windows PowerShell currently reports Restricted; screenshot execution and its local approval dialog remain blocked until a separately authorized policy setup. No execution policy or global Codex configuration was changed. Reconnect the MCP server to load this configuration/build.

## Approved Windows PowerShell setup

The user subsequently authorized CurrentUser RemoteSigned and approved the separate local Windows confirmation showing the exact command. Windows PowerShell effective and CurrentUser policies now both report RemoteSigned; machine-wide and managed policies were not changed. The prior Undefined scope policy was backed up, and rollback is `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Undefined -Force`. See WINDOWS-POWERSHELL-POLICY-SETUP.json for the local approval receipt and backup location.

After setup, all 11 Windows tests passed with zero skips, including real Windows bridge information queries. Fresh STDIO configuration, system information, window listing and active-window queries passed. The desktop was interactive/unlocked at verification. An actual screenshot was not taken; screenshot approval, application foreground, presence and secure-field restrictions remain enforced.
