/**
 * M-Manage Hub Core Module
 * 
 * Ponto único de entrada e exportação para o Hub Central de Aplicações e Serviços.
 * Arquitetura em camadas (Clean Architecture) com 100% de retrocompatibilidade.
 * 
 * Camadas:
 * - Domain (Entidades, Value Objects, Erros e Contratos de Repositório)
 * - Application (Use Cases e DTOs)
 * - Infrastructure (Implementações de Repositório, Controladores Elysia e Adaptadores)
 * 
 * @module Hub
 * @version 0.10.56
 */

// Contratos e APIs Legadas (100% Retrocompatibilidade)
export * from './hub.types';
export * from './hub.registry';
export * from './hub.controller';

// Camadas Limpas (Clean Architecture)
export * from './domain';
export * from './application';
export * from './infrastructure';
