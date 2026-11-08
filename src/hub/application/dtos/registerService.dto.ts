/**
 * DTOs para registro dinâmico de serviços no Hub Central
 * 
 * Clean Architecture - Camada de Aplicação (Application Layer)
 * Contratos de entrada e saída para registro e orquestração de topologia de serviços.
 * 
 * @module RegisterServiceDto
 * @version 0.10.56
 */

import { AppServiceDTO } from '../../domain';

/**
 * Parâmetros de entrada para registrar um novo serviço no Hub
 */
export interface RegisterServiceInputDto {
    /**
     * Chave única do serviço (slug alfanumérico, ex: 'm-com', 'erp-finance').
     */
    key: string;

    /**
     * Nome amigável de exibição do serviço (ex: 'M-Com eCommerce').
     */
    name: string;

    /**
     * Prefixo de rota de rede e gateway HTTP (ex: '/m-com', '/api/v1/finance').
     */
    prefix: string;

    /**
     * Versão semântica (SemVer) no formato 'X.Y.Z' ou 'vX.Y' (ex: '1.0.0').
     */
    version: string;

    /**
     * Status operacional inicial do serviço.
     * Valores permitidos: 'active' | 'inactive' | 'degraded' | 'maintenance'.
     * @default 'active'
     */
    status?: string;

    /**
     * Descrição funcional do serviço ou módulo.
     */
    description?: string;

    /**
     * Lista de tags categóricas (ex: ['ecommerce', 'catalog']).
     */
    tags?: string[];

    /**
     * Metadados arbitrários de configuração (ex: flags de ambiente, endpoints, portas).
     */
    metadata?: Record<string, unknown>;
}

/**
 * Resposta de confirmação de registro de serviço
 */
export interface RegisterServiceOutputDto {
    success: boolean;
    message: string;
    service: AppServiceDTO;
}
