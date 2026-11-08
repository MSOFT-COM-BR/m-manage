/**
 * DTOs para consulta do Manifesto do Hub Central
 * 
 * Clean Architecture - Camada de Aplicação (Application Layer)
 * Contratos de entrada e saída para orquestração de descoberta de serviços (Service Discovery).
 * 
 * @module GetHubManifestDto
 * @version 0.10.56
 */

import { HubHealthStatus } from '../../domain';

/**
 * Parâmetros de entrada para consulta do manifesto do Hub
 */
export interface GetHubManifestInputDto {
    /**
     * Se false, omite do resultado os serviços verticais inativos ou em manutenção.
     * @default true
     */
    includeInactive?: boolean;

    /**
     * Filtro opcional para consultar serviços apenas com uma determinada tag (ex: 'erp', 'fintech').
     */
    tag?: string;

    /**
     * Filtro opcional por status operacional do serviço ('active', 'inactive', 'degraded', 'maintenance').
     */
    statusFilter?: string;
}

/**
 * Representação serializada de um serviço vertical no manifesto
 */
export interface HubServiceManifestItemDto {
    name: string;
    prefix: string;
    status: string;
    version: string;
    description?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Informações dos domínios estruturais de alto nível (Platform, Ecosystem)
 */
export interface HubDomainPartitionDto {
    name: string;
    prefix: string;
    modules: string[];
    status: string;
    description?: string;
}

/**
 * Metadados gerais do Hub de Serviços
 */
export interface HubManifestMetadataDto {
    name: string;
    version: string;
    environment: string;
    status: HubHealthStatus;
    uptime: number;
    timestamp: string;
}

/**
 * DTO de saída do manifesto completo do Hub
 */
export interface GetHubManifestOutputDto {
    hub: HubManifestMetadataDto;
    domains: {
        platform: HubDomainPartitionDto;
        ecosystem: HubDomainPartitionDto;
        services: Record<string, HubServiceManifestItemDto>;
    };
}
