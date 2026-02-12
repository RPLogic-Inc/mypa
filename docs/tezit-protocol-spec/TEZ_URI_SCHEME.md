# The "tez" URI Scheme

**Version**: 1.0
**Status**: Draft
**Last Updated**: February 5, 2026
**Website**: [tezit.com/spec/uri](https://tezit.com/spec/uri)
**Protocol Spec**: [TEZIT_PROTOCOL_SPEC.md](./TEZIT_PROTOCOL_SPEC.md)

---

## Abstract

This document defines the "tez" Uniform Resource Identifier (URI) scheme
for identifying and locating Tezits across heterogeneous platforms. A Tez
is a bundle of synthesis, context, conversation, and metadata as defined
by the Tezit Protocol [TEZIT-PROTOCOL]. The "tez" URI scheme provides a
platform-independent mechanism for referencing a specific Tez, a version
thereof, an individual context item, an interrogation session, or any
other addressable component within a Tez bundle.

This specification follows the guidelines in RFC 7595 (Guidelines and
Registration Procedures for URI Schemes) and uses the key words defined
in RFC 2119 (Key words for use in RFCs).

---

## Table of Contents

1.  Introduction
2.  URI Syntax (ABNF)
3.  Path Components
4.  Query Parameters
5.  Fragment Identifiers
6.  Resolution
7.  The tez+https Variant
8.  Platform Discovery
9.  Security Considerations
10. IANA Considerations
11. Examples
12. References

---

## 1. Introduction

### 1.1 Purpose

The Tezit Protocol defines a standard for bundling knowledge artifacts
that preserve reasoning context alongside synthesis. Tezits may be
hosted on the canonical platform (tezit.com), on self-hosted instances,
or within enterprise deployments. As adoption grows, a universal
identifier is required to reference a specific Tez regardless of where
it is hosted.

The "tez" URI scheme provides this universal identifier. It enables:

-   Unambiguous identification of a Tez across platforms.
-   Deep-linking to specific components (versions, context items,
    synthesis sections, conversation records).
-   Invocation of platform features (interrogation, embedding) via
    query parameters.
-   Resolution to HTTPS URLs for retrieval by standard web clients.
-   Cross-platform interoperability for tools that produce, consume,
    or index Tezits.

### 1.2 Relationship to HTTP URLs

Every "tez" URI is resolvable to one or more HTTPS URLs. The "tez"
scheme serves as a logical identifier; HTTPS URLs serve as the transport
mechanism. Section 6 defines the resolution algorithm.

Applications that cannot register a custom URI handler MAY use the
"tez+https" variant defined in Section 7 as a functionally equivalent
alternative that resolves directly via standard HTTPS.

### 1.3 Registration Intent

This document requests provisional registration of the "tez" URI scheme
with IANA per the procedures in RFC 7595. The formal registration
template is provided in Section 10.

### 1.4 Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC 2119] [RFC 8174] when, and only when, they appear in all
capitals, as shown here.

Additional terms:

-   **Tez**: A bundle of synthesis, context, conversation, and metadata
    as defined by the Tezit Protocol.
-   **Tezit**: Singular; synonymous with Tez in common usage.
-   **Tezits**: Plural form.
-   **Interrogation**: The act of querying a Tez's AI against its
    transmitted context.
-   **Fork**: A derivative Tez that shares lineage with its parent.
-   **Synthesis**: The primary document (tez.md) within a Tez bundle.
-   **Context Item**: A source material within a Tez bundle.
-   **Vault**: A collection of Tezits owned by a user or organization.

---

## 2. URI Syntax (ABNF)

The following Augmented Backus-Naur Form (ABNF) grammar, as defined in
RFC 5234, specifies the syntax of "tez" URIs. Rules not defined here
are taken from RFC 3986 (Uniform Resource Identifier: Generic Syntax).

```abnf
tez-uri       = "tez://" authority "/" owner "/" tez-id [ tez-path ]
                [ "?" query ] [ "#" fragment ]

authority     = host [ ":" port ]
host          = reg-name / IPv4address / IP-literal
                ; as defined in RFC 3986, Section 3.2.2
port          = *DIGIT
                ; as defined in RFC 3986, Section 3.2.3

owner         = 1*owner-char
owner-char    = ALPHA / DIGIT / "-" / "_"
                ; usernames and organization identifiers

tez-id        = 1*tez-id-char
tez-id-char   = ALPHA / DIGIT / "-" / "_"
                ; human-readable slug or system-generated identifier

tez-path      = version-path / context-path / synthesis-path /
                conversation-path / forks-path / lineage-path /
                namespace-path

version-path  = "/v" version
version       = 1*DIGIT

context-path  = "/context" [ "/" item-id ]
item-id       = 1*item-id-char
item-id-char  = ALPHA / DIGIT / "-" / "_" / "."

synthesis-path    = "/synthesis"
conversation-path = "/conversation"
forks-path        = "/forks"
lineage-path      = "/lineage"

namespace-path    = "/" namespace "/" tez-id [ tez-path ]
namespace         = 1*owner-char
                    ; enables org/team/tez-id hierarchies

query         = query-param *( "&" query-param )
query-param   = param-name "=" param-value
param-name    = 1*( ALPHA / DIGIT / "-" / "_" )
param-value   = *( pchar / "/" / "?" )
                ; as defined in RFC 3986

fragment      = fragment-id
fragment-id   = synthesis-frag / context-frag / line-frag /
                line-range-frag / section-frag
synthesis-frag   = "synthesis"
context-frag     = "context"
line-frag        = "L" 1*DIGIT
line-range-frag  = "L" 1*DIGIT "-L" 1*DIGIT
section-frag     = 1*( ALPHA / DIGIT / "-" / "_" )
```

### 2.1 Character Encoding

All components of a "tez" URI MUST be encoded per RFC 3986 Section 2.
Characters outside the allowed set for each component MUST be
percent-encoded. The scheme name "tez" is case-insensitive; canonical
form is lowercase.

### 2.2 Normalization

Implementations performing URI comparison SHOULD normalize "tez" URIs
as follows:

1.  Scheme: lowercase ("tez").
2.  Host: lowercase.
3.  Port: omit default ports (443 for HTTPS resolution).
4.  Owner and tez-id: case-sensitive; no normalization.
5.  Path: no trailing slash.
6.  Query: parameters sorted lexicographically by name.
7.  Fragment: case-sensitive; no normalization.

---

## 3. Path Components

The path portion of a "tez" URI addresses a specific component or
sub-resource within a Tez bundle. All paths are relative to the
base Tez identified by `owner/tez-id`.

### 3.1 Version Path: /v{n}

References a specific immutable version of the Tez.

```
tez://tezit.com/jsmith/q4-budget-analysis/v2
```

-   `n` MUST be a positive integer.
-   Version 1 is the initial publication. Subsequent versions are
    numbered sequentially.
-   Omitting the version path references the latest published version.
-   Platforms MUST maintain version history for all published Tezits.
-   A version path MAY be combined with further sub-paths:
    `tez://tezit.com/jsmith/q4-budget-analysis/v2/context/spreadsheet`

### 3.2 Context Path: /context/{item-id}

References the context collection or a specific context item.

```
tez://tezit.com/jsmith/q4-budget-analysis/context
tez://tezit.com/jsmith/q4-budget-analysis/context/budget-spreadsheet
tez://tezit.com/jsmith/q4-budget-analysis/context/meeting-notes.pdf
```

-   `/context` without an item-id references the list of all context
    items in the Tez.
-   `/context/{item-id}` references a specific context item by its
    identifier as declared in the Tez manifest's `context.items` array.
-   The item-id MUST match the `id` field of a context item in the
    manifest. If no item matches, the platform MUST return 404.

### 3.3 Synthesis Path: /synthesis

References the synthesis document (tez.md) of the Tez.

```
tez://tezit.com/jsmith/q4-budget-analysis/synthesis
```

-   Resolves to the rendered synthesis document.
-   For Messaging Profile Tezits, this resolves to the surface message
    and its associated context summary.

### 3.4 Conversation Path: /conversation

References the conversation log (AI dialogue) that produced the Tez.

```
tez://tezit.com/jsmith/q4-budget-analysis/conversation
```

-   Resolves to the conversation record if one exists.
-   Platforms MUST return 404 if the Tez has no conversation record.
-   Platforms MAY restrict access to conversation records based on
    the Tez's permission model.

### 3.5 Forks Path: /forks

References the list of known forks of the Tez.

```
tez://tezit.com/jsmith/q4-budget-analysis/forks
```

-   Resolves to a list of Tezits that were forked from this Tez.
-   Each entry in the list SHOULD include the fork's "tez" URI,
    title, creator, and creation timestamp.

### 3.6 Lineage Path: /lineage

References the complete fork tree (ancestry and descendants) of the Tez.

```
tez://tezit.com/jsmith/q4-budget-analysis/lineage
```

-   Resolves to a tree structure showing the Tez's parent (if forked),
    siblings, and all descendants.
-   Platforms SHOULD render lineage as a directed acyclic graph.

### 3.7 Namespace Path: /namespace/tez-id

Supports organizational hierarchies where Tezits are grouped under
teams, departments, or projects within an owner's space.

```
tez://tezit.com/acme-corp/legal/merger-assessment
tez://tezit.com/acme-corp/engineering/api-redesign/v3
```

-   The namespace component is a single path segment between the owner
    and the tez-id.
-   Namespaces are OPTIONAL; platforms that do not support them MUST
    treat `owner/namespace/tez-id` as a three-segment path and resolve
    accordingly.

---

## 4. Query Parameters

Query parameters modify how the referenced Tez is presented or
interacted with. All query parameters are OPTIONAL.

### 4.1 Defined Parameters

| Parameter     | Type    | Description                                      |
|---------------|---------|--------------------------------------------------|
| `interrogate` | boolean | Open the Tez in interrogation mode               |
| `q`           | string  | Pre-filled interrogation query                   |
| `embed`       | boolean | Request an embeddable widget representation       |
| `format`      | enum    | Preferred response format: `json`, `md`, `html`  |
| `profile`     | string  | Override display profile (e.g., `knowledge`, `messaging`) |
| `at`          | string  | ISO 8601 timestamp for point-in-time access      |
| `diff`        | integer | Version number to diff against current/specified  |

### 4.2 Parameter: interrogate

```
tez://tezit.com/jsmith/q4-budget-analysis?interrogate=true
```

When `interrogate=true`, the platform SHOULD open the Tez in
interrogation mode, presenting the synthesis alongside a chat interface
grounded in the Tez's transmitted context. If the platform does not
support interrogation, it MUST fall back to standard display.

### 4.3 Parameter: q

```
tez://tezit.com/jsmith/q4-budget-analysis?q=What%20are%20the%20risks
```

Pre-fills an interrogation query. Implies `interrogate=true`. The
platform SHOULD automatically submit the query upon load.

The value MUST be percent-encoded per RFC 3986 Section 2.1. Platforms
MUST NOT execute queries longer than 2048 characters.

### 4.4 Parameter: embed

```
tez://tezit.com/jsmith/q4-budget-analysis?embed=true
```

Requests a compact, embeddable representation of the Tez suitable for
inclusion in iframes, widgets, or third-party applications.

When resolving to HTTPS, the platform SHOULD return an HTML document
with appropriate `X-Frame-Options` and `Content-Security-Policy` headers
to permit embedding.

### 4.5 Parameter: format

```
tez://tezit.com/jsmith/q4-budget-analysis?format=json
tez://tezit.com/jsmith/q4-budget-analysis?format=md
tez://tezit.com/jsmith/q4-budget-analysis?format=html
```

Requests the Tez in a specific format:

-   `json`: The full Tez manifest and metadata as JSON, conforming to
    the Tezit Protocol manifest schema.
-   `md`: The synthesis document in Markdown.
-   `html`: The rendered synthesis as an HTML document.

If the requested format is not available, the platform SHOULD respond
with `406 Not Acceptable` and a list of supported formats.

### 4.6 Parameter: at

```
tez://tezit.com/jsmith/q4-budget-analysis?at=2026-01-15T14:30:00Z
```

Requests the state of the Tez as it existed at the specified point in
time. This is distinct from version numbering: `at` references the
temporal state, while `/v{n}` references an explicit version milestone.

Platforms that support living documents SHOULD support temporal access.
Platforms that do not SHOULD return the nearest preceding version.

### 4.7 Parameter: diff

```
tez://tezit.com/jsmith/q4-budget-analysis/v3?diff=1
```

Requests a diff view comparing the referenced version against the
version specified by the `diff` parameter value. Platforms SHOULD
render additions, deletions, and modifications to both the synthesis
and the context item list.

### 4.8 Extensibility

Platforms MAY define additional query parameters prefixed with `x-` for
platform-specific features. Unrecognized parameters MUST be ignored by
conformant implementations; they MUST NOT cause resolution failure.

---

## 5. Fragment Identifiers

Fragment identifiers address sub-sections within a resolved Tez
resource. Per RFC 3986 Section 3.5, the fragment is not transmitted to
the server; it is interpreted by the client.

### 5.1 Defined Fragments

| Fragment           | Target                                   |
|--------------------|------------------------------------------|
| `#synthesis`       | The synthesis section of the Tez          |
| `#context`         | The context item listing                  |
| `#conversation`    | The conversation record                   |
| `#L{n}`            | Line n of the synthesis document          |
| `#L{n}-L{m}`       | Lines n through m of the synthesis        |
| `#section-{name}`  | A named section within the synthesis      |
| `#ctx-{item-id}`   | A specific context item (client-side)     |

### 5.2 Fragment: #synthesis

```
tez://tezit.com/jsmith/q4-budget-analysis#synthesis
```

Scrolls or navigates to the synthesis portion of the Tez display. On
platforms that display synthesis and context side-by-side, this focuses
the synthesis panel.

### 5.3 Fragment: #context

```
tez://tezit.com/jsmith/q4-budget-analysis#context
```

Navigates to the context item listing. Distinct from the `/context`
path: the path requests the context as a standalone resource; the
fragment navigates within the Tez's unified display.

### 5.4 Fragment: #L{n} and #L{n}-L{m}

```
tez://tezit.com/jsmith/q4-budget-analysis#L42
tez://tezit.com/jsmith/q4-budget-analysis#L42-L50
```

References a specific line or range of lines within the synthesis
document:

-   `n` and `m` MUST be positive integers.
-   `n` MUST be less than or equal to `m` in a range.
-   Platforms SHOULD highlight the referenced line(s).
-   If the synthesis document has fewer lines than specified, the
    platform SHOULD scroll to the end of the document.

### 5.5 Fragment: #section-{name}

```
tez://tezit.com/jsmith/q4-budget-analysis#section-risk-assessment
tez://tezit.com/jsmith/q4-budget-analysis#section-recommendations
```

References a named section within the synthesis document. The section
name corresponds to a heading in the synthesis, slugified per the
following rules:

1.  Convert to lowercase.
2.  Replace spaces and non-alphanumeric characters with hyphens.
3.  Collapse consecutive hyphens.
4.  Strip leading and trailing hyphens.

### 5.6 Fragment: #ctx-{item-id}

```
tez://tezit.com/jsmith/q4-budget-analysis#ctx-budget-spreadsheet
```

Navigates to a specific context item within the Tez display. This is
the client-side counterpart to the `/context/{item-id}` path; the
fragment navigates within the unified view rather than requesting the
item as a standalone resource.

---

## 6. Resolution

### 6.1 Overview

"tez" URIs are logical identifiers. To retrieve the referenced
resource, a client MUST resolve the "tez" URI to one or more HTTPS URLs.
This section defines the resolution algorithm.

### 6.2 Resolution Algorithm

A conformant resolver MUST implement the following algorithm:

```
FUNCTION resolve(tez_uri) -> https_url:

  1. Parse the tez_uri into components:
     {scheme, host, port, owner, tez_id, path, query, fragment}

  2. IF host is "tezit.com":
       base_url = "https://tezit.com"
     ELSE:
       Perform platform discovery (Section 6.3) for host.
       IF discovery succeeds:
         base_url = discovery_document.api_base
       ELSE:
         base_url = "https://" + host + [":" + port]

  3. Construct the resource path:
       resource_path = "/" + owner + "/" + tez_id + [path]

  4. Construct the HTTPS URL:
       https_url = base_url + resource_path + ["?" + query]
                   + ["#" + fragment]

  5. RETURN https_url
```

### 6.3 Platform Discovery

Before resolving a "tez" URI against a non-canonical host, a client
SHOULD attempt platform discovery by fetching the well-known document
at:

```
https://{host}/.well-known/tezit.json
```

If the document is present and valid, the client MUST use the `api_base`
value from the document as the base URL for resolution. If discovery
fails (network error, 404, invalid document), the client SHOULD fall
back to direct HTTPS resolution as specified in step 2 of the algorithm.

The platform discovery document is defined in Section 8.

### 6.4 Resolution Examples

| tez:// URI | Resolved HTTPS URL |
|---|---|
| `tez://tezit.com/jsmith/q4-budget` | `https://tezit.com/jsmith/q4-budget` |
| `tez://tezit.com/jsmith/q4-budget/v2` | `https://tezit.com/jsmith/q4-budget/v2` |
| `tez://tezit.com/jsmith/q4-budget/context/sheet` | `https://tezit.com/jsmith/q4-budget/context/sheet` |
| `tez://tezit.com/jsmith/q4-budget?format=json` | `https://tezit.com/jsmith/q4-budget?format=json` |
| `tez://internal.company.com/team/analysis` | `https://internal.company.com/api/v1/team/analysis` (via discovery) |
| `tez://localhost:3000/user/my-tez` | `https://localhost:3000/user/my-tez` |

### 6.5 Caching

Clients SHOULD cache platform discovery documents for the duration
specified by the HTTP `Cache-Control` header in the discovery response.
In the absence of cache directives, clients SHOULD cache discovery
documents for no more than 24 hours.

### 6.6 Failure Modes

If resolution fails, the client SHOULD:

1.  Inform the user that the Tez could not be located.
2.  Display the original "tez" URI for manual resolution.
3.  Suggest checking network connectivity or host availability.

Clients MUST NOT silently discard resolution failures or redirect to
unrelated resources.

---

## 7. The tez+https Variant

### 7.1 Purpose

For environments where custom URI scheme registration is not feasible
(e.g., web applications, email clients that strip custom schemes, or
platforms that restrict URI handlers), the "tez+https" variant provides
identical semantics using a compound scheme that resolves directly via
HTTPS.

### 7.2 Syntax

```abnf
tez-https-uri = "tez+https://" authority "/" owner "/" tez-id
                [ tez-path ] [ "?" query ] [ "#" fragment ]
```

All components share the same syntax and semantics as the "tez" scheme
defined in Section 2.

### 7.3 Resolution

A "tez+https" URI resolves by replacing the scheme with "https":

```
tez+https://tezit.com/jsmith/q4-budget  ->  https://tezit.com/jsmith/q4-budget
```

The platform discovery mechanism (Section 6.3) is NOT invoked for
"tez+https" URIs. The authority in the URI is used directly as the
HTTPS host.

### 7.4 Equivalence

The following URIs are semantically equivalent:

```
tez://tezit.com/jsmith/q4-budget
tez+https://tezit.com/jsmith/q4-budget
```

Platforms MUST treat them as references to the same resource.
Implementations SHOULD normalize to the "tez" scheme for storage and
comparison, and emit "tez+https" only when the recipient is known to
lack custom scheme support.

---

## 8. Platform Discovery

### 8.1 Well-Known Document

Any server hosting Tezits SHOULD serve a platform discovery document at:

```
https://{host}/.well-known/tezit.json
```

This document follows the well-known URI convention defined in RFC 8615.

### 8.2 Document Format

The discovery document is a JSON object with the following fields:

| Field              | Type    | Required | Description                                |
|--------------------|---------|----------|--------------------------------------------|
| `tezit_version`    | string  | Yes      | Tezit Protocol version supported           |
| `api_base`         | string  | Yes      | Base URL for API requests                  |
| `uri_base`         | string  | No       | Base URL for "tez" URI resolution (if different from api_base) |
| `interrogation`    | boolean | Yes      | Whether the platform supports interrogation |
| `forking`          | boolean | Yes      | Whether the platform supports forking       |
| `versioning`       | boolean | No       | Whether the platform supports version history (default: true) |
| `profiles`         | array   | No       | List of supported Tez profiles (e.g., ["knowledge", "messaging"]) |
| `max_context_size` | integer | No       | Maximum context bundle size in bytes        |
| `registration`     | string  | No       | URL for user registration                  |
| `documentation`    | string  | No       | URL for platform documentation             |
| `contact`          | string  | No       | Administrative contact email               |

### 8.3 Example Document

```json
{
  "tezit_version": "1.1",
  "api_base": "https://tezit.com/api/v1",
  "uri_base": "https://tezit.com",
  "interrogation": true,
  "forking": true,
  "versioning": true,
  "profiles": ["knowledge", "messaging"],
  "max_context_size": 104857600,
  "registration": "https://tezit.com/signup",
  "documentation": "https://tezit.com/protocol",
  "contact": "admin@tezit.com"
}
```

### 8.4 Enterprise Discovery Example

```json
{
  "tezit_version": "1.1",
  "api_base": "https://internal.company.com/api/v1",
  "uri_base": "https://internal.company.com/tez",
  "interrogation": true,
  "forking": true,
  "versioning": true,
  "profiles": ["knowledge"],
  "max_context_size": 524288000,
  "documentation": "https://internal.company.com/docs/tezit",
  "contact": "it-support@company.com"
}
```

### 8.5 Document Retrieval

Clients MUST fetch the discovery document over HTTPS. Clients MUST
verify the TLS certificate chain per RFC 6125. Clients MUST NOT follow
redirects that change the host component of the well-known URL.

The server SHOULD respond with `Content-Type: application/json` and
SHOULD include appropriate `Cache-Control` headers.

---

## 9. Security Considerations

### 9.1 Confidentiality

A "tez" URI identifies a resource but does not convey authorization.
The existence of a syntactically valid "tez" URI does not imply that the
referenced Tez is publicly accessible.

Implementations MUST NOT assume that a "tez" URI grants access.
Resolution of a "tez" URI to an HTTPS URL MUST result in standard HTTP
authentication and authorization checks at the hosting platform.

### 9.2 Private Tezits

URI resolution MUST NOT reveal the existence of private Tezits to
unauthorized parties. Specifically:

-   A request for a private Tez by an unauthorized client MUST return
    `404 Not Found`, not `403 Forbidden`, to prevent enumeration.
-   Platform discovery documents MUST NOT enumerate hosted Tezits.
-   Error messages MUST NOT include Tez titles, owner names, or
    content from private Tezits.

### 9.3 Capability URLs

Some platforms MAY support capability URLs -- URIs that embed an
unguessable token granting access without authentication:

```
tez://tezit.com/jsmith/q4-budget-analysis?token=a8f3e9...
```

Implementations using capability URLs:

-   MUST generate tokens with at least 128 bits of entropy.
-   MUST support token revocation.
-   SHOULD support token expiration.
-   MUST transmit capability URLs only over encrypted channels.
-   MUST warn users that sharing the URL shares access.

### 9.4 Cross-Platform Trust

When a "tez" URI references a host other than tezit.com, the client
is trusting that host to serve a genuine Tez. Clients SHOULD:

-   Verify TLS certificates for all resolved HTTPS URLs.
-   Display the host to the user before loading content.
-   Warn users when navigating to unfamiliar hosts.
-   Validate the platform discovery document schema before trusting
    its contents.

Clients MUST NOT automatically execute code or scripts loaded from
resolved Tez URIs without explicit user consent.

### 9.5 URI Injection

Applications that accept "tez" URIs as input MUST validate the URI
against the grammar defined in Section 2 before processing. Specific
mitigations:

-   Reject URIs with authorities that contain credentials
    (e.g., `tez://user:pass@host/...`).
-   Reject URIs with path traversal sequences (`..`).
-   Percent-decode and re-validate after decoding to prevent double-
    encoding attacks.
-   Sanitize URIs before embedding in HTML, JSON, or other contexts
    to prevent cross-site scripting (XSS).
-   Limit the total URI length to 8192 characters.

### 9.6 Interrogation Security

When a "tez" URI includes `?interrogate=true` or `?q=...`, the
platform launches an AI-grounded interrogation session. Platforms MUST:

-   Ensure interrogation responses are grounded exclusively in the
    Tez's transmitted context (per the Tezit Protocol's grounding
    requirement).
