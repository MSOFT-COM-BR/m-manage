import { Elysia } from 'elysia';
import {
    catalogRoutes,
    CATALOG_SEED_DATA,
    seedCatalog,
    ensureCatalogSeeded,
} from './catalog';
import { appRoutes } from './apps';
import { mLeadsRequestRoutes } from './mLeadsRequest';
import { contentRoutes } from './content';
import { blogRoutes, toBlogListingItem } from './blogs';
import { mjsonRoutes } from './mjson';
import { clientFormsRoutes, persistClientFormEvent } from './clientForms';
import { webhookRoutes, webhookService } from './webhooks';

/**
 * Ecosystem & Licensing Domain Hub (Bounded Context Agregator)
 *
 * Consolida sob Clean Architecture os módulos do ecossistema MirandaSoft / M-Platform:
 * - catalog: Marketplace de aplicações, catálogo público e gestão administrativa de planos/apps
 * - apps: Provisionamento, instalação e governança de licenças com RBAC granular (mAppAccess)
 * - mLeadsRequest: Ingestão de leads comerciais e solicitações de orçamento
 * - content: CMS de conteúdo flexível estruturado
 * - blogs: Publicação, listagem e gestão editorial de artigos com cache Redis
 * - mjson: Repositório de metadados dinâmicos e configurações JSON autenticadas
 * - clientForms: Processador/Consumidor de formulários de clientes via mensageria
 * - webhooks: Motor de despacho de webhooks assíncronos e assinados (HMAC SHA-256) para n8n e automações
 *
 * Mantém 100% de retrocompatibilidade com as rotas e contratos existentes da API.
 */
export const ecosystemDomainRoutes = new Elysia({ name: 'domain.ecosystem' })
    .use(catalogRoutes)
    .use(appRoutes)
    .use(mLeadsRequestRoutes)
    .use(contentRoutes)
    .use(blogRoutes)
    .use(mjsonRoutes)
    .use(webhookRoutes)
    .use(clientFormsRoutes);

// Re-exportações tipadas para conveniência e retrocompatibilidade com importações existentes
export {
    catalogRoutes,
    CATALOG_SEED_DATA,
    seedCatalog,
    ensureCatalogSeeded,
    appRoutes,
    mLeadsRequestRoutes,
    contentRoutes,
    blogRoutes,
    toBlogListingItem,
    mjsonRoutes,
    clientFormsRoutes,
    persistClientFormEvent,
    webhookRoutes,
    webhookService,
};
