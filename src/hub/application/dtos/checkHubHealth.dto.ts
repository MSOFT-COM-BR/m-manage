/**
 * DTOs para checagem consolidada de integridade do Hub Central
 * 
 * Clean Architecture - Camada de Aplicação (Application Layer)
 * Consolida a saúde dos domínios internos e das dependências externas (Database, RabbitMQ).
 * 
 * @module CheckHubHealthDto
 * @version 0.10.56
 */

import { HubHealthStatus } from '../../domain';

/**
 * Informações de estado das dependências de infraestrutura injetadas pelo chamador
 */
export interface ExternalDependenciesInputDto {
    database?: {
        isConnected: boolean;
        readyState?: number;
        host?: string;
        database?: string;
        latencyMs?: number;
        error?: string;
    };
    rabbitmq?: {
        isConnected: boolean;
        status?: string;
        uri?: string;
        latencyMs?: number;
        error?: string;
    };
    redis?: {
        isConnected?: boolean;
        status?: string;
        latencyMs?: number;
        error?: string;
    };
}

/**
 * Entrada para o Use Case de verificação de integridade
 */
export interface CheckHubHealthInputDto {
    dependencies?: ExternalDependenciesInputDto;
}

/**
 * Detalhes de integridade de dependência de banco de dados
 */
export interface DatabaseHealthDetailDto {
    connected: boolean;
    status: 'connected' | 'degraded' | 'disconnected';
    host?: string;
    database?: string;
    latencyMs?: number;
    error?: string;
}

/**
 * Detalhes de integridade de dependência do RabbitMQ (Message Broker)
 */
export interface RabbitMQHealthDetailDto {
    connected: boolean;
    status: 'connected' | 'degraded' | 'disconnected';
    latencyMs?: number;
    error?: string;
}

/**
 * Detalhes de integridade por partição de domínio
 */
export interface DomainHealthSummaryDto {
    status: HubHealthStatus;
    totalUnits: number;
    activeUnits: number;
    modules?: string[];
}

/**
 * Resposta de saída com o relatório consolidado de integridade do Hub
 */
export interface CheckHubHealthOutputDto {
    success: boolean;
    status: HubHealthStatus;
    timestamp: string;
    uptime: number;
    version: string;
    environment: string;
    dependencies: {
        database: DatabaseHealthDetailDto;
        rabbitmq?: RabbitMQHealthDetailDto;
    };
    domains: {
        platform: DomainHealthSummaryDto & { modules: string[] };
        ecosystem: DomainHealthSummaryDto & { modules: string[] };
        services: DomainHealthSummaryDto & {
            services: Record<string, { status: string; version: string }>;
        };
    };
}