-   Prevent prompt injection via the `q` parameter from influencing
    system behavior beyond the intended query.
-   Rate-limit interrogation requests to prevent abuse.
-   Log interrogation queries for audit purposes when operating in
    enterprise environments.

### 9.7 Denial of Service

Platforms SHOULD implement rate limiting for URI resolution requests.
The platform discovery mechanism (Section 8) SHOULD be served from a
CDN or cache to withstand high request volumes. Clients SHOULD
implement exponential backoff on resolution failures.

---

## 10. IANA Considerations

### 10.1 URI Scheme Registration

This document requests registration of the "tez" URI scheme per
RFC 7595 Section 7.2.

**Scheme name**: tez

**Status**: Provisional

**Applications/protocols that use this scheme**: The Tezit Protocol
for knowledge artifact bundling and transmission. Applications include
knowledge management platforms, AI-assisted research tools, document
collaboration systems, and enterprise knowledge sharing.

**Contact**: Tezit Protocol Working Group, uri@tezit.com

**Change controller**: Tezit Protocol Working Group

**References**: This document; Tezit Protocol Specification v1.1
[TEZIT-PROTOCOL]

### 10.2 URI Scheme Syntax

```
tez-uri = "tez://" authority "/" owner "/" tez-id
          [ tez-path ] [ "?" query ] [ "#" fragment ]
```

