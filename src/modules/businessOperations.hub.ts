import { Elysia } from 'elysia';
import { erpRoutes } from './erp';
import { erpFinanceRoutes } from './erpFinance';
import { healthtechRoutes } from './healthtech';
import { productRoutes } from './products';
import { restaurantRoutes } from './restaurant';

/**
 * Hub de Rotas de Operações de Negócio & Verticais SaaS (Clean Architecture).
 *
 * Agrupa os domínios de negócio verticais sob um único plugin Elysia:
 * - Indústria & Manufatura ERP (`/erp`)
 * - Gestão Financeira Corporativa ERP (`/erp-finance`)
 * - Farmácia 4.0 & HealthTech (`/healthtech`)
 * - Catálogo e Especificações de Produtos (`/products`)
 * - Gestão Gastronômica & Restaurantes (`/restaurant`)
 *
 * Garante integridade modular, isolamento de bounded contexts e 100% de retrocompatibilidade.
 */
export const businessOperationsRoutes = new Elysia({ name: 'businessOperations.hub' })
    .use(erpRoutes)
    .use(erpFinanceRoutes)
    .use(healthtechRoutes)
    .use(productRoutes)
    .use(restaurantRoutes);

export {
    erpRoutes,
    erpFinanceRoutes,
    healthtechRoutes,
    productRoutes,
    restaurantRoutes,
};
