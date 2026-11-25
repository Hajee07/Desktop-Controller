# Development and validation checklist

Historical baseline checklist. See [the current 3.0 checklist](ULTIMATE-CHECKLIST.md) and [verification](ULTIMATE-FINAL-VERIFICATION.json).


- [x] Inspect local environment and current official SDK documentation.
- [x] Define modular STDIO architecture and shared authorization interfaces.
- [x] Install pinned dependencies and build; locked dependency audit is clean.
- [x] Implement and test canonical path checks, confirmations, audit, timeouts, emergency stop.
- [x] Implement and test filesystem/document/report/backup features.
- [x] Implement and test Windows/UI Automation adapters and real read-only bridge queries.
- [x] Implement and test dedicated-profile Playwright tools on a disposable website.
- [x] Implement and test approved commands/development sessions/SQLite; implement remote database and native dump paths with plan/denial tests.
- [x] Exercise required-input schemas, denial paths, both approval layers, replay protection and STDIO discovery (63 tools).
- [x] Prepare concrete registration preview and verify in isolated Codex configuration.
- [ ] User-supervised GUI/local-dialog/actual Recycle Bin acceptance.
- [ ] MySQL/PostgreSQL live service and native dump acceptance after explicit connection setup.
- [ ] User approves live registration; connect after restart.

Tests use project-owned temporary fixtures. Interactive Windows and external database tests are recorded separately from unit tests.

See VALIDATION.md for exact counts, results and honest verification limits. Overall live installation is pending the remaining user acceptance steps.
