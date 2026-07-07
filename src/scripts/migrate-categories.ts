import { connectMongo } from '../config/mongo';
import { mProduct } from '../models/mProduct';
import { mErp } from '../models/mErp';

await connectMongo();

const MAP: Record<string, string> = {
    'Animais 3D':    'Tecnico',
    'Fidget Toys':   'Sensorial',
    'Chaveiros':     'Tecnico',
    'Decoração':     'Tecnico',
    'Geral':         'Tecnico',
};

// Migra mProduct
for (const [from, to] of Object.entries(MAP)) {
    const r = await mProduct.updateMany({ category: from }, { $set: { category: to } });
    if (r.modifiedCount) console.log(`  mProduct: ${from} → ${to}: ${r.modifiedCount}`);
}

// Migra mErp (data.categoria)
for (const [from, to] of Object.entries(MAP)) {
    const r = await mErp.updateMany({ tipo: 'produto_fabril', 'data.categoria': from }, { $set: { 'data.categoria': to } });
    if (r.modifiedCount) console.log(`  mErp:     ${from} → ${to}: ${r.modifiedCount}`);
}

console.log('Migração de categorias concluída.');
process.exit(0);
