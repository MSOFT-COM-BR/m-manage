# S014 — 2FA + Social Login

**Status:** Backlog  
**Fase:** 4  
**Prioridade:** BAIXA  
**Data:** 2026-07-04

TOTP (Google Authenticator / Authy) via `otplib`.
OAuth2: Google, GitHub.
Fluxo: login → verifica 2FA → emite JWT.
`mAuth.twoFactorSecret` armazenado criptografado.
