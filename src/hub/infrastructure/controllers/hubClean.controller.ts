/**
 * Hub Clean Controller
 * 
 * Camada 4: Adaptadores de Interface (Interface Adapters / Controllers)
 * Adaptador HTTP Elysia para Service Discovery, Topologia de Domínios e Monitoramento de Saúde.
 * 
 * Endpoints expostos:
 * - GET /hub: Atalho para o manifesto do Hub
 * - GET /hub/manifest: Manifesto com topologia, metadados e filtragem declarativa
 * - GET /hub/health: Status consolidado de saúde de infraestrutura e domínios
 * - POST /hub/services: Registro dinâmico de serviços verticais
 * 
 * @module HubCleanController
 * @version 0.10.56
 */

import { Elysia, t } from 'elysia';
import { db } from '../../../config/database';
import {
    CheckHubHealthUseCase,
    GetHubManifestUseCase,
    RegisterServiceUseCase,
} from '../../application';
import {
    DomainError,
    IHubServiceRepository,
    InvalidSemanticVersionError,
    InvalidServiceConfigError,
    InvalidServiceStatusError,
    ServiceAlreadyRegisteredError,
    ServiceNotFoundError,
} from '../../domain';
import { inMemoryHubServiceRepository } from '../repositories/inMemoryHubService.repository';

export interface HubCleanControllerOptions {
    hubRepository?: IHubServiceRepository;
    dbProvider?: {
        getConnectionStatus: () => {
            isConnected: boolean;
            readyState: number;
            host?: string;
            database?: string;
        };
    };
}

/**
 * Factory para criação do controlador com injeção de dependências desacoplada.
 */
export function createHubCleanController(options: HubCleanControllerOptions = {}) {
    const repository = options.hubRepository || inMemoryHubServiceRepository;
    const dbConnection = options.dbProvider || db;

    const getHubManifestUseCase = new GetHubManifestUseCase(repository);
    const checkHubHealthUseCase = new CheckHubHealthUseCase(repository);
    const registerServiceUseCase = new RegisterServiceUseCase(repository);

    return new Elysia({ prefix: '/hub' })
        /**
         * Rota raiz do Hub: retorna manifesto com árvore completa encapsulado em `{ success: true, data }`
         */
        .get('/', async () => {
            const manifest = await getHubManifestUseCase.execute();
            return {
                success: true,
                data: manifest,
            };
        })

        /**
         * Rota de Descoberta: Retorna o manifesto formal do Hub com suporte a query params
         */
        .get(
            '/manifest',
            async ({ query, set }) => {
                try {
                    const includeInactiveParam = query.includeInactive;
                    const includeInactive =
                        includeInactiveParam === undefined
                            ? true
                            : typeof includeInactiveParam === 'boolean'
                            ? includeInactiveParam
                            : includeInactiveParam !== 'false';

                    return await getHubManifestUseCase.execute({
                        includeInactive,
                        tag: query.tag,
                        statusFilter: query.statusFilter,
                    });
                } catch (error) {
                    return handleError(error, set);
                }
            },
            {
                query: t.Optional(
                    t.Object({
                        includeInactive: t.Optional(t.Union([t.Boolean(), t.String()])),
                        tag: t.Optional(t.String()),
                        statusFilter: t.Optional(t.String()),
                    })
                ),
            }
        )

        /**
         * Rota de Integridade: Status de saúde consolidado dos domínios, serviços e banco de dados
         * Mantém 100% de compatibilidade tanto com o campo `database` (legado) quanto `dependencies` (novo).
         */
        .get('/health', async ({ set }) => {
            try {
                const dbStatus = dbConnection.getConnectionStatus();
                const healthReport = await checkHubHealthUseCase.execute({
                    dependencies: {
                        database: dbStatus,
                    },
                });

                // Mapeamento retrocompatível para contratos que consom `database` no nível raiz
                return {
                    ...healthReport,
                    database: healthReport.dependencies.database,
                };
            } catch (error) {
                return handleError(error, set);
            }
        })

        /**
         * Rota de Registro Dinâmico: Cadastra um novo serviço vertical no Hub
         */
        .post(
            '/services',
            async ({ body, set }) => {
                try {
                    const result = await registerServiceUseCase.execute({
                        key: body.key,
                        name: body.name,
                        prefix: body.prefix,
                        version: body.version,
                        status: body.status,
                        description: body.description,
                        tags: body.tags,
                        metadata: body.metadata,
                    });

                    set.status = 201;
                    return result;
                } catch (error) {
                    return handleError(error, set);
                }
            },
            {
                body: t.Object({
                    key: t.String({ minLength: 1, description: 'Chave única do serviço (slug)' }),
                    name: t.String({ minLength: 1, description: 'Nome legível do serviço' }),
                    prefix: t.String({ minLength: 1, description: 'Prefixo de rota HTTP (iniciando com /)' }),
                    version: t.String({ minLength: 1, description: 'Versão SemVer (ex: 1.0.0)' }),
                    status: t.Optional(
                        t.Union([
                            t.Literal('active'),
                            t.Literal('inactive'),
                            t.Literal('degraded'),
                            t.Literal('maintenance'),
                        ])
                    ),
                    description: t.Optional(t.String()),
                    tags: t.Optional(t.Array(t.String())),
                    metadata: t.Optional(t.Record(t.String(), t.Any())),
                }),
            }
        );
}

/**
 * Tratamento centralizado e defensivo de erros da camada de domínio/aplicação
 */
function handleError(error: unknown, set: { status?: number | string }): { success: false; error: string; code: string; details?: unknown } {
    if (error instanceof ServiceAlreadyRegisteredError) {
        set.status = 409;
        return {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
        };
    }

    if (error instanceof ServiceNotFoundError) {
        set.status = 404;
        return {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
        };
    }

    if (
        error instanceof InvalidServiceConfigError ||
        error instanceof InvalidSemanticVersionError ||
        error instanceof InvalidServiceStatusError
    ) {
        set.status = 400;
        return {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
        };
    }

    if (error instanceof DomainError) {
        set.status = 400;
        return {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
        };
    }

    set.status = 500;
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return {
        success: false,
        error: message,
        code: 'INTERNAL_SERVER_ERROR',
    };
}

/**
 * Instância padrão pré-configurada para o runtime principal
 */
export const hubCleanRoutes = createHubCleanController();
export const hubCleanController = hubCleanRoutes;
