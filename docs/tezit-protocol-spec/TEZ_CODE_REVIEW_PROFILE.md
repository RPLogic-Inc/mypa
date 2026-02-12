# Tezit Protocol Profile: Code Review

**Profile ID**: `code_review`
**Version**: 0.2.0
**Status**: Proposed
**Date**: February 5, 2026
**Authors**: Ragu Platform Team
**Spec Compatibility**: Tezit Protocol v1.2
**Section Reference**: Extends Section 1.8 (Profiles)

---

## Abstract

This document proposes a new Tezit Protocol profile for **code review** workflows. A Code Review tez bundles review findings (synthesis) with source code, diffs, test results, lint output, CI logs, and AI dialogue (context), enabling recipients to interrogate the review: "Why was this flagged?", "What's the security implication?", "Show me similar patterns in the codebase."

This profile follows the structure established by Section 1.8.1 (Knowledge Profile) and Section 1.8.2 (Coordination Profile) in the Tezit Protocol Specification v1.2.

---

## 1. Motivation

Code review artifacts suffer from the same context-loss problem that motivated the Tezit Protocol for knowledge work:

- **Review comments are snapshot-bound.** The reasoning behind "this is a security risk" is a sentence in a comment, not a grounded analysis.
- **Findings lack interrogability.** Authors cannot ask "why is this a risk given our input validation middleware?" without starting a new conversation.
- **AI-generated reviews are opaque.** Findings arrive without the reasoning context that produced them.
- **Resolution is untracked.** Issues are flagged, discussed, and resolved across comments, commits, and conversations in scattered tools.

This profile originates from the Ragu Platform, where AI coders operate in an orchestrated workflow: one AI builds, another reviews, with `file:line` references, severity categorization, and fix suggestions -- all of which need to be interrogable and auditable.

---

## 2. Profile Definition

### 2.1 Profile Identifier

```
"profile": "code_review"
```

### 2.2 Synthesis Type

Code Review tezzes use synthesis type `review` (per Section 3.3 of the base specification).

### 2.3 Default Consumption Behavior

When a consumer encounters `"profile": "code_review"`, it SHOULD:

1. Render the synthesis as a structured finding list with severity indicators.
2. Display findings grouped by severity or by file location, with toggle capability.
3. Show inline code context alongside each finding.
4. Enable interrogation scoped to individual findings in addition to the full review.
5. Present the verdict prominently.

### 2.4 Review Types

| Review Type | Description |
|-------------|-------------|
| `pull_request` | Review of a pull request / merge request |
| `commit_range` | Review of a range of commits |
| `file_set` | Review of an arbitrary set of files |
| `security_audit` | Security-focused review of a codebase or component |

---

## 3. Surface Schema

### 3.1 Schema Definition

```json
{
  "profile": "code_review",
  "surface": {
    "review_type": "string (REQUIRED: 'pull_request'|'commit_range'|'file_set'|'security_audit')",
    "verdict": "string (REQUIRED: 'approved'|'changes_requested'|'rejected'|'informational')",
    "severity_summary": {
      "critical": "integer", "high": "integer",
      "medium": "integer", "low": "integer",
      "informational": "integer (OPTIONAL, default: 0)"
    },
    "finding_count": "integer (REQUIRED)",
    "repository": "string (REQUIRED)",
    "branch": "string (OPTIONAL)",
    "base_branch": "string (OPTIONAL)",
    "commit_range": "string (OPTIONAL)",
    "pull_request": "string (OPTIONAL, URL or identifier)",
    "languages": ["array of strings (OPTIONAL)"],
    "files_reviewed": "integer (OPTIONAL)",
    "lines_changed": "integer (OPTIONAL)",
    "reviewer": {
      "name": "string (REQUIRED)",
      "email": "string (OPTIONAL)",
      "role": "string (REQUIRED: 'reviewer'|'author'|'auditor')",
      "type": "string (OPTIONAL: 'human'|'ai'|'hybrid')"
    },
    "author": {
      "name": "string (REQUIRED)",
      "email": "string (OPTIONAL)",
      "role": "string (REQUIRED)",
      "type": "string (OPTIONAL: 'human'|'ai'|'hybrid')"
    },
    "review_tools": ["array of strings (OPTIONAL)"],
    "observation_summary": {
      "issue": "integer (OPTIONAL, default: finding_count)",
      "praise": "integer (OPTIONAL, default: 0)",
      "question": "integer (OPTIONAL, default: 0)",
      "note": "integer (OPTIONAL, default: 0)"
    }
  }
}
```

