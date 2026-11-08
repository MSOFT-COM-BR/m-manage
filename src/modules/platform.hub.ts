import { Elysia } from 'elysia';
import { adminClientRoutes, isValidCpf, isValidCnpj } from './adminClients';
import { authRoutes } from './auth';
import { credentialRoutes } from './credentials';
import { logRoutes } from './logs';
import { taskRoutes } from './tasks';
import { tokenRoutes } from './tokens';

/**
 * Hub de Rotas do Domínio de Plataforma & Core.
 *
 * Agrupa os serviços e endpoints fundamentais da plataforma:
 * - Autenticação & Autorização (`/auth`)
 * - Gestão de Credenciais (`/credentials`)
 * - Gestão Administrativa de Clientes (`/admin/clients`)
 * - Logs de Auditoria do Sistema (`/logs`)
 * - Agendamento e Execução de Tarefas (`/tasks`)
 * - Gerenciador Unificado de API Tokens (`/tokens`)
 *
 * Mantém retrocompatibilidade total e contratos estritos sob a Clean Architecture.
 */
export const platformDomainRoutes = new Elysia({ name: 'platform.domain' })
    .use(authRoutes)
    .use(credentialRoutes)
    .use(adminClientRoutes)
    .use(logRoutes)
    .use(taskRoutes)
    .use(tokenRoutes);

export {
    adminClientRoutes,
    authRoutes,
    credentialRoutes,
    isValidCnpj,
    isValidCpf,
    logRoutes,
    taskRoutes,
    tokenRoutes,
};

