# Codex Desktop connection

The local server uses STDIO. Codex starts `dist/index.js` with the detected absolute Node.js executable and project working directory. No HTTP listener is created.

From a normal, non-administrator PowerShell terminal in this project:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run configure -- --init
npm.cmd run check
.\scripts\register-codex.ps1
```

The registration command detects the Windows username, installation directory, Node, npm, and Codex. It checks dependencies, builds TypeScript, and runs the MCP startup/discovery smoke test before presenting the exact new TOML table. It saves that table to `documentation/codex-registration.toml`. The default command only previews; it does not change your Codex configuration.

To approve registration, run:

```powershell
.\scripts\register-codex.ps1 -Apply
```

Review the displayed paths and settings, then type `REGISTER` in that local terminal. Other input cancels. The Node.js entry point provides the same workflow when a PowerShell policy prevents running scripts:

```powershell
node .\scripts\register-codex.mjs
node .\scripts\register-codex.mjs --apply
```

Neither entry point changes execution policy or runs as administrator. Apply requires a real interactive terminal and cannot be authorized by a command-line `--yes` flag.

The configuration target is `$env:CODEX_HOME\config.toml`, when `CODEX_HOME` is set, otherwise the current Windows user's `.codex\config.toml`. Use `-ConfigPath` or `--config-path` only when you intentionally use another Codex configuration. Relative paths are resolved explicitly by the CLI. The generated table includes `default_tools_approval_mode = "prompt"`, disables parallel tool execution, and keeps Playwright downloads inside the project's `.state\browsers` folder. It does not loosen global Codex permissions or approval policies.

For configured databases, registration adds only the `passwordEnv` variable names to `env_vars`. Password values remain in your local process/account environment and are never copied into the snippet or registration logs. Restart Codex after adding account environment variables. The tested Codex 0.166.0 CLI accepted the generated configuration in an isolated `CODEX_HOME`; its `mcp get --json` output omits approval-policy fields, so verify the prompt policy in Desktop settings as part of live acceptance.

Existing TOML text, comments, and unrelated MCP entries are preserved byte for byte. An existing `mcp_servers.windows_laptop` entry causes a refusal rather than replacement. The script refuses symlinks/junctions, aliases, and hard-linked config files. It saves the original config next to the target with a unique `.windows-laptop-...bak` suffix, checks for concurrent changes, and installs the full new file with a same-directory atomic operation. Close config editors during registration: the lock coordinates these installers, while unrelated editors cannot participate in that lock.

Fully quit and restart Codex Desktop after registration. Inspect MCP settings or run `codex mcp list` in your normal terminal, then try:

1. `Call system_get_info using Windows Laptop Control MCP.`
2. `List the approved directories with filesystem_list.`
3. `Preview creating hello.txt in the server workspace; do not apply it yet.`

Applied destructive actions need both the connected host's confirmation flow and the separate local Windows dialog. Cancellation, unavailable elicitation, timeout, lock state, absent user, or emergency stop must deny the operation. A natural-language instruction alone does not substitute for these runtime approvals.

## Isolated registration tests

`npm.cmd test` tests registration against disposable config files under `.state`, including preservation, cancellation, malformed TOML, duplicate entries, concurrent writes, hard links, and junction parents. It never applies to your personal Codex configuration. An isolated CLI check can set `CODEX_HOME` to a newly created project-owned temporary directory and run `codex mcp list`; restore the previous environment value afterward. This validates config discovery; a restarted Desktop connection still requires live acceptance.

## Unregister and uninstall

First activate the emergency stop (`npm.cmd run stop`) and fully quit Codex. In your normal terminal, run `codex mcp remove windows_laptop`, or carefully remove only `[mcp_servers.windows_laptop]` and its nested environment table from your config. Review the resulting config to preserve other servers, then restart Codex. The registration backups contain your existing settings and should remain private.

After unregistration, preserve any needed reports, backups, audit records, and authorized workspace files. Remove this project's directory only after reviewing its contents. No Windows services, scheduled tasks, firewall changes, administrator accounts, or global dependencies are installed by this project. Revert any optional environment variables you added for database credentials through your normal Windows account settings.

## Official references

- [Codex MCP connection and STDIO configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)

These references were consulted during implementation on 3 November 2026. Installed clients and managed organization requirements can impose additional restrictions.