### 3.2 Verdict Semantics

| Verdict | Meaning |
|---------|---------|
| `approved` | Code meets quality standards; may proceed |
| `changes_requested` | Issues found that MUST be addressed before proceeding |
| `rejected` | Fundamental problems; significant rework required |
| `informational` | Advisory review with no blocking findings |

The `reviewer.type` and `author.type` fields distinguish human from AI participants. Consumers MAY render AI-authored reviews with an indicator that the review was machine-generated.

### 3.3 Complete Example

```json
{
  "profile": "code_review",
  "surface": {
    "review_type": "pull_request",
    "verdict": "changes_requested",
    "severity_summary": { "critical": 0, "high": 2, "medium": 3, "low": 1, "informational": 2 },
    "finding_count": 8,
    "repository": "github.com/acme/platform",
    "branch": "feature/auth-redesign",
    "base_branch": "main",
    "commit_range": "abc1234..def5678",
    "pull_request": "https://github.com/acme/platform/pull/142",
    "languages": ["python", "typescript"],
    "files_reviewed": 12,
    "lines_changed": 847,
    "reviewer": { "name": "Reviewer Agent B", "role": "reviewer", "type": "ai" },
    "author": { "name": "Builder Agent A", "role": "author", "type": "ai" },
    "review_tools": ["ruff", "pytest", "mypy", "eslint"],
    "observation_summary": { "issue": 6, "praise": 1, "question": 1, "note": 0 }
  }
}
```

---

## 4. Finding Schema

Each finding represents a discrete review observation. Findings MUST be structured to enable per-finding interrogation, status tracking, and resolution workflows.

### 4.1 Schema Definition

```json
{
  "id": "string (REQUIRED, unique within tez)",
  "severity": "string (REQUIRED: 'critical'|'high'|'medium'|'low'|'informational')",
  "category": "string (REQUIRED)",
  "title": "string (REQUIRED)",
  "description": "string (REQUIRED)",
  "location": {
    "file": "string (REQUIRED)",
    "line_start": "integer (REQUIRED)",
    "line_end": "integer (OPTIONAL)",
    "column_start": "integer (OPTIONAL)",
    "column_end": "integer (OPTIONAL)",
    "function": "string (OPTIONAL)",
    "class": "string (OPTIONAL)"
  },
  "observation_type": "string (OPTIONAL: 'issue'|'praise'|'question'|'note', default: 'issue')",
  "confidence": "string (OPTIONAL: 'high'|'medium'|'low')",
  "confidence_reasoning": "string (OPTIONAL)",
  "suggestion": {
    "description": "string (OPTIONAL)",
    "code": "string (OPTIONAL)",
    "diff": "string (OPTIONAL, unified diff format)",
    "rendering_hint": "string (OPTIONAL: 'inline_diff'|'side_by_side'|'unified'|'code_block')"
  },
  "citations": ["array of citation strings (OPTIONAL)"],
  "status": "string (REQUIRED: 'open'|'acknowledged'|'fixed'|'wont_fix'|'disputed'|'invalid')",
  "related_findings": ["array of finding-id strings (OPTIONAL)"],
  "references": ["array of URLs (OPTIONAL)"]
}
```

### 4.2 Severity Levels

| Level | Meaning | Blocking |
|-------|---------|----------|
| `critical` | Security vulnerability, data loss risk, or correctness defect in a critical path | Yes |
| `high` | Significant bug, performance regression, or required standard violation | Yes |
| `medium` | Code quality issue, maintainability concern, or test gap | Reviewer discretion |
| `low` | Style issue, minor improvement, or documentation gap | No |
| `informational` | Observation, positive feedback, or general note | No |

A review with any `critical` finding SHOULD NOT have a verdict of `approved`.

### 4.3 Finding Categories

| Category | Description |
|----------|-------------|
| `security` | Security vulnerabilities and risks |
| `correctness` | Logic errors and functional bugs |
| `performance` | Performance issues and regressions |
| `reliability` | Error handling and resilience issues |
| `testing` | Test coverage and quality issues |
| `maintainability` | Code organization and readability |
| `style` | Formatting and convention violations |
| `documentation` | Missing or incorrect documentation |
| `architecture` | Structural and design concerns |
| `compatibility` | Backward compatibility and migration issues |

