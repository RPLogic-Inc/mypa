# Tezit Protocol

**Context travels with communication.**

Tezit is an open protocol for bundling knowledge artifacts — documents, data, models, and their relationships — into portable, interrogable packages called **tezits**.

## Specifications

| Spec | Description | Status |
|------|-------------|--------|
| [Tezit Protocol v1.2](TEZIT_PROTOCOL_SPEC_v1.2.md) | Core protocol specification | Stable |
| [Tez Interrogation Protocol (TIP)](TEZ_INTERROGATION_PROTOCOL.md) | Grounded AI responses from tez context | Stable |
| [HTTP API](TEZ_HTTP_API_SPEC.md) | REST API for platforms implementing the protocol | Stable |
| [tez:// URI Scheme](TEZ_URI_SCHEME.md) | URI scheme for addressing tezits and their contents | Stable |
| [Schemas](schemas/) | JSON Schema files for validation | Stable |
| [Test Bundle](test-bundles/tip-compliance/) | TIP compliance reference test bundle | Stable |
| [MyPA.chat Alignment Guide](MYPA_ALIGNMENT_GUIDE.md) | Implementation guide for MyPA.chat | Stable |

### Earlier Versions

| Spec | Description |
|------|-------------|
| [Protocol v1.0/1.1](TEZIT_PROTOCOL_SPEC.md) | Original protocol specification |
| [Manifesto](TEZIT_MANIFESTO.md) | Founding document and vision |

## Industry Guides

| Guide | Description |
|-------|-------------|
| [Legal](guides/TEZ_FOR_LEGAL.md) | M&A due diligence, litigation briefs, privilege preservation |
| [Finance](guides/TEZ_FOR_FINANCE.md) | Equity research, risk assessment, regulatory compliance |
| [Consulting](guides/TEZ_FOR_CONSULTING.md) | Engagement deliverables, knowledge reuse, client interrogation |

## Quick Start

A tez is a directory (or `.tez` archive) with this structure:

```
my-tez/
  manifest.json       # Metadata, creator, context inventory
  tez.md              # Synthesis document (the "so what")
  context/            # Supporting evidence and source materials
    report.pdf
    data.csv
    model.xlsx
```

The synthesis document (`tez.md`) is the human-readable narrative. The `context/` directory contains everything that informed it. Together, they create a knowledge artifact that can be shared, versioned, forked, and interrogated by AI.

## Key Concepts

- **Tez**: A bundled knowledge artifact (singular: "a tez", plural: "tezits")
- **Interrogation**: Asking AI questions grounded exclusively in the tez's context
- **Forking**: Creating a derivative tez that builds on or challenges the original
- **Grounding**: AI responses cite specific context items, never hallucinate

## Naming

- Singular: **a tez**
- Plural: **tezits**
- Verb: **"Just tezit it over to me."**
- Platform: [tezit.com](https://tezit.com)

## License

All specifications in this repository are licensed under [CC BY 4.0](LICENSE).

## Links

- Website: [tezit.com](https://tezit.com)
- Protocol: [tezit.com/protocol](https://tezit.com/protocol)
- Manifesto: [tezit.com/manifesto](https://tezit.com/manifesto)
