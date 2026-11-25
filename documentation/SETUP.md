# Setup and authorization

For current 3.0 requirements, absolute startup commands, registration and tested limitations, see [ULTIMATE-V3.md](ULTIMATE-V3.md). Start with scripts/setup.ps1; existing policy is preserved.


Use Windows 11 with a supported Node.js LTS release (this environment: Node 24.15.0), npm, and Windows PowerShell 5.1. PowerShell 7 can run the setup commands. Do not run as administrator. Keep the source/config directories writable only by your own trusted account.

The README contains clean-install commands. `npm ci --ignore-scripts` installs only project dependencies; Chromium is downloaded explicitly to `.state/browsers`. `npm run configure -- --init` creates an initial config without replacing an existing one. It grants only `workspace`, Notepad launch, local port 3000 browser origins, and Node version inspection. The server fails startup if configuration is absent or invalid.

## Add a folder or drive

```powershell
npm run configure -- --add-root 'D:\Projects'
```

The folder must exist. The CLI displays the resulting configuration and requires the literal `AUTHORIZE` before saving a project-local backup and the change. An entire drive is supported through this same process, but sensitive/system paths, server source/state, links and hardlinks remain blocked. Prefer the smallest useful project folder. Restart the server after changing policy. To remove access, edit `config.json` locally, remove the root, rebuild only if source changed, and restart.

## Authorize an app

Create a project-local JSON file containing `id`, the actual absolute `.exe` path, `args` (a fixed string array), and `processNames` (without `.exe`). For example, obtain VS Code's installed executable location from its shortcut, then use that exact path. Import with:

```powershell
npm run configure -- --add-application .\application.json
npm run configure -- --enable-desktop notepad
```

The initial Notepad entry in `config.example.json` shows the exact shape. `--enable-desktop` accepts a process name from an already authorized application. Word/Excel/PowerPoint/VS Code/Terminal/Android Studio can be enabled this way; their installed executable paths differ by machine. Do not authorize controller/system processes. Default-file opening deliberately rejects executable scripts and shortcuts; open code through an approved editor.

## Authorize a website

```powershell
npm run configure -- --add-origin 'http://localhost:5173'
```

Use an exact HTTP(S) origin, including port and without a trailing slash. The same policy governs redirects/subresources. Add needed CDN origins explicitly. A dedicated browser profile is created on first approved use; it never imports your personal sessions.

## Development commands

Command JSON contains `id`, `executable` (absolute `.exe`), `args` (fixed argv), `description` (exact expected effects), `requiresConfirmation` and `allowNetwork`. Import it with `--add-command command.json`. The executable path is separate from each argument; do not provide a shell string.

For npm, use the installed `node.exe` with the actual `npm-cli.js` path followed by `run`, `build` or `test`. For Python use your actual `python.exe` plus `-m`, `pytest`; for Java use actual `java.exe` plus an approved build-tool JAR and fixed arguments. For Git use actual `git.exe` and fixed subcommands. Batch/PowerShell scripts are not executables; approve their interpreter and fixed file explicitly. Commands can support React, Python, Java, Android/Gradle, debugging and dependency installation without granting a general shell.

All non-version commands require confirmation. Child scripts execute as your Windows account; cwd and `allowNetwork` are not OS sandboxes. Configure only trusted scripts. The run/test tools capture bounded output with a deadline. Managed development-server tools retain owned sessions for status/log access and emergency cleanup; configure server scripts to bind `127.0.0.1` explicitly. The MCP server itself exposes no HTTP listener.

## Databases

Database JSON requires an `id`, `driver` (`sqlite`, `mysql`, `postgres`) and `allowWrite` (default false). SQLite additionally requires an authorized absolute `path`. Remote databases use `host`, `port`, `database`, `user`, and `passwordEnv` (environment-variable NAME only). Import with `--add-database database.json`; the strict schema rejects a password property.

Set the password environment variable in the environment used to launch Codex. Rerun the registration preview after adding a database so it includes that variable name in `env_vars`; no value is written. Use least-privilege test accounts. This version does not expose custom TLS settings, so use trusted localhost services or a secured local tunnel.

Query parameters use `?` for SQLite/MySQL and `$1`, `$2`, ... for PostgreSQL. Read tools accept a strict single SELECT subset. Writes require a non-empty parameter list, `allowWrite: true`, a preview, and both confirmations. UPDATE/DELETE require WHERE and more than 100 direct changed rows rolls back. SQLite has consistent online backups. Bounded exports are available in JSON/CSV.

For full single-database remote backups, configure a fixed native dump command and supply its `commandId` to `database_backup`. PostgreSQL requires absolute `pg_dump.exe` with matching `--host`, `--port`, `--username`, `--dbname`, `--file` and `--no-password`; only single-file plain/custom/tar formats are supported. MySQL requires absolute `mysqldump.exe`, `--no-defaults` first, `--no-login-paths`, `--single-transaction`, `--routines`, `--events`, `--triggers`, matching `--host`, `--port`, `--user`, `--result-file`, and exactly the configured database name. Use only supported long flags. The fixed output must exactly match a new authorized requested path. Passwords use the configured environment variable and never argv; default personal credential files are excluded. The operation always requires both approvals. Cluster globals and MySQL nontransactional-table consistency require separate DBA planning. Actual remote services/utilities remain live-untested here.

## Recovery and emergency stop

File edit requires `expectedSha256` returned by `filesystem_read`. `filesystem_backup` returns a protected UUID `.bak` reference. `filesystem_restore` accepts only such backups and requires dual confirmation before replacing an authorized target. Database SQLite backups are standalone `.sqlite` files. Audit records contain metadata only. Keep backups private.

`npm run stop` persists `.state/STOP`. To clear it locally, use `npm run configure -- --resume`, type `RESUME`, and restart Codex's server connection. Stop cannot reverse actions already completed in applications or remote accounts.
