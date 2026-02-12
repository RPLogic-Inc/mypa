# com.ragu.eval-metrics

| Field | Value |
|-------|-------|
| **Extension ID** | `com.ragu.eval-metrics` |
| **Version** | 1.0.0 |
| **Status** | Active (standardizing as `tezit-eval`) |
| **Author** | Ragu Platform |
| **Minimum Protocol Version** | 1.2 |
| **Standardization Target** | `tezit-eval` (proposed) |
| **TIP Enterprise Addendum** | Section 8 |

## Purpose

When an AI system interrogates a Tez, the quality of its responses depends on how well the synthesis model grounds its answers in the provided context. Without structured quality metrics, there is no way to distinguish a well-grounded, faithful response from one that hallucinates, drifts off-topic, or ignores relevant source material.

The `com.ragu.eval-metrics` extension captures interrogation quality metrics that answer three fundamental questions:

1. **Groundedness** -- Is the response supported by evidence in the context? A groundedness score measures the proportion of claims in the response that can be traced to specific context items.
2. **Relevance** -- Does the response actually address the query? A relevance score measures how directly the response answers what was asked, penalizing tangential or off-topic content.
3. **Faithfulness** -- Does the response avoid hallucination? A faithfulness score measures whether the response introduces claims that contradict or go beyond the source material.

These metrics are captured at two granularities:

- **Per-query scores** for individual interrogation turns, enabling fine-grained quality analysis
- **Aggregate session scores** for the overall interrogation session, enabling summary reporting and SLA compliance

The extension also records **per-claim breakdowns** where each claim in a response is individually assessed for groundedness and linked to supporting citations. This enables reviewers to identify exactly which parts of a response are well-supported and which require additional verification.

Use cases include:

- **Quality dashboards** that surface interrogation quality trends across an organization
- **Automated quality gates** that flag low-groundedness responses before they reach end users
- **Model evaluation** comparing different synthesis models against the same context corpus
- **Compliance reporting** in regulated industries where AI-generated analysis must meet minimum quality thresholds

## Schema

The extension data is stored in `eval-metrics.json` within the extension directory of a Tez bundle:

```
my-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   └── ...
└── extensions/
    └── com.ragu.eval-metrics/
        ├── manifest.json
        └── eval-metrics.json
```

### Extension Manifest

```json
{
  "extension_id": "com.ragu.eval-metrics",
  "extension_version": "1.0.0",
  "name": "Eval Metrics",
  "description": "Captures interrogation quality metrics including groundedness, relevance, and faithfulness scores",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/vendor/com.ragu/eval-metrics"
}
```

