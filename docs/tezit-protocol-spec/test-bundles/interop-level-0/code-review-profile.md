---
tezit: "1.2"
title: "Code Review: Auth Token Refresh"
type: review
profile: code_review
creator:
  name: "Reviewer Agent B"
  email: "reviewer-b@ragu.ai"
  org: "Ragu Platform"
created_at: "2026-02-04T14:22:00Z"
context:
  scope: focused
  item_count: 4
permissions:
  interrogate: true
  fork: true
  reshare: false
surface:
  review_id: "review-pr-287-2026-02-04"
  review_type: pull_request
  overall_verdict: request_changes
  findings_count:
    total: 5
    by_severity:
      critical: 1
      high: 1
      medium: 2
      low: 0
      info: 1
  observation_summary:
    issues: 4
    praises: 1
    questions: 0
    notes: 0
  repository: "github.com/ragu-platform/internal-api"
  branch: "feature/token-refresh"
  base_branch: "main"
  pull_request: "https://github.com/ragu-platform/internal-api/pull/287"
  languages:
    - python
  files_reviewed: 6
  lines_changed: 142
  reviewer:
    name: "Reviewer Agent B"
    role: reviewer
    type: ai
  author:
    name: "Builder Agent A"
    role: author
    type: ai
  review_tools:
    - ruff
    - pytest
    - mypy
---

# Code Review: Auth Token Refresh (PR #287)

## Summary

Review of PR #287 (feature/token-refresh -> main). 6 files, 142 lines changed.
**Verdict**: Changes Requested | 1 critical, 1 high, 2 medium, 1 informational

## Critical Findings

### [finding-001] Refresh token stored in plaintext cookie (CRITICAL)

**Location**: `src/auth/token_service.py:67-72` (`TokenService.set_refresh_token`)
**Confidence**: high
**Confidence Reasoning**: The `set_cookie()` call is missing `httponly=True`, `secure=True`, and `samesite='strict'` flags. This is directly verifiable from the code.

The refresh token is set as a plaintext cookie without security flags. This exposes the token to XSS attacks (no `httponly`), network interception (no `secure`), and CSRF attacks (no `samesite`).

**Suggestion**: Add security flags to the cookie.
```python
response.set_cookie(
    "refresh_token", token,
    httponly=True, secure=True, samesite="strict",
    max_age=REFRESH_TOKEN_TTL
)
```

**Citations**: [[src-token-service:L67-72]], [[owasp-session-mgmt]]

## High Findings

### [finding-002] Token rotation not atomic (HIGH)

**Location**: `src/auth/token_service.py:89-96` (`TokenService.rotate_token`)
**Confidence**: high

The refresh token rotation (invalidate old, issue new) is not wrapped in a transaction. If the process crashes after invalidation but before the new token is stored, the user is locked out with no valid refresh token.

**Citations**: [[src-token-service:L89-96]]

## Medium Findings

### [finding-003] Missing rate limit on refresh endpoint (MEDIUM)

**Location**: `src/auth/routers/auth.py:34` (`POST /auth/refresh`)
**Confidence**: medium
**Confidence Reasoning**: The endpoint lacks a rate limit decorator, but the global rate limiter may cover it depending on configuration. Cannot confirm from the available context.

**Citations**: [[src-auth-router:L34]]

### [finding-004] Refresh token TTL not configurable (MEDIUM)

**Location**: `src/auth/token_service.py:12`
**Confidence**: high

`REFRESH_TOKEN_TTL = 86400` is hardcoded. Should be configurable via environment variable for different deployment environments (dev vs staging vs production).

**Citations**: [[src-token-service:L12]]

## Positive Observations

### [finding-005] Clean separation of token concerns (INFORMATIONAL)

**Observation Type**: praise
The token service properly separates access token generation, refresh token management, and token validation into distinct methods. The type hints are comprehensive and the docstrings are clear.

**Citations**: [[src-token-service:L1-30]]

## Recommendation

Address the critical cookie security finding before merging. The token rotation atomicity issue should also be fixed -- a user lockout from a crash during rotation is a real production risk.

---
*Tezit v1.2 | Profile: code_review | Context: 4 items | 2026-02-04*
