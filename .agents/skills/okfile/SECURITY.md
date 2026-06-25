# Security Policy

## Supported Scope

This repository contains:

- Cloudflare Pages Function code
- upload and account frontend pages
- skill and integration documentation

## Reporting Security Issues

Please do not open public issues for:

- leaked credentials
- auth bypass
- upload URL abuse
- API key exposure
- session or magic-link vulnerabilities

Instead, report privately to the project owner through a trusted private channel.

## Secret Handling Rules

Never commit these secrets to the repository:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `RESEND_API_KEY`
- GitHub personal access tokens
- Cloudflare API tokens

Secrets must remain in provider-managed secret storage only.

## Operational Notes

- rotate credentials if they are pasted into chat, logs, or screenshots
- keep repository remotes free of embedded tokens
- review examples and docs before release to ensure no real tokens are shown
- avoid copying local debug caches or deployment state into Git

## Sensitive Areas

Changes in these areas should be reviewed carefully:

- auth session creation and validation
- magic-link token generation and verification
- API key generation, storage, and limits
- presigned upload URL generation
- file activation and public access routes

## Disclosure Preference

Please allow time for triage and remediation before public disclosure.
