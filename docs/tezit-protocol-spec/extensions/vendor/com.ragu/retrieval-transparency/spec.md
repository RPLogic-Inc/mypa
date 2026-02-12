# com.ragu.retrieval-transparency

| Field | Value |
|-------|-------|
| **Extension ID** | `com.ragu.retrieval-transparency` |
| **Version** | 1.0.0 |
| **Status** | Active (implemented) |
| **Author** | Ragu Platform |
| **Minimum Protocol Version** | 1.2 |
| **Standardization Target** | `tezit-retrieval-transparency` (planned) |
| **TIP Enterprise Addendum** | Section 4 |

## Purpose

Enterprise RAG (Retrieval-Augmented Generation) pipelines are opaque by default. When a TIP interrogation produces an answer, recipients have no visibility into _how_ context was retrieved, _which_ chunks contributed to the synthesis, or _why_ certain sources were prioritized over others. This opacity creates compliance, audit, and trust problems -- particularly in regulated industries where decisions must be traceable to their evidentiary basis.

The `com.ragu.retrieval-transparency` extension makes the retrieval pipeline auditable by recording:

- **Which retrieval strategy** was applied (single-pass semantic search, multi-pass refinement, iterative deepening, or exhaustive scan)
- **How many chunks** were retrieved versus how many were actually evaluated by the synthesis model
- **Per-chunk similarity scores** with source provenance, so reviewers can verify that high-scoring chunks drove the response
- **The ranking methodology** used to order results (cosine similarity, BM25 keyword scoring, hybrid fusion, or reciprocal rank fusion)
- **Whether reranking was applied**, and if so, which model performed the reranking pass
- **Timing data** for retrieval latency, enabling performance monitoring and SLA compliance

This extension is particularly valuable for:

- **Audit trails** in financial, legal, and healthcare contexts where retrieval decisions must be defensible
- **Debugging** retrieval quality issues when interrogation answers are incorrect or incomplete
- **Benchmarking** different retrieval strategies against the same context corpus
- **Compliance reporting** where regulators require evidence of how AI-generated conclusions were sourced

## Schema

The extension data is stored in `retrieval-transparency.json` within the extension directory of a Tez bundle:

```
my-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   └── ...
└── extensions/
    └── com.ragu.retrieval-transparency/
        ├── manifest.json
        └── retrieval-transparency.json
```

### Extension Manifest

```json
{
  "extension_id": "com.ragu.retrieval-transparency",
  "extension_version": "1.0.0",
  "name": "Retrieval Transparency",
  "description": "Records retrieval strategy, scoring, and ranking metadata for auditable RAG pipelines",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/vendor/com.ragu/retrieval-transparency"
}
```

### JSON Schema: `retrieval-transparency.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.retrieval-transparency/1.0.0",
  "title": "Retrieval Transparency",
  "description": "Records which retrieval strategy was used during TIP interrogation, making the RAG pipeline auditable.",
  "type": "object",
  "required": [
    "retrieval_strategy",
    "chunks_retrieved",
    "chunks_evaluated",
    "similarity_scores",
    "ranking_method",
    "retrieval_time_ms",
    "reranking_applied"
  ],
  "properties": {
    "retrieval_strategy": {
      "type": "string",
      "enum": ["single_pass", "multi_pass", "iterative", "exhaustive"],
      "description": "The retrieval strategy applied during interrogation. 'single_pass' performs one retrieval round; 'multi_pass' refines the query across multiple rounds; 'iterative' progressively deepens retrieval based on intermediate results; 'exhaustive' scans the entire context corpus."
    },
    "chunks_retrieved": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of chunks retrieved from the context corpus before filtering or reranking."
    },
    "chunks_evaluated": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of chunks that were actually passed to the synthesis model for evaluation. This is always less than or equal to chunks_retrieved."
    },
    "similarity_scores": {
      "type": "array",
      "description": "Per-chunk similarity scores with source provenance. Ordered by score descending.",
      "items": {
        "type": "object",
        "required": ["chunk_id", "score", "source_item_id"],
        "properties": {
          "chunk_id": {
            "type": "string",
            "description": "Unique identifier for the retrieved chunk."
          },
          "score": {
            "type": "number",
            "minimum": 0.0,
            "maximum": 1.0,
            "description": "Similarity score normalized to [0.0, 1.0]. Higher scores indicate greater relevance."
          },
          "source_item_id": {
            "type": "string",
            "description": "Identifier of the context item (from the Tez manifest) that this chunk was extracted from."
          }
        },
        "additionalProperties": false
      }
    },
    "ranking_method": {
      "type": "string",
      "enum": ["cosine", "bm25", "hybrid", "rrf"],
      "description": "The ranking methodology used to order retrieval results. 'cosine' is vector cosine similarity; 'bm25' is keyword-based BM25 scoring; 'hybrid' combines vector and keyword scores; 'rrf' is Reciprocal Rank Fusion across multiple rankers."
    },
    "retrieval_time_ms": {
      "type": "integer",
      "minimum": 0,
      "description": "Wall-clock time in milliseconds for the complete retrieval pipeline, from query embedding to ranked result list."
    },
    "reranking_applied": {
      "type": "boolean",
      "description": "Whether a reranking pass was applied after initial retrieval."
    },
    "reranking_model": {
      "type": "string",
      "description": "Identifier of the model used for reranking (e.g., 'cross-encoder/ms-marco-MiniLM-L-12-v2'). Required when reranking_applied is true; omitted otherwise."
    },
    "retrieval_budget_exhausted": {
      "type": "boolean",
      "description": "Whether the retrieval pipeline exhausted its allocated budget (token budget, time budget, or chunk limit) before completing the search. When true, the results may be incomplete."
    },
    "ceiling_reached": {
      "type": "string",
      "description": "Human-readable description of the ceiling that was reached, if any. For example: 'Token budget of 8192 exhausted after 47 chunks', 'Time budget of 5000ms exceeded during reranking pass'."
    }
  },
  "additionalProperties": false,
  "if": {
    "properties": {
      "reranking_applied": { "const": true }
    }
  },
  "then": {
    "required": ["reranking_model"]
  }
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `retrieval_strategy` | enum | Yes | Strategy used: `single_pass`, `multi_pass`, `iterative`, `exhaustive` |
| `chunks_retrieved` | integer | Yes | Total chunks retrieved from corpus |
| `chunks_evaluated` | integer | Yes | Chunks passed to synthesis model |
| `similarity_scores` | array | Yes | Per-chunk scores with source provenance |
| `similarity_scores[].chunk_id` | string | Yes | Unique chunk identifier |
| `similarity_scores[].score` | number | Yes | Normalized similarity score [0.0, 1.0] |
| `similarity_scores[].source_item_id` | string | Yes | Context item ID from Tez manifest |
| `ranking_method` | enum | Yes | Ranking method: `cosine`, `bm25`, `hybrid`, `rrf` |
| `retrieval_time_ms` | integer | Yes | Retrieval pipeline wall-clock time (ms) |
| `reranking_applied` | boolean | Yes | Whether reranking was performed |
| `reranking_model` | string | Conditional | Reranking model ID (required when `reranking_applied` is true) |
| `retrieval_budget_exhausted` | boolean | No | Whether the retrieval budget was exceeded |
| `ceiling_reached` | string | No | Description of the budget ceiling hit |

