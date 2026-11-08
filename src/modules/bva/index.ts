export { bvaCatalogAccessRoutes } from './bvaCatalogAccess.controller';
export { bvaCategoriaRoutes } from './bvaCategorias.controller';
export { bvaOrderRoutes } from './bvaOrders.controller';
export { bvaProspectRoutes } from './bvaProspects.controller';
export { consultorasRoutes } from './consultoras.controller';

// Entidades / Models e Types do Bounded Context BVA
export { mBvaCatalogAccess, type IBvaCatalogAccess } from '../../models/mBvaCatalogAccess';
export { mBvaCategoria, type IBvaCategoria } from '../../models/mBvaCategoria';
export { mBvaOrder, type IBvaOrder, type IBvaOrderItem, type IBvaOrderCustomer } from '../../models/mBvaOrder';
export { mBvaProspect, type IBvaProspect } from '../../models/mBvaProspect';
