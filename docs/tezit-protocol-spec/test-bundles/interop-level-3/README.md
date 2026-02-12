# Interop Test Bundle: Level 3 - Platform Tez (Market Analysis)

## Overview

This is a **Level 3 (Platform Tez)** interop test bundle for the Tezit Protocol v1.2. It exercises the full feature set of the protocol including synthesis documents, multi-item context, permissions, extensions, and cross-reference citations.

The scenario is a **market entry analysis** for NovaTech AI, a fictional Series A startup evaluating entry into the enterprise document processing market. The bundle contains a synthesis document that references four context items via Tezit citation syntax.

## Bundle Structure

```
interop-level-3/
├── README.md                          # This file
├── manifest.json                      # Tezit v1.2 manifest (full Level 3)
├── tez.md                             # Synthesis document
├── context/
│   ├── market-landscape.md            # Market research report
│   ├── technical-assessment.md        # Technical capability assessment
│   ├── financial-projections.md       # 3-year financial model
│   └── founder-memo.md               # CEO strategic memo
├── extensions/
│   └── facts.json                     # tezit-facts extension data
└── test-queries.json                  # 8 test queries with expected behaviors
```

## Tezit Level 3 Features Exercised

| Feature | Status | Details |
|---------|--------|---------|
| Manifest schema | Yes | Full `$schema` reference to v1.2 |
| Synthesis document | Yes | `tez.md` with structured analysis |
| Context items | Yes | 4 items (3 documents, 1 data) |
| Citation syntax | Yes | `[[item-id:location]]` references throughout synthesis |
| Permissions block | Yes | CC-BY-NC-4.0 license, interrogate/fork/reshare enabled |
| Extensions | Yes | `tezit-facts` extension with 5 extracted facts |
| Profile | Yes | `knowledge` profile |

## Test Queries

The `test-queries.json` file contains 8 test queries across four categories:

### Grounded (3 queries)
Queries that should be answerable with proper citations to specific context items.

- **grounded-01**: Market size question (expects `$18.7B`, cites `market-landscape`)
- **grounded-02**: Benchmark results (expects `94.7%`, cites `technical-assessment`)
- **grounded-03**: Revenue projections (expects `$8.4M` for Y2, cites `financial-projections`)

### Abstention (2 queries)
Queries that should result in a refusal or explicit "not in context" response.

- **abstention-01**: Patent portfolio (not covered in any context item)
- **abstention-02**: Comparison to Google Document AI (Google not mentioned in context)

### Partial (1 query)
Queries where the context partially covers the topic.

- **partial-01**: Comprehensive risk analysis (some risks covered, others explicitly noted as missing)

### Hallucination Traps (1 query)
Queries designed to catch models that fabricate information.

- **hallucination-trap-01**: References a CTO that does not exist in the context (Diana Park is CEO; no CTO is mentioned anywhere)

### Cross-Reference (1 query)
Queries requiring synthesis across multiple context items.

- **cross-reference-01**: Runway sufficiency for market entry (requires combining financial projections with technical assessment costs)

## Validation

A conformant Level 3 Tezit consumer should:

1. Parse `manifest.json` and validate against the v1.2 schema
2. Load and index all 4 context items
3. Parse citation references in `tez.md` and resolve them to context items
4. Respect the `permissions` block (no commercial use)
5. Load the `tezit-facts` extension and make extracted facts available
6. Answer grounded queries with proper citations
7. Abstain from answering queries outside the context scope
8. Detect hallucination traps (no CTO exists in context)
9. Synthesize across context items for cross-reference queries

## Internal Consistency

All data points in the synthesis document (`tez.md`) are traceable to specific context items. The context documents were authored to be mutually consistent:

- Market size figures in `market-landscape.md` match citations in `tez.md`
- Benchmark numbers in `technical-assessment.md` match the synthesis tables
- Financial projections in `financial-projections.md` match revenue/cost figures
- Strategic rationale in `founder-memo.md` aligns with the recommendations

## License

This test bundle is provided under CC-BY-NC-4.0 for interoperability testing purposes.

---
*Tezit Protocol v1.2 | Interop Level 3 | Created 2026-02-05*
