# Contributing Extensions to the Tezit Protocol

This document describes how to propose, develop, and submit extensions for inclusion in the Tezit Protocol standard.

## Before You Start

Check the [standard extensions](./standard/) and [vendor extensions](./vendor/) to make sure your idea is not already covered. If an existing extension is close but not quite right, consider proposing an enhancement to that extension rather than creating a new one.

Extensions should be **additive** -- they enhance a Tez without modifying the core protocol. If your idea requires changes to the manifest schema, context format, or synthesis structure, it may belong in the core spec rather than as an extension. Open an issue on the [spec repository](https://github.com/tezit-protocol/spec) to discuss.

## Proposal Process

### 1. Fork the Spec Repository

Fork [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec) and create a branch for your proposal.

### 2. Create Your Extension Directory

Create a directory under `extensions/proposed/{extension-name}/` containing at minimum a `spec.md` file:

```
extensions/proposed/tezit-yourextension/
├── spec.md          # Required: full specification
├── schema.json      # Recommended: JSON schema for validation
└── examples/        # Recommended: example tezits using this extension
    └── example.tez/
```

### 3. Write the Specification

Your `spec.md` must include the following sections:

#### Purpose

What problem does this extension solve? Why is it needed? Who benefits from it?

#### Schema

The complete JSON schema for the extension's data files. Include field definitions with types, required/optional status, and descriptions.

```json
{
  "extension_id": "tezit-yourextension",
  "extension_version": "1.0",
  "name": "Your Extension Name",
  "description": "One-line description",
  "author": "Your Name or Organization",
  "url": "https://github.com/tezit-protocol/spec/extensions/standard/tezit-yourextension"
}
```

#### Examples

At least one complete example showing how a Tez looks with your extension applied. Include both the extension files and the relevant portion of the Tez manifest.

#### Compatibility Notes

- **Minimum protocol version:** Which version of the Tezit Protocol is required?
- **Graceful degradation:** What happens when an implementation does not support this extension? (The answer must always be "the Tez remains fully functional.")
- **Conflicts:** Does this extension conflict with or overlap any existing extensions?
- **Migration:** If this extension replaces or evolves from a vendor extension, describe the migration path.

### 4. Open a Pull Request

Open a PR against the spec repository with:

- **Title:** `extension-proposal: {extension-name}`
- **Label:** `extension-proposal`
- **Description:** A brief summary of the extension, the problem it solves, and any known implementers

### 5. Review Process

The review process has three stages:

#### Community Feedback (minimum 2 weeks)

The PR is open for community comment. Anyone can review the proposal, ask questions, suggest changes, or raise concerns. The proposal author is expected to respond to feedback and revise the spec as needed.

#### Maintainer Review

After the community feedback period, protocol maintainers review the proposal for:

- **Necessity:** Does this solve a real problem that the community faces?
- **Design quality:** Is the schema well-designed, minimal, and consistent with protocol conventions?
- **Compatibility:** Does the extension follow the additive principle? Does it degrade gracefully?
- **Overlap:** Does it duplicate functionality already available in standard or other proposed extensions?
- **Naming:** Does the extension name follow the `tezit-*` convention and clearly describe its purpose?

#### Decision

The maintainer review concludes with one of three outcomes:

| Outcome | What Happens |
|---------|--------------|
| **Accept** | The extension moves from `proposed/` to `standard/`. Its schema is considered stable. |
| **Revise** | Specific changes are requested. The author revises and the review continues. |
| **Reject** | The proposal is closed with an explanation. The author may resubmit with substantial changes. |

## After Acceptance

Accepted extensions move to `extensions/standard/{extension-name}/`. At this point:

- The extension ID is **reserved** -- no other extension may use it
- The schema is **stable** -- breaking changes require a new major version of the extension
- The extension is listed in the [Standard Extensions registry](./standard/)
- The protocol spec may reference it in future versions

## Vendor Extensions

If your extension is specific to your platform and not intended for standardization, register it as a vendor extension instead. See the [vendor extensions documentation](./vendor/) for the namespace registration process.

Vendor extensions that gain traction across multiple implementations are good candidates for standardization through this process.

## Terminology Reference

When writing extension documentation, use the correct Tezit terminology:

- **Singular:** a tez (one knowledge bundle)
- **Plural:** tezits (multiple knowledge bundles)
- **Verb:** tezit (the act of bundling context with synthesis -- "I tezited the research")
- **Protocol name:** the Tezit Protocol
