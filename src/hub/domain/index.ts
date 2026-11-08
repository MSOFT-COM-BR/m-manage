/**
 * Camada 1: Domínio (Enterprise Business Rules)
 * Hub Central de Aplicações e Serviços - M-Manage
 * 
 * Camada pura sem dependências de frameworks, ORMs ou bibliotecas externas.
 */

// Entities
export * from './entities/appService.entity';
export * from './entities/hubManifest.entity';

// Value Objects
export * from './valueObjects/serviceStatus.vo';
export * from './valueObjects/semanticVersion.vo';

// Repositories (Ports)
export * from './repositories/IHubServiceRepository';

// Errors
export * from './errors/hub.errors';
