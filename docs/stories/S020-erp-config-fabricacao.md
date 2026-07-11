# S020 — Configurações fixas de fabricação (energia, máquina, depreciação)

**Status:** Em andamento
**Módulo:** erp (precificação)
**Prioridade:** Média
**Data:** 2026-07-11
**Depende de:** S002 (bva-integration, base do ERP)

---

## Contexto

O custo de máquina usado na precificação (`custoMaquinaHora`) é hoje um valor **por produto**, com `2.50` hardcoded como default em três lugares independentes (`erp.controller.ts` na criação, `seed-bva-erp.ts`, e duplicado no frontend em `portal.html:2883/2903`). Não existe um lugar único onde o dono do negócio configure os parâmetros reais da fábrica — energia, potência da impressora, depreciação/manutenção — como empresas de impressão 3D fazem na prática (calculam um R$/hora fixo da operação e aplicam a todos os produtos).

**Requisito:** um módulo de configurações por tenant (`appKey`) onde se define:
- Custo de energia (R$/kWh)
- Potência da máquina em uso (Watts)
- Custo de depreciação/manutenção por hora (R$/h)
- O `custoMaquinaHora` resultante (calculado automaticamente: `(potência/1000 × kWh) + depreciação`, mas editável manualmente se o usuário preferir um valor fixo direto)

Esse valor passa a ser o **default global** usado ao criar um produto novo. Produtos existentes continuam podendo ter seu próprio `custoMaquinaHora` (override por peça já suportado desde sempre) — a config só define o ponto de partida, não obriga uniformidade.

## Decisões

1. **Singleton por tenant, não por produto.** Reaproveita o padrão já existente do `mErp` (`{ uuid, appKey, tipo, data }`) com um novo `tipo: 'config'`. Um único documento por `appKey` (upsert em vez de create).
2. **Cálculo assistido, não obrigatório.** O form oferece energia+potência+depreciação e calcula `custoMaquinaHora` automaticamente, mas o campo final é editável — negócios que já sabem seu R$/h "de cabeça" não são forçados a decompor.
3. **Fallback, não migração em massa.** Produtos já criados mantêm seu `custoMaquinaHora` individual gravado (nada muda neles). Só a **criação** de novo produto passa a puxar o valor da config como default do formulário, e o backend usa a config como fallback quando `custoMaquinaHora` não vem no payload do `POST /erp/produtos`.
4. **Sem novo model dedicado.** Segue o padrão `mErp` com `Schema.Types.Mixed` — consistente com `insumo`/`produto_fabril`/`kardex`, evita nova coleção Mongoose só para um documento singleton.

## Schema

```ts
export interface IErpConfig {
    custoEnergiaKwh: number;        // R$ por kWh
    potenciaMaquinaWatts: number;   // consumo da impressora em uso
    custoDepreciacaoHora: number;   // R$/h — depreciação/manutenção amortizada
    custoMaquinaHora: number;       // valor final aplicado (calculado ou sobrescrito manualmente)
}
```

Tipo `ErpTipo` ganha `'config'`. `IErp.data` passa a aceitar `IErpConfig`.

## Rotas (`/erp/config`)

- `GET /erp/config?appKey=` — viewer+. Retorna a config do tenant ou um objeto com defaults (`custoMaquinaHora: 2.5` etc.) se ainda não existir — nunca 404, pra não travar o form de produto na primeira visita.
- `PUT /erp/config` — editor+. Upsert (cria se não existir, atualiza se já existir). Recalcula `custoMaquinaHora` no backend a partir de energia+potência+depreciação quando o campo não vem explícito no payload.

## Integração com precificação

- `erpPricing.calcularPrecificacao` não muda — continua lendo `prod.custoMaquinaHora` do produto (comportamento já correto, override por peça preservado).
- `POST /erp/produtos` (criação): se `body.custoMaquinaHora` não vier, busca a config do tenant (`GET` interno) e usa o `custoMaquinaHora` de lá em vez do `2.5` fixo.
- `PUT /erp/produtos/:uuid` (edição): comportamento inalterado — mantém o valor já gravado no produto se não vier no body.

## Frontend (m-bva/portal.html)

- Nova seção "Configurações" dentro do módulo ERP (ao lado de Produtos/Insumos/Kardex): form com os 3 campos de entrada + preview do `custoMaquinaHora` calculado em tempo real (mesmo padrão de `previewPriceCalculation()` já usado no modal de produto).
- Botão salvar chama `PUT /erp/config`.
- `openAddErpProductModal()` passa a buscar a config uma vez (cacheada em memória) e usar `custoMaquinaHora` da config como valor inicial do campo (hoje inexistente no form — o campo não é editável na UI atual, só no payload; avaliado no momento da implementação se exibe um campo read-only "Custo Máquina/h: R$ X (config da fábrica)" no modal de produto).
- Remove o `2.50` hardcoded de `previewPriceCalculation()` (linha ~2883), passando a usar o valor da config carregada.

## Rollback

Reverter o commit. Sem migração destrutiva — produtos existentes não são tocados; a ausência do documento de config apenas volta a cair no fallback `2.5` hardcoded do backend (comportamento pré-S020).
