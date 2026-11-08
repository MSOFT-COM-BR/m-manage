import { hubCleanRoutes, hubCleanController } from './infrastructure/controllers/hubClean.controller';

/**
 * Hub Controller
 * 
 * Endpoints RESTful para Service Discovery, Topologia de Domínios
 * e Monitoramento de Saúde Consolidado do Hub.
 * 
 * Rotas expostas:
 * - GET /hub: Atalho para o manifesto do Hub
 * - GET /hub/manifest: Manifesto completo com topologia, versões e metadados
 * - GET /hub/health: Integridade consolidada de infraestrutura e domínios
 * - POST /hub/services: Registro dinâmico de novos serviços verticais
 * 
 * Implementado sob a Clean Architecture (Camada 4 - Adaptadores de Interface),
 * mantendo 100% de retrocompatibilidade com os contratos de consumo existentes.
 */
export const hubRoutes = hubCleanRoutes;

/**
 * Alias para manter compatibilidade com convenções de nomenclatura
 */
export const hubController = hubCleanController;

