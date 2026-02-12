# License Compliance Notes (OpenClaw + Twenty)

Date checked: 2026-02-09
Scope: Bundling MyPA starter deployments with OpenClaw + Twenty CRM

## Sources Checked

- OpenClaw repository license: `https://github.com/openclaw/openclaw/blob/main/LICENSE`
- OpenClaw npm package metadata: `https://www.npmjs.com/package/openclaw`
- Twenty repository license: `https://github.com/twentyhq/twenty/blob/main/LICENSE`
- Twenty pricing/license summary: `https://twenty.com/pricing`

## Findings

1. OpenClaw
- License appears MIT.
- MIT generally allows commercial use, bundling, modification, and redistribution with notice preservation.
- Operational requirement: retain copyright/license notice in distributions.

2. Twenty CRM
- Repository license text indicates mixed model:
  - Core sections under AGPL-style copyleft terms.
  - Files marked `/* @license Enterprise */` are governed by Twenty commercial license terms.
- Practical implication:
  - Self-hosting is possible.
  - Bundling/distributing modified deployments requires careful treatment of AGPL obligations and any enterprise-marked code usage.

## Delivery Guardrails for MyPA

- Do not directly embed or redistribute customer CRM datasets in repo artifacts.
- Keep Twenty deployment isolated from MyPA databases; integrate via API credentials only.
- Maintain a release-time third-party notice and SBOM for shipped deployment templates.
- Before paid rollout of "OpenClawd + Twenty included":
  - confirm whether enterprise-marked features are enabled in shipped stack,
  - decide compliance route (AGPL obligations vs commercial subscription with Twenty),
  - capture legal sign-off on distribution language and source disclosure process.

## Not Legal Advice

These notes are technical compliance guidance only. Final distribution decisions should be validated by legal counsel.