Custom categories SHOULD use a namespaced format: `com.acme.custom-category`.

### 4.4 Finding Status

Status transitions are tracked through the fork mechanism (Section 7):

| Status | Meaning |
|--------|---------|
| `open` | Identified but not yet addressed |
| `acknowledged` | Author has seen and accepted the finding |
| `fixed` | Author has committed a fix |
| `wont_fix` | Author will not address; explanation required |
| `disputed` | Author disagrees; requires discussion |
| `invalid` | Determined to be a false positive |

### 4.5 Observation Types

| Type | Meaning |
|------|---------|
| `issue` | A problem to be addressed (default) |
| `praise` | A positive observation about well-written code |
| `question` | A question for the author seeking clarification |
| `note` | A general observation or informational remark |

Positive observations are orthogonal to the severity scale. A reviewer noting "this auth middleware is well-structured" is not an informational-severity issue -- it is a praise-type observation. The `severity` and `observation_type` dimensions are independent.

When `observation_type` is omitted, consumers MUST treat the finding as `issue` for backward compatibility.

The `observation_summary` field in the surface schema (Section 3.1) provides aggregate counts by observation type, enabling consumers to display counts without parsing all findings.

### 4.6 Confidence Metadata

| Field | Type | Description |
|-------|------|-------------|
| `confidence` | `high` / `medium` / `low` | Structured certainty level for the finding |
| `confidence_reasoning` | string | Explanation of why the confidence level was assigned |

When the reviewer is an AI system, findings SHOULD carry structured certainty metadata. This distinguishes definitive issues ("this null pointer dereference will crash in production", high confidence) from speculative concerns ("this might have a race condition under high concurrency", low confidence). Human reviewers MAY omit this field.

### 4.7 Suggestion Rendering Hints

| Hint | Meaning |
|------|---------|
| `inline_diff` | Render the suggestion as an inline diff within the source view |
| `side_by_side` | Render original and suggested code side by side |
| `unified` | Render as a unified diff |
| `code_block` | Render the suggested code as a standalone code block |

The hint is advisory -- consumers MAY ignore it. This addresses the practical problem that a web platform, a CLI tool, and a mobile app will render diffs differently, and the suggestion author is in the best position to indicate which rendering is most useful for a given fix.

### 4.8 Example Finding

```json
{
  "id": "finding-001",
  "severity": "high",
  "category": "security",
  "observation_type": "issue",
  "confidence": "high",
  "confidence_reasoning": "Direct string interpolation into SQL with no sanitization; exploitable via public API endpoint.",
  "title": "SQL injection via unsanitized user input in get_user_by_name",
  "description": "The name parameter is interpolated directly into the SQL query string without parameterization. Exploitable via the public API without authentication.",
  "location": {
    "file": "src/api/users.py", "line_start": 42, "line_end": 45,
    "function": "get_user_by_name", "class": "UserService"
  },
  "suggestion": {
    "description": "Use parameterized queries.",
    "code": "cursor.execute('SELECT * FROM users WHERE name = %s', (name,))",
    "rendering_hint": "inline_diff"
  },
  "citations": ["[[src-api-users-py:L42-45]]", "[[owasp-sql-injection]]"],
  "status": "open",
  "references": ["https://owasp.org/www-community/attacks/SQL_Injection"]
}
```

---

## 5. Context Item Types

### 5.1 Standard Types

| Type | Description | Required |
|------|-------------|----------|
| `source_code` | Source files under review | At least one |
| `diff` | Git diff (unified format) | RECOMMENDED |
| `test_result` | Test execution output (pass/fail, coverage) | RECOMMENDED |
| `lint_output` | Linter/static analysis results | OPTIONAL |
| `ci_log` | CI/CD pipeline logs | OPTIONAL |
| `documentation` | Relevant specs, ADRs, or guides | OPTIONAL |
| `ai_dialogue` | AI conversation during review | OPTIONAL |
| `previous_review` | Earlier review of the same code | OPTIONAL |
| `coverage_report` | Code coverage data | OPTIONAL |
| `dependency_audit` | Dependency vulnerability scan results | OPTIONAL |

### 5.2 Context Item Metadata

Context items SHOULD include type-appropriate metadata:

