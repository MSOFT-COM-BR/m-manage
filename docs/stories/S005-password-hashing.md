# S005 — Password Hashing + Reset por Email

**Status:** Backlog  
**Fase:** 0 — Fundação  
**Prioridade:** CRÍTICA  
**Data:** 2026-07-04

---

## Problema

Senhas armazenadas em plaintext no MongoDB. Violação de LGPD e qualquer compliance básico.

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | Hash de senha com `Bun.password.hash()` (argon2 nativo no Bun) no registro |
| RF02 | Verificação com `Bun.password.verify()` no login |
| RF03 | Script de migração para fazer hash das senhas existentes |
| RF04 | `POST /auth/forgot-password` — gera token de reset (TTL 1h) e envia email |
| RF05 | `POST /auth/reset-password` — valida token e atualiza senha com hash |
| RF06 | Token de reset armazenado em `mAuth.resetToken` + `mAuth.resetTokenExpires` |

## Modelo de Dados — alterações em `mAuth`

```
password         String (bcrypt/argon2 hash — nunca retornado no JSON)
resetToken       String (hash do token de reset)
resetTokenExpires Date
```

## Variáveis de Ambiente

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@mirandasoft.com.br
SMTP_PASS=<senha>
APP_BASE_URL=https://mirandasoft.com.br
```

## Arquivos

- `src/services/email.service.ts` — sendResetEmail()
- `src/routes/auth.ts` — adicionar `/forgot-password`, `/reset-password`
- `src/models/mAuth.ts` — adicionar campos de reset
- `src/scripts/migrate-passwords.ts` — migração única