See Section 2 for the complete ABNF grammar.

### 10.3 URI Scheme Semantics

A "tez" URI identifies a Tezit (knowledge artifact bundle) or a
component thereof hosted on a Tezit-compatible platform. The URI
encodes the hosting authority, the owner (user or organization), the
Tez identifier, and optional path, query, and fragment components that
address sub-resources or modify presentation.

### 10.4 Encoding Considerations

The "tez" scheme follows the encoding rules of RFC 3986. All components
MUST use UTF-8 encoding with percent-encoding for characters outside
the allowed set for each component.

### 10.5 Interoperability Considerations

The "tez" scheme is designed for use across heterogeneous platforms.
The platform discovery mechanism (Section 8) and the "tez+https"
variant (Section 7) ensure interoperability with systems that cannot
handle custom URI schemes.

### 10.6 Security Considerations

See Section 9.

### 10.7 Well-Known URI Registration

This document requests registration of the well-known URI suffix
"tezit.json" per RFC 8615.

**URI suffix**: tezit.json

**Change controller**: Tezit Protocol Working Group

**Reference**: This document, Section 8.

---

## 11. Examples

The following examples illustrate common usage patterns for "tez" URIs.

### 11.1 Basic Tez Reference

```
tez://tezit.com/jsmith/q4-budget-analysis
```

