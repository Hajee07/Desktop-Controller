# Windows Laptop Control MCP 3.0

Codex is the only AI reasoning engine. This in-place upgrade preserves the existing server and adds native live Word/Excel/PowerPoint tools, genuine application-window screenshots, a 20 GB managed storage quota, persistent deterministic execution, disk-backed PDF page operations and a lightweight native dashboard. No additional AI model/provider/agent, Python package, startup service or internet-facing server was installed.

**Connected acceptance:** this Codex chat verified 3.0.0, 163 tools and actual native Word insert/save/readback. See [live connection proof](documentation/ULTIMATE-CODEX-LIVE-VERIFICATION.json).

**Current documentation:** [Upgrade architecture, setup and limitations](documentation/ULTIMATE-V3.md), [actual MCP tool schemas](documentation/TOOLS.md), [actual assignment acceptance](documentation/ULTIMATE-ACCEPTANCE.json), [native coding verification](documentation/ULTIMATE-CODING-VERIFICATION.json).

```powershell
Set-Location -LiteralPath 'C:\Users\Hajzzy\Documents\ChatGPT\Hajzzy!!-MCP 2\windows-laptop-control-mcp'
npm run build
npm run test:smoke
npm run dashboard
# Optional visible process for already prepared deterministic work:
npm run worker
```

The existing Codex STDIO registration points at this same project's `dist/index.js`. Fully quit/reopen Codex or reconnect the MCP server after updating; a new chat can retain an older server/catalog. `npm start` runs STDIO manually and waits for an MCP client. Windows entrypoints are `scripts/start.ps1`, `scripts/start.ps1 -Dashboard`, `scripts/start.ps1 -Worker` and `scripts/setup.ps1`.

Current authorization: project `workspace` and `D:\Assignment Files\Assignment Files\DSA`. Automatic working-copy edits are limited to project `workspace`; personal originals keep edit/save confirmations. Capture/UI control/launch are distinct permissions. New scoped host overrides reduce duplicate prompts while internal protected-operation approval/local dialogs remain enforced.

Browser navigation in this installation now accepts any ordinary HTTP(S) origin through the explicit `*` policy and uses the already installed Chrome with a dedicated automation profile. Website mutations and trusted-code execution retain their separate approval controls. [Browser policy verification](documentation/BROWSER-ANY-URL-VERIFICATION.json) records the requested OnlineGantt URL and safety checks.

Storage: **20 GB = 20,000,000,000 bytes** total; documents 5 GB, images 5 GB, research 3 GB, temporary 3 GB, history 1 GB and reserved/backups/browser binaries 3 GB. Current free-disk reserve is 5 GiB. File size remains 2 GiB; in-memory binary parsing is bounded to 256 MiB, Office XML 40 MiB, extracted text 2,500,000 code units. These are server limits, not Codex context/upload limits. No original documents or task history are automatically deleted.

The native dashboard has eleven state views, task controls, emergency stop, workspace opening and a floating panel. It uses existing WinForms/.NET 10 because PySide6 was absent. It is a structured-state inspector, not a full graphical file editor. Office stays open when its session helper disconnects. The optional worker executes finite allowlisted prepared steps and stops for additional Codex reasoning; it never runs an AI model after Codex ends.

Actual owned fixtures verified native Word text/image/table edits and PDF export, genuine window capture, Excel formula value 30, PowerPoint slide addition, PDF split/merge, queue result 5, and JavaScript/Python/Java execution. The final regression completed 145 pass, zero failures and three explicit environment/Word-session skips. Current final evidence and remaining untested features are in the upgrade guide.

## Requirements and verification

Use the existing Node.js 24 LTS installation, .NET 10 SDK (to build the native Windows helper), installed Microsoft Office desktop applications, and the existing Python document runtime configured locally. This project does not install Office, compilers, browsers or Python automatically. macOS/Linux are not supported for native application tools.

- Start or verify locally with `scripts/setup.ps1`; installing locked Node dependencies requires its explicit `-InstallDependencies` switch and local confirmation.
- `config.example.json` authorizes only this installation's workspace. The actual `config.json` preserves the user's authorized roots and integrations. Use `npm run configure -- --help` before changing local policy.
- Normal Codex startup uses the existing STDIO registration. For a different installation use `npm run register:preview`, inspect it and apply only after approval.
- Run `npm run build`, `npm test`, `npm run test:smoke`, `npm run test:academic` and `npm run reference`. Windows/Word/OCR acceptance needs the documented environment and installed applications.
- Emergency stop: `npm run stop`. Resume explicitly with `npm run configure -- --resume`; completed external effects are not automatically undone.

See [security boundaries](SECURITY.md), [troubleshooting](documentation/TROUBLESHOOTING.md), [tool schemas](documentation/TOOLS.md), [verification](documentation/ULTIMATE-FINAL-VERIFICATION.json) and the [historical baseline](documentation/README-1.2-HISTORY.md). The upgrade guide includes architecture, recovery, permissions, application limitations and uninstall instructions.