### JSON Schema: `eval-metrics.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.eval-metrics/1.0.0",
  "title": "Eval Metrics",
  "description": "Captures interrogation quality metrics (groundedness, relevance, faithfulness) for TIP sessions.",
  "type": "object",
  "required": [
    "session_id",
    "query_id",
    "scores",
    "evaluator"
  ],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Unique identifier for the TIP interrogation session. All queries within a single session share this ID."
    },
    "query_id": {
      "type": "string",
      "description": "Unique identifier for the specific query within the session. Each interrogation turn produces a separate eval-metrics record keyed by query_id."
    },
    "scores": {
      "type": "object",
      "description": "Aggregate quality scores for this query's response.",
      "required": ["groundedness", "relevance", "faithfulness"],
      "properties": {
        "groundedness": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Proportion of claims in the response that are supported by evidence in the context. 1.0 means every claim is grounded; 0.0 means no claims are grounded."
        },
        "relevance": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "How directly the response addresses the query. 1.0 means perfectly on-topic; 0.0 means entirely irrelevant."
        },
        "faithfulness": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Whether the response avoids introducing claims that contradict or go beyond the source material. 1.0 means fully faithful; 0.0 means entirely hallucinated."
        }
      },
      "additionalProperties": false
    },
    "evaluator": {
      "type": "object",
      "description": "Metadata about the evaluation system that produced the scores.",
      "required": ["model", "model_version", "evaluation_method"],
      "properties": {
        "model": {
          "type": "string",
          "description": "Identifier of the model used for evaluation (e.g., 'gpt-4o', 'claude-opus-4-6', 'custom-eval-v3')."
        },
        "model_version": {
          "type": "string",
          "description": "Specific version or checkpoint of the evaluation model."
        },
        "evaluation_method": {
          "type": "string",
          "description": "The evaluation methodology used. Common values: 'llm_as_judge' (LLM evaluates its own or another model's output), 'nli_based' (natural language inference), 'human_in_loop' (human reviewers with optional AI assistance), 'hybrid' (combination of methods)."
        }
      },
      "additionalProperties": false
    },
    "per_claim_scores": {
      "type": "array",
      "description": "Per-claim breakdown of groundedness assessment. Each entry represents one claim extracted from the response.",
      "items": {
        "type": "object",
        "required": ["claim", "grounded", "source_citations"],
        "properties": {
          "claim": {
            "type": "string",
            "description": "The individual claim extracted from the response text."
          },
          "grounded": {
            "type": "boolean",
            "description": "Whether this claim is supported by evidence in the context."
          },
          "source_citations": {
            "type": "array",
            "description": "Context item identifiers that support this claim. Empty array if the claim is not grounded.",
            "items": {
              "type": "string"
            }
          }
        },
        "additionalProperties": false
      }
    },
    "aggregate_session_scores": {
      "type": "object",
      "description": "Rolling aggregate scores across all queries in this session. Updated with each new query.",
      "required": [
        "avg_groundedness",
        "avg_relevance",
        "avg_faithfulness",
        "total_queries"
      ],
      "properties": {
        "avg_groundedness": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Mean groundedness score across all queries in the session."
        },
        "avg_relevance": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Mean relevance score across all queries in the session."
        },
        "avg_faithfulness": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Mean faithfulness score across all queries in the session."
        },
        "total_queries": {
          "type": "integer",
          "minimum": 1,
          "description": "Total number of queries evaluated in this session so far."
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | Yes | TIP interrogation session identifier |
| `query_id` | string | Yes | Specific query identifier within the session |
| `scores` | object | Yes | Aggregate quality scores for this query |
| `scores.groundedness` | number | Yes | Proportion of grounded claims [0.0, 1.0] |
| `scores.relevance` | number | Yes | Query-response alignment [0.0, 1.0] |
| `scores.faithfulness` | number | Yes | Hallucination avoidance [0.0, 1.0] |
| `evaluator` | object | Yes | Evaluation system metadata |
| `evaluator.model` | string | Yes | Evaluator model identifier |
| `evaluator.model_version` | string | Yes | Evaluator model version |
| `evaluator.evaluation_method` | string | Yes | Evaluation methodology |
| `per_claim_scores` | array | No | Per-claim groundedness breakdown |
| `per_claim_scores[].claim` | string | Yes | Extracted claim text |
| `per_claim_scores[].grounded` | boolean | Yes | Whether the claim is supported |
| `per_claim_scores[].source_citations` | array | Yes | Supporting context item IDs |
| `aggregate_session_scores` | object | No | Rolling session-level aggregates |
| `aggregate_session_scores.avg_groundedness` | number | Yes | Session mean groundedness |
| `aggregate_session_scores.avg_relevance` | number | Yes | Session mean relevance |
| `aggregate_session_scores.avg_faithfulness` | number | Yes | Session mean faithfulness |
| `aggregate_session_scores.total_queries` | integer | Yes | Queries evaluated in session |

## Examples

### Example 1: High-quality interrogation with per-claim breakdown

An interrogation of a financial due diligence tez where the response was well-grounded:

```json
{
  "session_id": "tip-sess-a1b2c3d4",
  "query_id": "q-001",
  "scores": {
    "groundedness": 0.92,
    "relevance": 0.95,
    "faithfulness": 0.97
  },
  "evaluator": {
    "model": "claude-opus-4-6",
    "model_version": "2026-01-15",
    "evaluation_method": "llm_as_judge"
  },
  "per_claim_scores": [
    {
      "claim": "The company's ARR grew 140% year-over-year to $12.4M",
      "grounded": true,
      "source_citations": ["ctx-financial-model", "ctx-term-sheet"]
    },
    {
      "claim": "Customer retention rate is 94%",
      "grounded": true,
      "source_citations": ["ctx-customer-data"]
    },
    {
      "claim": "The TAM is estimated at $8.2B",
      "grounded": true,
      "source_citations": ["ctx-market-report"]
    },
    {
      "claim": "The founding team has prior exit experience",
      "grounded": false,
      "source_citations": []
    }
  ],
  "aggregate_session_scores": {
    "avg_groundedness": 0.92,
    "avg_relevance": 0.95,
    "avg_faithfulness": 0.97,
    "total_queries": 1
  }
}
```

### Example 2: Multi-query session with declining quality

A research tez interrogation where later queries show lower groundedness as the user pushes beyond the available context:

```json
{
  "session_id": "tip-sess-e5f6g7h8",
  "query_id": "q-004",
  "scores": {
    "groundedness": 0.61,
    "relevance": 0.78,
    "faithfulness": 0.72
  },
  "evaluator": {
    "model": "gpt-4o",
    "model_version": "2025-08-06",
    "evaluation_method": "nli_based"
  },
  "aggregate_session_scores": {
    "avg_groundedness": 0.79,
    "avg_relevance": 0.88,
    "avg_faithfulness": 0.85,
    "total_queries": 4
  }
}
```

### Example 3: Extension directory in a Tez bundle

```
quarterly-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   ├── financial-model.xlsx
│   ├── customer-data.csv
│   └── market-report.md
└── extensions/
    └── com.ragu.eval-metrics/
        ├── manifest.json
        └── eval-metrics.json
```

## Compatibility Notes

- **Minimum protocol version:** 1.2. This extension uses session and query identifiers consistent with the TIP session model introduced in protocol version 1.2.
- **Graceful degradation:** Implementations that do not support this extension ignore the `com.ragu.eval-metrics/` directory entirely. The Tez remains fully functional -- interrogation proceeds normally without quality scoring. Eval metrics are informational metadata; they do not gate access to content or modify interrogation behavior.
- **Conflicts:** None. This extension is purely additive. It complements `com.ragu.retrieval-transparency` (which records _how_ context was retrieved) by recording _how well_ the synthesis model used that context.
- **Dependencies:** None. This extension is standalone, though it is most valuable when used alongside `com.ragu.retrieval-transparency` for full pipeline observability.

## Migration Notes

This extension is actively being proposed for standardization as `tezit-eval`. The migration path:

1. **Schema evolution:** The standard `tezit-eval` extension may include additional metrics beyond groundedness, relevance, and faithfulness (such as `citation_accuracy`, `completeness`, and `abstention_rate` as defined in TIP Enterprise Addendum Section 8). The vendor extension's three core metrics will be preserved as a subset.
2. **Extension ID change:** Implementations should update from `com.ragu.eval-metrics` to `tezit-eval` when the standard extension is accepted.
3. **Backward compatibility:** During the transition period, implementations SHOULD recognize both the vendor and standard extension IDs. The vendor schema is a strict subset of the standard schema, so vendor `eval-metrics.json` files are valid against the standard `tezit-eval` schema without modification.
4. **Additivity:** Implementations migrating to `tezit-eval` MAY add the new standard metrics (`citation_accuracy`, `completeness`, `abstention_rate`) to their `scores` object. The three original metrics retain their semantics unchanged.
5. **A Tez bundle SHOULD NOT include both** `com.ragu.eval-metrics` and `tezit-eval` simultaneously. During migration, prefer the standard extension.