```json
{
  "id": "src-api-users-py", "type": "source_code",
  "title": "src/api/users.py", "file": "context/src-api-users-py.py",
  "metadata": {
    "language": "python", "path_in_repo": "src/api/users.py",
    "commit_sha": "abc1234", "line_count": 287
  }
}
```

```json
{
  "id": "pr-142-diff", "type": "diff",
  "title": "PR #142 Diff", "file": "context/pr-142-diff.patch",
  "metadata": {
    "format": "unified", "base_ref": "main", "head_ref": "feature/auth-redesign",
    "files_changed": 12, "additions": 523, "deletions": 324
  }
}
```

```json
{
  "id": "pytest-results", "type": "test_result",
  "title": "pytest results", "file": "context/pytest-results.json",
  "metadata": {
    "runner": "pytest", "total": 247, "passed": 240, "failed": 5,
    "duration_seconds": 34.7, "coverage_percent": 82.3
  }
}
```

### 5.3 Context Scope

| Scope | Code Review Meaning |
|-------|---------------------|
| `full` | All repository files were available for review |
| `focused` | Changed files and immediate dependencies (RECOMMENDED for PR reviews) |
| `private` | Only files explicitly requested by the author |
| `custom` | Custom scope (e.g., security-focused subset) |

---

## 6. Citation Format Extensions

The Code Review Profile extends the base citation format (Sections 4.2 and 9.5) with code-specific reference syntax.

### 6.1 Code Citations

| Format | Meaning | Example |
|--------|---------|---------|
| `[[item-id:L{n}]]` | Line number | `[[src-api-users-py:L42]]` |
| `[[item-id:L{n}-{m}]]` | Line range | `[[src-api-users-py:L42-50]]` |
| `[[item-id:fn:{name}]]` | Function definition | `[[src-api-users-py:fn:get_user_by_name]]` |
| `[[item-id:class:{name}]]` | Class definition | `[[src-api-users-py:class:UserService]]` |
| `[[item-id:method:{class}.{method}]]` | Method | `[[src-api-users-py:method:UserService.get_by_name]]` |

### 6.2 Diff Citations

| Format | Meaning | Example |
|--------|---------|---------|
| `[[item-id:{file}:+L{n}]]` | Added line | `[[pr-diff:src/api/users.py:+L15]]` |
| `[[item-id:{file}:-L{n}]]` | Removed line | `[[pr-diff:src/api/users.py:-L23]]` |
| `[[item-id:{file}:~L{n}]]` | Context line | `[[pr-diff:src/api/users.py:~L10]]` |
| `[[item-id:hunk:{n}]]` | Diff hunk | `[[pr-diff:hunk:3]]` |

### 6.3 Test and CI Citations

| Format | Meaning | Example |
|--------|---------|---------|
| `[[item-id:test:{name}]]` | Test case | `[[pytest-results:test:test_auth_flow]]` |
| `[[item-id:suite:{name}]]` | Test suite | `[[pytest-results:suite:test_users]]` |
| `[[item-id:step:{n}]]` | CI step | `[[ci-log:step:3]]` |
| `[[item-id:job:{name}]]` | CI job | `[[ci-log:job:lint-and-test]]` |
| `[[item-id:rule:{code}]]` | Lint rule | `[[ruff-output:rule:E501]]` |

### 6.4 Citation Verification

Implementations MUST verify code citations by confirming: (1) `item-id` references a valid context item, (2) line numbers exist within file bounds, (3) symbol names (`fn:`, `class:`) exist in the source, (4) diff citations match the expected operation, (5) test names appear in results. Failed citations MUST be flagged.

---

## 7. Fork Types for Code Review

The Code Review Profile defines fork semantics mapping to natural review workflows.

### 7.1 Author Response

The author addresses findings with explanations, fix commits, or disputes.

```json
{ "lineage": { "forked_from": "review-auth-001", "fork_type": "author_response" } }
```

The author SHOULD update finding statuses (`open` -> `fixed`, `wont_fix`, `disputed`) and MAY add new context (fix commits, test results). The original findings MUST NOT be modified; statuses are tracked in the fork's synthesis.

### 7.2 Re-Review

The reviewer re-reviews after fixes, updating statuses and potentially adding new findings.

```json
{ "lineage": { "forked_from": "response-auth-001", "fork_type": "re_review" } }
```

Statuses may transition: `fixed` -> `verified`, `disputed` -> `accepted` or `upheld`. The verdict may change (e.g., `changes_requested` -> `approved`).

