import { Elysia } from 'elysia';
import {
    bvaCatalogAccessRoutes,
    bvaCategoriaRoutes,
    bvaOrderRoutes,
    bvaProspectRoutes,
    consultorasRoutes,
} from './bva';
import { mCursosRoutes } from './mCursos';

/**
 * Hub de Rotas dos Domínios Verticais de Negócio: Educação (mCursos) e Moda/Catálogo (bva).
 *
 * Agrupa os serviços verticais de SaaS sob Clean Architecture:
 * - LMS Educação: Cursos, Módulos, Aulas, Matrículas e Progresso (`/m-cursos`)
 * - Studio BVA: Pedidos (`/bva/orders`), Prospects (`/bva/prospects`),
 *   Categorias (`/bva/categorias`), Registro de Acessos (`/bva/catalog-access`),
 *   Consultoras & Revendedoras (`/bva/consultoras`).
 *
 * Mantém isolamento de bounded context e retrocompatibilidade estrita.
 */
export const businessEduFashionRoutes = new Elysia({ name: 'business.edu-fashion' })
    .use(mCursosRoutes)
    .use(bvaOrderRoutes)
    .use(bvaProspectRoutes)
    .use(bvaCategoriaRoutes)
    .use(bvaCatalogAccessRoutes)
    .use(consultorasRoutes);

export {
    mCursosRoutes,
    bvaOrderRoutes,
    bvaProspectRoutes,
    bvaCategoriaRoutes,
    bvaCatalogAccessRoutes,
    consultorasRoutes,
};
