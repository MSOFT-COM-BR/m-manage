/**
 * M-Manage App & Services Hub - Type Definitions
 * 
 * Contratos de dados, interfaces e tipos para o Hub Central de Aplicações e Serviços.
 * Alinhado com a Especificação Arquitetural V0.10.53 e Clean Architecture.
 * 
 * @module HubTypes
 * @version 0.10.53
 */

export type HubHealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type ServiceOperationalStatus = 'active' | 'inactive' | 'deprecated' | 'maintenance';

/**
 * Metadados gerais do Hub de Aplicações
 */
export interface HubMetadata {
    name: string;
    version: string;
    environment: string;
    status: HubHealthStatus;
    uptime?: number;
    timestamp?: string;
}

/**
 * Informações cadastrais de um Domínio de Alto Nível
 */
export interface DomainInfo {
    prefix: string;
    modules: string[];
    status: ServiceOperationalStatus;
    name?: string;
    description?: string;
}

/**
 * Informações e metadados de uma Vertical de Serviço (SaaS)
 */
export interface ServiceInfo {
    prefix: string;
    status: ServiceOperationalStatus;
    version: string;
    name?: string;
    description?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Agrupamento de domínios expostos pelo Hub
 */
export interface HubDomains {
    platform: DomainInfo;
    ecosystem: DomainInfo;
    services: Record<string, ServiceInfo>;
}

/**
 * Contrato principal do Manifesto do Hub (Discovery Engine)
 * Alinhado ao schema esperado por GET /hub/manifest
 */
export interface HubManifest {
    hub: HubMetadata;
    domains: HubDomains;
}

/**
 * Status individual de saúde de um domínio
 */
export interface DomainHealthCheck {
    status: HubHealthStatus;
    totalUnits: number;
    activeUnits: number;
    message?: string;
}

/**
 * Resposta estruturada para a rota de integridade consolidada (GET /hub/health)
 */
export interface HubHealthResponse {
    success: boolean;
    status: HubHealthStatus;
    timestamp: string;
    uptime: number;
    version: string;
    environment: string;
    database: {
        connected: boolean;
        status: string;
        host?: string;
        database?: string;
    };
    domains: {
        platform: DomainHealthCheck & { modules: string[] };
        ecosystem: DomainHealthCheck & { modules: string[] };
        services: DomainHealthCheck & {
            services: Record<string, { status: ServiceOperationalStatus; version: string }>;
        };
    };
}