### 7.3 Counter-Review

A different reviewer provides an alternative assessment of the same code.

```json
{ "lineage": { "forked_from": "review-auth-001", "fork_type": "counter_review" } }
```

The counter-review MAY add context, dispute original findings, identify missed issues, and issue a different verdict.

### 7.4 Audit

A security auditor or compliance reviewer performs a targeted review.

```json
{ "lineage": { "forked_from": "review-auth-001", "fork_type": "audit" } }
```

### 7.5 Fork Chain Example

```
review-auth-001              (changes_requested)
  +-- response-auth-001      (5/6 findings fixed)
  |     +-- rereview-auth-001     (approved)
  +-- security-audit-auth-001     (1 additional finding)
        +-- response-security-001
              +-- rereview-security-001  (approved)
```

---

## 8. Interrogation Patterns

Code Review tezzes support specific interrogation patterns beyond general TIP interrogation.

### 8.1 Finding-Scoped Interrogation

**Query**: "Why was finding-001 flagged as high severity?"

Retrieve the finding, cited source lines, and referenced documentation. Generate a grounded response explaining the severity classification with citations.

### 8.2 Pattern Search

**Query**: "Are there similar SQL injection patterns elsewhere in the codebase?"

Search all `source_code` context items for patterns matching the flagged code. Report matches with citations.

### 8.3 Fix Exploration

**Query**: "What would the fix look like given this file's existing patterns?"

Retrieve the suggestion and surrounding code. Generate a fix following the file's conventions.

### 8.4 Test Coverage Cross-Reference

**Query**: "What tests cover the code path affected by finding-001?"

Cross-reference finding location against `test_result` and `coverage_report` items. Identify coverage gaps.

### 8.5 Historical Context

**Query**: "Has this been flagged in previous reviews?"

Search `previous_review` context items for findings at similar locations or with similar patterns. Report whether the finding is new, recurrent, or a regression.

### 8.6 Grounding Boundary

The grounding boundary is all context items, the synthesis, and the conversation record (if included). Responses MUST NOT draw on general knowledge without clearly stating: "The review context does not contain information about [topic]."

---

## 9. Synthesis Format

### 9.1 Recommended Structure

```markdown
---
title: "Code Review: Auth Redesign"
type: review
profile: code_review
verdict: changes_requested
---

# Code Review: Auth Redesign

## Summary

Review of PR #142 (feature/auth-redesign -> main). 12 files, 847 lines.
**Verdict**: Changes Requested | 0 critical, 2 high, 3 medium, 1 low

## High Findings

### [finding-001] SQL injection via unsanitized input (HIGH)
**Location**: `src/api/users.py:42-45` (`UserService.get_user_by_name`)
...

## Medium Findings
...

## Positive Observations
- Auth middleware is well-structured [[src-auth-middleware:L1-50]]

## Recommendation
Address the 2 high-severity findings before merging.

---
*Tezit v1.2 | Profile: code_review | Context: 8 items | 2026-02-05*
```

### 9.2 Machine-Readable Findings

Code Review tezzes SHOULD include `findings.json` alongside `tez.md`, containing the structured finding data from Section 4. The manifest references it as:

```json
{ "synthesis": { "file": "tez.md", "supplementary": { "findings": "findings.json" } } }
```

---

## 10. Integration Guidance

This section is non-normative.

### 10.1 GitHub / GitLab

**Ingestion**: Fetch PR diff, changed files, and CI results via platform API; bundle as context; generate review synthesis; publish with `surface.pull_request` linking to the PR.

**Projection**: Parse findings; post review comments at file:line locations; link comments to the tez for interrogation; set PR status from the verdict.

### 10.2 IDE Integration

Parse `findings.json`; map locations to open files; render as inline diagnostics; provide "Why?" action opening finding-scoped interrogation.

### 10.3 CI/CD Pipeline

Collect lint, test, and build outputs after pipeline steps; bundle as context; run AI review; publish tez; gate pipeline on verdict.

---

## 11. Security Considerations

### 11.1 Source Code Sensitivity

Implementations MUST enforce access controls on source code context, support partial sharing (findings without downloadable source), and warn creators when sharing externally.

### 11.2 Vulnerability Disclosure

Implementations SHOULD default to restricted sharing for tezzes with `critical` or `high` security findings, support embargo periods for security audits, and integrate with disclosure workflows.

### 11.3 Finding Integrity

