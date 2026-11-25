# Hajzyy-MCP

Private plugin for the existing Windows Laptop Control MCP 3.0 installation on Hajzzy's laptop. `mcp.json` points to the already built local STDIO server. The server code, data, configuration, backups, credentials, and personal documents are not packaged here.

The package supplies a workflow skill and one local MCP connection. It does not install Node, Office, Chrome, or a Windows service. Use the existing project configuration for directory, application, browser and protected-operation policy. If Codex already has `windows_laptop` registered separately, avoid running two simultaneous connections to the same local server; disable one registration after verifying the plugin connection.