References the latest version of the Tez titled "q4-budget-analysis"
owned by user "jsmith" on tezit.com. This is the simplest and most
common form, suitable for sharing in chat messages, emails, or
documents.

**Usage**: "Check my analysis: tez://tezit.com/jsmith/q4-budget-analysis"

### 11.2 Specific Version

```
tez://tezit.com/jsmith/q4-budget-analysis/v2
```

References version 2 of the Tez. Use versioned URIs when citing a Tez
in contexts where the content must remain stable (academic citations,
legal references, audit trails).

**Usage**: "Per the v2 analysis [tez://tezit.com/jsmith/q4-budget-analysis/v2],
infrastructure costs are projected to increase 15% year-over-year."

### 11.3 Deep Link to Context Item

```
tez://tezit.com/jsmith/q4-budget-analysis/context/budget-spreadsheet
```

References a specific context item (the budget spreadsheet) within the
Tez. Useful when directing a colleague to a particular source document
within a larger analysis.

**Usage**: "The raw numbers are in
tez://tezit.com/jsmith/q4-budget-analysis/context/budget-spreadsheet
-- row 47 shows the discrepancy."

### 11.4 Synthesis with Line Reference

```
tez://tezit.com/jsmith/q4-budget-analysis#L42-L50
```

References lines 42 through 50 of the synthesis document. The platform
SHOULD highlight the referenced lines when rendering.

