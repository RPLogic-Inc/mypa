# Tezit Protocol v1.2 -- JSON Schemas

This directory contains machine-parseable JSON Schema files for validating data structures defined by the [Tezit Protocol Specification v1.2](../TEZIT_PROTOCOL_SPEC_v1.2.md) and the [Tez Interrogation Protocol (TIP)](../TEZ_INTERROGATION_PROTOCOL.md).

All schemas use [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/schema) and are published under `https://tezit.com/spec/v1.2/`.

---

## Schemas

### `manifest.schema.json`

**Full Manifest Schema (Platform Tez -- Level 3)**

Validates a complete `manifest.json` file for a Platform Tez. This is the most comprehensive schema covering all required and optional fields:

- **Required fields**: `tezit_version`, `id`, `version`, `created_at`, `creator` (with `name`), `synthesis` (with `title`, `type`, `file`), `context` (with `scope`, `item_count`, `items`)
- **Optional fields**: `updated_at`, `profile`, `surface` (messaging), `conversation`, `permissions`, `lineage`, `sharing`, `interrogation`, `privacy`, `parameters`, `extensions`
- **Context items**: Full descriptors with `id`, `type`, `title`, `file`, optional `hash`, `mime_type`, `size_bytes`, `external_uri`, `linked_source`, `access`, `metadata`

Use this schema when validating manifests produced by Tezit.com or any Level 3 conformant tool.

### `manifest-portable.schema.json`

**Portable Manifest Schema (Portable Tez -- Level 2)**

Validates the minimal `manifest.json` required for tool recognition and cross-platform interoperability. Only the following fields are required:

- `tezit_version`
- `id`
- `title`
- `created_at`
- `synthesis.file`

Additional fields are accepted (`additionalProperties: true`) but not required. Use this schema when validating exported tezits intended for sharing across platforms.

### `inline-tez.schema.json`

**Inline Tez Frontmatter Schema (Level 0)**

Validates the YAML frontmatter of an Inline Tez -- a single Markdown file with metadata in the front matter. Required fields:

- `tezit` (version string)
- `title`
- `profile`

Optional fields include `creator` (name, email), `context` (array of items with `label` and either `url` or `file`), `permissions`, and `tags`. Note that Inline Tez citations use `[[label]]` syntax rather than `[[item-id]]`.

### `conversation.schema.json`

**Conversation Record Schema**

Validates a `conversation.json` file within a Tez bundle. This records the AI conversation that produced the synthesis. Fields include:

- `model`, `model_version` -- AI model identification
- `system_prompt` -- the system prompt used (may be omitted for privacy)
- `turns` -- array of conversation turns with `role`, `content`, `timestamp`, `citations`, `tool_calls`, `tool_results`, and redaction support
- `total_tokens`, `duration_seconds` -- usage metrics
- `privacy_mode` -- sharing mode (`full`, `summary`, `redacted`, `excluded`)
- `redactions` -- bulk redaction entries

### `tip-query.schema.json`

**TIP Interrogation Query Schema**

Validates a query request submitted to a TIP-compliant interrogation endpoint. Fields:

- `query` (required) -- the natural-language question
- `session_id` -- active session identifier
- `max_tokens` -- response length limit (default: 2000)
- `response_format` -- `markdown`, `structured`, or `plain`
- `grounding_mode` -- `strict`, `standard`, or `exploratory`
- `preferences` -- per-query overrides for confidence signals, citation style, gap reporting, and language

### `tip-response.schema.json`

**TIP Interrogation Response Schema**

Validates a response returned by a TIP-compliant interrogation endpoint. Fields:

- `response_id` -- unique response identifier
- `response.text` -- full response with inline citations
- `response.classification` -- `grounded`, `inferred`, `partial`, or `abstention`
- `response.confidence` -- overall confidence: `high`, `medium`, or `low`
- `response.citations` -- array of verified citation objects (item_id, location, text_excerpt, verified)
- `response.gaps` -- information gaps (for partial/abstention responses)
- `response.inferences` -- explicit inferences with basis and reasoning
- `response.claims` -- optional per-claim confidence breakdown
- `session` -- current session state (query_count, tokens, remaining budget)
- `error` -- error details if the query could not be processed

---

## Usage

### Validation with ajv (Node.js)

```bash
npm install ajv ajv-formats
```

```javascript
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Load and compile a schema
const schema = JSON.parse(fs.readFileSync("manifest.schema.json", "utf-8"));
const validate = ajv.compile(schema);

// Validate a manifest
const manifest = JSON.parse(fs.readFileSync("path/to/manifest.json", "utf-8"));
const valid = validate(manifest);

if (!valid) {
  console.error("Validation errors:", validate.errors);
}
```

### Validation with Python (jsonschema)

```bash
pip install jsonschema
```

```python
import json
from jsonschema import validate, ValidationError

with open("schemas/manifest.schema.json") as f:
    schema = json.load(f)

with open("path/to/manifest.json") as f:
    manifest = json.load(f)

try:
    validate(instance=manifest, schema=schema)
    print("Valid!")
except ValidationError as e:
    print(f"Validation error: {e.message}")
```

### Validation with CLI tools

Using [check-jsonschema](https://check-jsonschema.readthedocs.io/):

```bash
pip install check-jsonschema

check-jsonschema --schemafile schemas/manifest.schema.json path/to/manifest.json
```

Using [ajv-cli](https://github.com/ajv-validator/ajv-cli):

```bash
npm install -g ajv-cli ajv-formats

ajv validate -s schemas/manifest.schema.json -d path/to/manifest.json --spec=draft2020 -c ajv-formats
```

---

## Schema Relationships

```
manifest.schema.json (Level 3 - Platform Tez)
    |
    |-- references conversation.schema.json (via conversation.file)
    |
    +-- superset of manifest-portable.schema.json (Level 2)

inline-tez.schema.json (Level 0 - Inline Tez)
    (standalone; single .md file with YAML frontmatter)

tip-query.schema.json  ------>  tip-response.schema.json
    (request)                       (response)
```

- A valid Level 3 manifest is always a valid Level 2 manifest (Level 2 is a subset).
- Inline Tez uses a separate schema because it represents YAML frontmatter, not a JSON manifest.
- TIP query and response schemas are used together as the request/response pair for interrogation endpoints.

---

## Conformance Levels

| Level | Name | Schema | Description |
|-------|------|--------|-------------|
| 0 | Inline Tez | `inline-tez.schema.json` | Single Markdown file with YAML frontmatter |
| 1 | Informal Tez | (none) | No manifest required; defined by intent |
| 2 | Portable Tez | `manifest-portable.schema.json` | Minimal manifest for cross-platform sharing |
| 3 | Platform Tez | `manifest.schema.json` | Full manifest with all platform features |

---

## License

These schemas are part of the Tezit Protocol Specification and are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
