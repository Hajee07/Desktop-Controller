# Application launch policy

The user enabled automatic launches of ordinary approved/installed applications. Project configuration sets applicationLaunchPolicy.automaticApproved and allowInstalled to true. Host approval overrides cover application_open and application_discover only. Existing configurations without this policy retain confirmation.

Use application_discover to find configured IDs and installed application names/IDs. Discovery reads Windows App Paths and Start Menu shortcuts targeting existing local EXEs without shortcut arguments. Names must be unambiguous. Registrations are rechecked before launch. Discovered applications launch without document arguments; reviewed configured integrations can open authorized ordinary files/project directories. Known command/runtime/installer hosts are excluded from automatic discovery. Configured command arguments retain confirmation.

This permission does not grant installation, elevation, file deletion, desktop input, external submission or new app screenshot permission. Normal Windows UAC, unlocked-desktop and recent-user-presence checks remain enforced. Apps missing supported registrations or requiring arguments may need a reviewed integration.

Verification: 13 Windows tests passed. Real STDIO discovery returned 94 launch entries (some aliases share executables). A discovered Chrome launch preview passed. Notepad launch returned success without host elicitation. No apps were closed. See APPLICATION-LAUNCH-POLICY-VERIFICATION.json. Restart the client to load the new server/catalog and host settings.