Implementations SHOULD include content hashes for all context items, support manifest signing for audit-grade reviews, and preserve immutability of original findings (status changes occur in forks).

### 11.4 Conversation Privacy

Creators SHOULD use `sharing: "redacted"` or `sharing: "summary"` for conversations containing pre-patch security analysis. Findings can be shared while the detailed vulnerability analysis conversation is withheld.

---

## 12. Conformance Requirements

### 12.1 Producers MUST

1. Set `"profile": "code_review"` in the manifest.
2. Include all REQUIRED surface schema fields.
3. Include at least one `source_code` context item.
4. Structure findings per Section 4.1 schema.
5. Use severity levels from Section 4.2 and categories from Section 4.3.
6. Set an appropriate verdict with accurate severity summary.

### 12.2 Producers SHOULD

1. Include `diff` and `test_result` context items when available.
2. Provide `findings.json` for machine consumption.
3. Use extended citation syntax from Section 6.

### 12.3 Consumers MUST

1. Recognize `"profile": "code_review"` and apply review-specific rendering.
2. Display verdict and severity summary from the surface schema.
3. Render findings with severity, category, location, and description.
4. Support citation links to context items.

### 12.4 Consumers SHOULD

1. Support finding grouping by severity and by file.
2. Display inline code context alongside findings.
3. Support finding-scoped interrogation.
4. Display fork chains for resolution tracking.

### 12.5 Interrogation Providers

MUST comply with TIP. SHOULD additionally support finding-scoped queries, pattern search, language-aware source code chunking, and code citation verification.

---

## 13. Relationship to Other Profiles

### 13.1 Knowledge Profile (Fallback)

A Code Review tez degrades gracefully to a Knowledge Profile tez. The synthesis is valid Markdown with citations; unrecognized citation formats render as plain text; `findings.json` is an unrecognized supplementary file.

### 13.2 Coordination Profile (Cross-Reference)

Coordination tezzes MAY reference Code Review tezzes as evidence for task completion or blocker resolution, using `"source": "tez:{review-tez-id}"` in context items.

---

## Appendix A: Example Bundle Structure

```
review-auth-redesign-2026-02-05-001/
  manifest.json
  tez.md
  findings.json
  conversation.json
  context/
    src-api-users-py.py
    src-api-auth-py.py
    src-middleware-rate-limit-ts.ts
    pr-142-diff.patch
    pytest-results.json
    ruff-output.json
    ci-log.txt
    owasp-sql-injection.md
```

## Appendix B: GitHub Review Model Mapping

| GitHub Concept | Code Review Profile Equivalent |
|---------------|-------------------------------|
| Pull Request Review | Tez with `profile: "code_review"` |
| Review Comment | Finding (Section 4) |
| Review Status | `surface.verdict` |
| Suggestion block | `finding.suggestion.code` |
| Resolved/Unresolved | `finding.status` via fork chain |
| Re-review request | Re-Review Fork (Section 7.2) |
| CODEOWNERS | `surface.reviewer` with `role: "auditor"` |

## Appendix C: Backward Compatibility

All v0.2.0 additions are backward-compatible -- all new fields are OPTIONAL with sensible defaults. A v0.1.0 consumer can process a v0.2.0 finding by ignoring unknown fields. Specifically:

- `observation_type` defaults to `issue`, preserving existing behavior.
- `confidence` and `confidence_reasoning` are purely additive metadata; omission changes nothing.
- `rendering_hint` is advisory and consumers MAY ignore it entirely.
- `observation_summary` in the surface schema is OPTIONAL; consumers that do not recognize it will continue to use `severity_summary` and `finding_count` as before.

## Appendix D: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 0.2.0 | 2026-02 | Status upgraded from Draft to Proposed. Added `confidence` and `confidence_reasoning` fields for AI reviewer certainty metadata. Added `observation_type` (issue/praise/question/note) to separate positive observations from the severity scale. Added `observation_summary` to the surface schema. Added `rendering_hint` to suggestion schema for advisory diff presentation mode. All new fields are OPTIONAL with backward-compatible defaults. |
| 0.1.0 | 2026-02-05 | Initial draft proposal |

---

*This profile specification is contributed by the Ragu Platform Team and is licensed under CC BY 4.0, consistent with the Tezit Protocol Specification.*

*Ragu Platform -- Enterprise AI Orchestration*
*https://github.com/tezit-protocol/spec*