**Usage**: "See the risk section starting at
tez://tezit.com/jsmith/q4-budget-analysis#L42-L50 for the full
breakdown."

### 11.5 Interrogation Mode

```
tez://tezit.com/jsmith/q4-budget-analysis?interrogate=true
```

Opens the Tez in interrogation mode, allowing the recipient to
immediately begin asking questions against the Tez's context.

**Usage**: "I've put together the merger analysis. Interrogate it
yourself: tez://tezit.com/jsmith/q4-budget-analysis?interrogate=true"

### 11.6 Pre-Filled Query

```
tez://tezit.com/jsmith/q4-budget-analysis?q=What%20are%20the%20top%20three%20risks
```

Opens the Tez with a pre-filled interrogation query. The platform
submits the query automatically, presenting the answer immediately.

**Usage**: Embedding a "quick answer" link in a dashboard or report
that, when clicked, shows the AI's answer to a specific question
grounded in the Tez's evidence.

### 11.7 Embedded Widget

```
tez://tezit.com/jsmith/q4-budget-analysis?embed=true&format=html
```

Requests an embeddable HTML widget of the Tez, suitable for iframe
inclusion in third-party applications.

**Usage**: In an internal wiki or dashboard:
```html
<iframe src="https://tezit.com/jsmith/q4-budget-analysis?embed=true&format=html"
        width="800" height="600"></iframe>
```

