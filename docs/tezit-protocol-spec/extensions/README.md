# Tezit Protocol Extension Registry

The extension registry is the canonical directory of extensions to the [Tezit Protocol](https://github.com/tezit-protocol/spec). Extensions enhance the protocol with additional capabilities -- structured facts, analytics, cryptographic signing, and more -- without breaking compatibility with implementations that do not support them.

A Tez that includes extensions remains a valid Tez. Implementations that encounter an unrecognized extension MUST ignore it gracefully, preserving the core bundle for interrogation and sharing.

## How Extensions Work

Extensions add optional functionality to a Tez bundle. Each extension occupies its own directory within the bundle's `extensions/` folder:

```
my-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   └── ...
└── extensions/
    └── tezit-facts/
        ├── manifest.json
        └── facts.json
```

The extension's `manifest.json` declares its identity and version:

```json
{
  "extension_id": "tezit-facts",
  "extension_version": "1.0",
  "name": "Structured Facts",
  "description": "Structured facts extraction with provenance tracking",
  "author": "Tezit Protocol",
  "url": "https://github.com/tezit-protocol/spec/extensions/standard/tezit-facts"
}
```

Extensions are additive. They never modify the core manifest schema or change how synthesis, context, or citations work. A conforming implementation can safely strip all extensions and still have a fully functional Tez.

## Extension Naming

### Standard Extensions

Standard extensions use the `tezit-*` prefix and are maintained in this registry under [`standard/`](./standard/). These extensions have been reviewed, accepted, and are part of the official protocol.

Examples: `tezit-facts`, `tezit-relationships`, `tezit-signing`

### Vendor Extensions

Vendor extensions use reverse-domain naming to avoid conflicts. They are documented under [`vendor/`](./vendor/) for discoverability but are maintained by their respective organizations.

Examples:
- `com.ragu.fga-access` -- Ragu Platform's fine-grained access control
- `chat.mypa.team-sync` -- MyPA.chat's team synchronization

Vendor extensions that prove broadly useful may be proposed for standardization.

## Extension Lifecycle

Every extension progresses through a defined lifecycle:

| Status | Description |
|--------|-------------|
| **Draft** | Under active development. Schema may change without notice. Not recommended for production use. |
| **Proposed** | Submitted for standardization. Open for community feedback. Schema is stabilizing but may still change. |
| **Standard** | Accepted into the protocol. Schema is stable. Breaking changes require a new major version. |
| **Deprecated** | Superseded or no longer recommended. Implementations SHOULD still support for backward compatibility. |

```
draft --> proposed --> standard --> deprecated
                  \-> rejected
```

## Proposing an Extension

Anyone can propose a new standard extension. The process:

1. **Fork** the [spec repository](https://github.com/tezit-protocol/spec)
2. **Create** a directory under `extensions/proposed/{extension-name}/`
3. **Write** a `spec.md` covering purpose, schema, examples, and compatibility notes
4. **Open a PR** with the `extension-proposal` label
5. **Community review** runs for a minimum of 2 weeks
6. **Maintainer decision**: accept, request revisions, or reject

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution process.

## Related Resources

- [Tezit Protocol Specification](https://github.com/tezit-protocol/spec) -- the core protocol
- [Standard Extensions](./standard/) -- officially accepted extensions
- [Vendor Extensions](./vendor/) -- registered vendor namespaces
- [Proposed Extensions](./proposed/) -- extensions under review
- [tezit.com/spec](https://tezit.com/spec) -- protocol website
- [Coordination Profile Specification](../TEZ_COORDINATION_PROFILE.md) -- full coordination profile spec
- [Code Review Profile Specification](../TEZ_CODE_REVIEW_PROFILE.md) -- code review profile spec
- [TIP Enterprise Addendum](../TEZ_TIP_ENTERPRISE_ADDENDUM.md) -- enterprise TIP extensions