## Examples

### Example 1: Hybrid retrieval with reranking

A due diligence tez where the retrieval pipeline used hybrid ranking (vector + BM25) followed by a cross-encoder reranking pass:

```json
{
  "retrieval_strategy": "multi_pass",
  "chunks_retrieved": 142,
  "chunks_evaluated": 25,
  "similarity_scores": [
    {
      "chunk_id": "chunk-a1b2c3",
      "score": 0.94,
      "source_item_id": "ctx-financial-model"
    },
    {
      "chunk_id": "chunk-d4e5f6",
      "score": 0.91,
      "source_item_id": "ctx-term-sheet"
    },
    {
      "chunk_id": "chunk-g7h8i9",
      "score": 0.87,
      "source_item_id": "ctx-market-report"
    },
    {
      "chunk_id": "chunk-j0k1l2",
      "score": 0.82,
      "source_item_id": "ctx-financial-model"
    },
    {
      "chunk_id": "chunk-m3n4o5",
      "score": 0.79,
      "source_item_id": "ctx-customer-interviews"
    }
  ],
  "ranking_method": "hybrid",
  "retrieval_time_ms": 342,
  "reranking_applied": true,
  "reranking_model": "cross-encoder/ms-marco-MiniLM-L-12-v2"
}
```

### Example 2: Single-pass cosine similarity with budget exhaustion

A research tez where the retrieval pipeline hit its token budget before scanning all available chunks:

```json
{
  "retrieval_strategy": "single_pass",
  "chunks_retrieved": 89,
  "chunks_evaluated": 15,
  "similarity_scores": [
    {
      "chunk_id": "chunk-r1s2t3",
      "score": 0.96,
      "source_item_id": "ctx-primary-research"
    },
    {
      "chunk_id": "chunk-u4v5w6",
      "score": 0.88,
      "source_item_id": "ctx-literature-review"
    }
  ],
  "ranking_method": "cosine",
  "retrieval_time_ms": 156,
  "reranking_applied": false,
  "retrieval_budget_exhausted": true,
  "ceiling_reached": "Token budget of 8192 exhausted after 15 chunks evaluated"
}
```

### Example 3: Extension directory in a Tez bundle

```
quarterly-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   ├── financial-model.xlsx
│   ├── term-sheet.pdf
│   └── market-report.md
└── extensions/
    └── com.ragu.retrieval-transparency/
        ├── manifest.json
        └── retrieval-transparency.json
```

## Compatibility Notes

- **Minimum protocol version:** 1.2. This extension uses context item identifiers introduced in protocol version 1.2.
- **Graceful degradation:** Implementations that do not support this extension ignore the `com.ragu.retrieval-transparency/` directory entirely. The Tez remains fully functional -- synthesis, context, and citations are unaffected. The retrieval metadata is purely informational and does not gate access to any content.
- **Conflicts:** None. This extension is purely additive and does not overlap with any standard or vendor extension. It complements `tezit-facts` (which records _what_ was extracted) by recording _how_ retrieval found the source material.
- **Dependencies:** None. This extension is standalone.

## Migration Notes

This extension is a candidate for standardization as `tezit-retrieval-transparency`. The migration path:

1. **Schema preservation:** The JSON schema will be adopted as-is into the standard extension, with the `$id` URI updated to the `tezit.com/schemas/standard/` namespace.
2. **Extension ID change:** Implementations should update from `com.ragu.retrieval-transparency` to `tezit-retrieval-transparency` when the standard extension is accepted.
3. **Backward compatibility:** During the transition period, implementations SHOULD recognize both the vendor and standard extension IDs and treat them as equivalent. A Tez bundle SHOULD NOT include both simultaneously.
4. **Data compatibility:** No data transformation is required. The same `retrieval-transparency.json` file is valid under both the vendor and standard schemas.
