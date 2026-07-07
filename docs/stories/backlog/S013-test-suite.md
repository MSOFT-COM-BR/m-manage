# S013 — Test Suite + CI/CD

**Status:** Backlog  
**Fase:** 4  
**Prioridade:** MÉDIA  
**Data:** 2026-07-04

Unit tests para todos os controllers com Bun test.
Integration tests end-to-end com MongoDB em memória.
Load tests com k6 (target: 1000 req/s).
GitHub Actions: lint → test → build → deploy.
Coverage mínimo: 70%.