### 11.8 Academic Citation

```
tez://tezit.com/research/climate-study-2025/v1#section-findings
```

References the findings section of a specific version of a research
Tez. Suitable for formal citation in papers and reports.

**Usage**: "Recent synthesis of IPCC data
[[tez://tezit.com/research/climate-study-2025/v1#section-findings]]
confirms the acceleration trend."

### 11.9 Organizational Namespace

```
tez://tezit.com/acme-corp/legal/merger-assessment
```

References a Tez within an organizational namespace. The path
`acme-corp/legal/merger-assessment` identifies the organization
(acme-corp), the team or department namespace (legal), and the Tez
(merger-assessment).

**Usage**: "Legal's assessment is ready for review:
tez://tezit.com/acme-corp/legal/merger-assessment"

### 11.10 Self-Hosted Instance

```
tez://internal.company.com/team/project-analysis
```

References a Tez on a self-hosted Tezit instance. The resolver will
perform platform discovery at
`https://internal.company.com/.well-known/tezit.json` to determine the
correct API base URL.

**Usage**: "I've uploaded the analysis to our internal Tezit:
tez://internal.company.com/team/project-analysis"

### 11.11 Local Development

```
tez://localhost:3000/user/my-tez
```

References a Tez on a local development server. Useful for testing
URI resolution and platform integration during development.

### 11.12 Fork Exploration

```
tez://tezit.com/jsmith/q4-budget-analysis/forks
tez://tezit.com/jsmith/q4-budget-analysis/lineage
```

The first URI lists all forks of the Tez. The second shows the
complete fork tree, including the parent Tez (if this Tez is itself
a fork) and all descendants.

**Usage**: "Three teams have forked the original analysis. See the
full lineage: tez://tezit.com/jsmith/q4-budget-analysis/lineage"

### 11.13 Format Negotiation

```
tez://tezit.com/jsmith/q4-budget-analysis?format=json
tez://tezit.com/jsmith/q4-budget-analysis?format=md
```

Requests the Tez in JSON (full manifest) or Markdown (synthesis only)
format. Useful for programmatic access or integration with tools that
consume specific formats.

**Usage**: A CI/CD pipeline that fetches a Tez manifest as JSON:
```bash
curl "$(tez resolve tez://tezit.com/jsmith/q4-budget?format=json)"
```

### 11.14 Version Comparison

```
tez://tezit.com/jsmith/q4-budget-analysis/v3?diff=1
```

Displays a diff between version 3 and version 1 of the Tez, showing
how the synthesis and context have evolved.

**Usage**: "Compare the latest analysis against the original:
tez://tezit.com/jsmith/q4-budget-analysis/v3?diff=1"

---

## 12. References

### 12.1 Normative References

-   **[RFC 2119]** Bradner, S., "Key words for use in RFCs to Indicate
    Requirement Levels", BCP 14, RFC 2119, March 1997.

-   **[RFC 3986]** Berners-Lee, T., Fielding, R., and L. Masinter,
    "Uniform Resource Identifier (URI): Generic Syntax", STD 66,
    RFC 3986, January 2005.

-   **[RFC 5234]** Crocker, D., Ed., and P. Overell, "Augmented BNF for
    Syntax Specifications: ABNF", STD 68, RFC 5234, January 2008.

-   **[RFC 6125]** Saint-Andre, P. and J. Hodges, "Representation and
    Verification of Domain-Based Application Service Identity within
    Internet Public Key Infrastructure Using X.509 (PKIX) Certificates
    in the Context of Transport Layer Security (TLS)", RFC 6125,
    March 2011.

-   **[RFC 7595]** Thaler, D., Hansen, T., and T. Hardie, "Guidelines
    and Registration Procedures for URI Schemes", BCP 35, RFC 7595,
    June 2015.

-   **[RFC 8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
    RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

-   **[RFC 8615]** Nottingham, M., "Well-Known Uniform Resource
    Identifiers (URIs)", RFC 8615, May 2019.

### 12.2 Informative References

-   **[TEZIT-PROTOCOL]** "Tezit Protocol Specification", Version 1.1,
    February 2026. https://tezit.com/spec

-   **[TEZIT-MANIFESTO]** "The Tezit Manifesto", Version 1.0,
    January 2026. https://tezit.com/manifesto

---

## Appendix A: URI Scheme Quick Reference

```
tez://[host]/[owner]/[tez-id]                          Basic reference
tez://[host]/[owner]/[tez-id]/v{n}                     Specific version
tez://[host]/[owner]/[tez-id]/context                   Context listing
tez://[host]/[owner]/[tez-id]/context/{item-id}         Specific context item
tez://[host]/[owner]/[tez-id]/synthesis                 Synthesis document
tez://[host]/[owner]/[tez-id]/conversation              Conversation record
tez://[host]/[owner]/[tez-id]/forks                     Fork listing
tez://[host]/[owner]/[tez-id]/lineage                   Fork tree
tez://[host]/[owner]/[namespace]/[tez-id]               Namespaced Tez

Query parameters:
  ?interrogate=true         Open in interrogation mode
  ?q={query}                Pre-filled interrogation query
  ?embed=true               Embeddable widget mode
  ?format=json|md|html      Preferred response format
  ?profile={name}           Override display profile
  ?at={iso8601}             Point-in-time access
  ?diff={version}           Diff against specified version

Fragment identifiers:
  #synthesis                Jump to synthesis
  #context                  Jump to context listing
  #conversation             Jump to conversation
  #L{n}                     Line n of synthesis
  #L{n}-L{m}                Line range in synthesis
  #section-{name}           Named section in synthesis
  #ctx-{item-id}            Specific context item (client-side)
```

---

## Appendix B: Implementation Notes

### B.1 URI Handler Registration

Desktop and mobile applications MAY register as handlers for the "tez"
URI scheme using platform-specific mechanisms:

-   **macOS**: `CFBundleURLTypes` in `Info.plist`
-   **Windows**: Registry key `HKEY_CLASSES_ROOT\tez`
-   **Linux**: Desktop entry with `MimeType=x-scheme-handler/tez`
-   **Android**: Intent filter with `android:scheme="tez"`
-   **iOS**: `CFBundleURLTypes` in `Info.plist`

### B.2 Web Fallback

Web applications that cannot register as URI scheme handlers SHOULD
implement a redirect service. When a user encounters a "tez" URI in a
browser, the browser will fail to resolve the custom scheme. A
companion browser extension or service worker MAY intercept the
navigation and redirect to the equivalent HTTPS URL per the resolution
algorithm in Section 6.

Alternatively, platforms SHOULD provide a web-based resolver at a
well-known URL:

```
https://tezit.com/resolve?uri=tez://tezit.com/jsmith/q4-budget
```

### B.3 Copy-to-Clipboard Behavior

When a user copies a Tez reference from a platform UI, the application
SHOULD place both the "tez" URI and the resolved HTTPS URL on the
clipboard to maximize compatibility across paste targets.

---

*End of document.*
