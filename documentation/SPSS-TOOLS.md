# SPSS MCP tool reference

Generated from the actual STDIO tools/list response. The input schemas are authoritative. File paths must be absolute and authorized.

## spss_dataset_inspect

Read the variable dictionary and case count of an authorized SAV or ZSAV using IBM SPSS. Does not return individual records.

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "limit": {
      "default": 100,
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "required": [
    "path"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_analysis_run

Preview or run native SPSS descriptives, frequencies, Pearson correlation, Cronbach alpha, or linear regression on an authorized SAV/ZSAV. Saves a new SPV without modifying the dataset or an existing file.

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "procedure": {
      "type": "string",
      "enum": [
        "descriptives",
        "frequencies",
        "correlation",
        "reliability",
        "regression"
      ]
    },
    "variables": {
      "minItems": 1,
      "maxItems": 30,
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[A-Za-z][A-Za-z0-9_]{0,63}$"
      }
    },
    "dependent": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,63}$"
    },
    "outputPath": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "path",
    "procedure",
    "variables",
    "outputPath"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_environment

Detect the real SPSS 27 installation, bundled interpreter, installed commands and backend integration.

```json
{
  "type": "object",
  "properties": {},
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_version

Read the installed SPSS product version and the active bundled Python and plugin versions.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_capabilities

Query native SPSS SHOW LICENSE and installed command definitions. Reports license evidence separately from procedure execution verification.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_list_modules

Query native SPSS SHOW LICENSE and installed command definitions. Reports license evidence separately from procedure execution verification.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_list_procedures

Query native SPSS SHOW LICENSE and installed command definitions. Reports license evidence separately from procedure execution verification.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_check_license_features

Query native SPSS SHOW LICENSE and installed command definitions. Reports license evidence separately from procedure execution verification.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_list_commands

List installed SPSS 27 command XML definitions with pagination and optional name filtering.

```json
{
  "type": "object",
  "properties": {
    "search": {
      "default": "",
      "type": "string",
      "maxLength": 100
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "limit": {
      "default": 100,
      "type": "integer",
      "minimum": 1,
      "maximum": 200
    }
  },
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_list_extensions

Discover installed non-Syntax extension command definitions and language/version metadata without installing packages.

```json
{
  "type": "object",
  "properties": {},
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_extension_details

Read one discovered installed extension command definition, language and declared version.

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  "required": [
    "name"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_execute_extension

Execute a discovered native KNN extension through guarded SPSS syntax and actual OMS capture. Third-party programming packages require separate review.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    },
    "extensionName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey",
    "extensionName"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_start_session

Start or recover an owned SPSS backend by session ID using the bundled Python 3.8 integration.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_session_status

Read backend process health, dataset checkpoints, active dataset, revision and execution history.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_connection_status

Read immediate owned-backend health and busy status without waiting behind a running analysis.

```json
{
  "type": "object",
  "properties": {},
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_cancel_session

Cancel a running operation by stopping only the matching connector-owned SPSS process tree. Recover the last committed checkpoint before retrying.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_list_sessions

Find locally stored managed SPSS session checkpoints for explicit recovery after reconnecting.

```json
{
  "type": "object",
  "properties": {},
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_stop_session

Stop the owned backend after preserving existing checkpoints. Closes only this connector backend process tree.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_reset_session

Restart the owned SPSS backend and recover its committed dataset checkpoints.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_list_datasets

List managed dataset names, original sources, checkpoint files and the active dataset.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_activate_dataset

Activate one named dataset in the persistent managed backend.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    }
  },
  "required": [
    "sessionId",
    "dataset"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_close_dataset

Close one managed dataset after its automatic checkpoint has been committed.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    }
  },
  "required": [
    "sessionId",
    "dataset"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_create_dataset

Create a managed dataset through the native SPSS Dataset API from bounded variable definitions and rows.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "variables": {
      "minItems": 1,
      "maxItems": 100,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
          },
          "width": {
            "default": 0,
            "type": "integer",
            "minimum": 0,
            "maximum": 32767
          }
        },
        "required": [
          "name"
        ],
        "additionalProperties": false
      }
    },
    "rows": {
      "default": [],
      "maxItems": 1000,
      "type": "array",
      "items": {
        "maxItems": 100,
        "type": "array",
        "items": {
          "anyOf": [
            {
              "type": "number"
            },
            {
              "type": "string",
              "maxLength": 32767
            },
            {
              "type": "null"
            }
          ]
        }
      }
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "sessionId",
    "dataset",
    "variables"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_copy_dataset

Use native SPSS dataset copy and commit a recoverable checkpoint.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "name": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "sessionId",
    "dataset",
    "name"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_rename_dataset

Use native SPSS dataset rename and commit a recoverable checkpoint.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "name": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "sessionId",
    "dataset",
    "name"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_dataset_metadata

Read paginated native variable names, labels, storage types, formats, measurement levels and roles.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "limit": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_variable_dictionary

Read paginated native variable names, labels, storage types, formats, measurement levels and roles.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "limit": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_preview_data

Read bounded actual rows from the managed active dataset through the native SPSS cursor.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "limit": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_open_dataset

Open authorized SAV/ZSAV, POR, Excel, delimited text, Stata or SAS data into a named owned dataset. Text import requires explicit column formats.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "sheet": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 1000
    },
    "columns": {
      "maxItems": 500,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
          },
          "format": {
            "type": "string",
            "pattern": "^(?:F\\d{1,3}(?:\\.\\d{1,2})?|A\\d{1,5})$"
          }
        },
        "required": [
          "name",
          "format"
        ],
        "additionalProperties": false
      }
    },
    "delimiter": {
      "default": ",",
      "type": "string",
      "enum": [
        ",",
        "\t",
        ";"
      ]
    },
    "firstCase": {
      "default": 2,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": [
    "sessionId",
    "path",
    "dataset"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_import_data

Open authorized SAV/ZSAV, POR, Excel, delimited text, Stata or SAS data into a named owned dataset. Text import requires explicit column formats.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "sheet": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 1000
    },
    "columns": {
      "maxItems": 500,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
          },
          "format": {
            "type": "string",
            "pattern": "^(?:F\\d{1,3}(?:\\.\\d{1,2})?|A\\d{1,5})$"
          }
        },
        "required": [
          "name",
          "format"
        ],
        "additionalProperties": false
      }
    },
    "delimiter": {
      "default": ",",
      "type": "string",
      "enum": [
        ",",
        "\t",
        ";"
      ]
    },
    "firstCase": {
      "default": 2,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": [
    "sessionId",
    "path",
    "dataset"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_save_dataset

Save a managed dataset to a new authorized SAV, ZSAV, CSV or XLSX file with no overwrite. Portable POR export is unavailable in the required Python 3 Unicode backend.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "sessionId",
    "dataset",
    "path"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_export_data

Save a managed dataset to a new authorized SAV, ZSAV, CSV or XLSX file with no overwrite. Portable POR export is unavailable in the required Python 3 Unicode backend.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "sessionId",
    "dataset",
    "path"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_validate_syntax

Validate complete native command syntax against the installed 27 definitions and connector filesystem policy. Semantic errors require execution against data.

```json
{
  "type": "object",
  "properties": {
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    }
  },
  "required": [
    "syntax"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_execute_syntax

Execute guarded native SPSS syntax with an exact dataset revision and idempotency key. Captures actual SPV, OMS XML, tables and warnings.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_execute_syntax_file

Read an authorized SPS file and execute its policy-validated syntax with checkpoint and actual OMS output.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    }
  },
  "required": [
    "sessionId",
    "expectedRevision",
    "requestKey",
    "path"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_create_syntax_file

Validate and save reproducible native SPSS syntax to a new authorized SPS file.

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "path",
    "syntax"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_analysis

Run supported native SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_procedure

Run supported native SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_statistical_test

Run tests SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_regression

Run regression SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_anova

Run anova SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_correlation

Run correlation SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_factor_analysis

Run factor SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_cluster_analysis

Run cluster SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_survival_analysis

Run survival SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_forecasting

Run forecasting SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_decision_tree

Run decision_tree SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_neural_network

Run neural_network SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_bootstrap

Run bootstrap SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_run_power_analysis

Run power SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_create_chart

Run chart SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_create_variable

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_compute_variable

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_recode_variable

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_select_cases

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_filter_cases

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_sort_cases

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_aggregate_data

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_transform_data

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_manage_value_labels

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_manage_missing_values

Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "syntax": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100000
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    }
  },
  "required": [
    "sessionId",
    "syntax",
    "expectedRevision",
    "requestKey"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_execute_python

Evaluate a bounded numerical Python expression in bundled SPSS Python 3.8. Supports arithmetic, math, aggregates, case_count() and variable_count().

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "expression": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    }
  },
  "required": [
    "sessionId",
    "expression"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_execution_logs

Read managed execution statuses and unresolved requests. An optional execution ID retrieves actual SPSS log text from OMS.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "limit": {
      "default": 50,
      "type": "integer",
      "minimum": 1,
      "maximum": 500
    },
    "executionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_output

Read paginated actual OMS table cells, numeric attributes, labels and footnotes from a completed SPSS execution.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "limit": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "executionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId",
    "executionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_output_items

Read paginated actual OMS table cells, numeric attributes, labels and footnotes from a completed SPSS execution.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "limit": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "executionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId",
    "executionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_pivot_table

Read paginated actual OMS table cells, numeric attributes, labels and footnotes from a completed SPSS execution.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "limit": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "executionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sessionId",
    "executionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_export_output

Copy a completed native SPSS output artifact to a new authorized path. PDF, XLSX, HTML and text must be requested when executing the analysis.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "executionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "format": {
      "type": "string",
      "enum": [
        "spv",
        "xml",
        "pdf",
        "xlsx",
        "html",
        "text",
        "sps"
      ]
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "sessionId",
    "executionId",
    "format",
    "path"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_generate_report

Save a native SPSS PDF, spreadsheet, HTML or text report generated by the requested execution. Select requested formats when executing analyses.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "executionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "format": {
      "type": "string",
      "enum": [
        "spv",
        "xml",
        "pdf",
        "xlsx",
        "html",
        "text",
        "sps"
      ]
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "sessionId",
    "executionId",
    "format",
    "path"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_chart

Retrieve an actual PNG/JPEG chart generated by SPSS HTML export. Requires html in the analysis formats. Returns native image pixels for inspection.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "executionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "index": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 499
    }
  },
  "required": [
    "sessionId",
    "executionId"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_merge_datasets

Add cases or match variables from two managed datasets using native SPSS syntax, with a checkpoint and exact revision.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "expectedRevision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "requestKey": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    },
    "formats": {
      "default": [],
      "maxItems": 4,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "pdf",
          "xlsx",
          "html",
          "text"
        ]
      }
    },
    "dataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "otherDataset": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
    },
    "mode": {
      "type": "string",
      "enum": [
        "add_cases",
        "match_variables"
      ]
    },
    "by": {
      "default": [],
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[A-Za-z][A-Za-z0-9_]{0,40}$"
      }
    }
  },
  "required": [
    "sessionId",
    "expectedRevision",
    "requestKey",
    "dataset",
    "otherDataset",
    "mode"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_output_open

Open an authorized .spv in native IBM SPSS Viewer; return file, Viewer title and output objects.

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "path"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_output_list

List native SPSS output tree objects and current selection.

```json
{
  "type": "object",
  "properties": {},
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_output_select

Select and display one SPSS output object by index in the native Viewer.

```json
{
  "type": "object",
  "properties": {
    "index": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999
    }
  },
  "required": [
    "index"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_output_values

Read paginated actual pivot-table cells from the native SPSS Scripting DataCellArray API.

```json
{
  "type": "object",
  "properties": {
    "index": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999
    },
    "rowOffset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "columnOffset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "maxRows": {
      "default": 50,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "maxColumns": {
      "default": 50,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": [
    "index"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_get_application_status

Read native SPSS GUI version, license options, open output paths and Data/Syntax Editor document counts.

```json
{
  "type": "object",
  "properties": {},
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_viewer_close_output

Close only the connector-selected Viewer document if SPSS reports no unsaved modifications.

```json
{
  "type": "object",
  "properties": {},
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_viewer_export_output

Export the connector-selected Viewer to a new authorized PDF, Word DOC, XLSX or text document.

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    },
    "format": {
      "type": "string",
      "enum": [
        "pdf",
        "doc",
        "xlsx",
        "text",
        "png"
      ]
    },
    "index": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "path",
    "format"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

## spss_viewer_export_chart

Export an actual selected SPSS chart object as a new authorized PNG.

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    },
    "format": {
      "type": "string",
      "enum": [
        "pdf",
        "doc",
        "xlsx",
        "text",
        "png"
      ]
    },
    "index": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999
    },
    "dryRun": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "path",
    "format"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

