import { connectMongo } from '../config/mongo';
import { mBvaProspect } from '../models/mBvaProspect';

const APP_KEY = 'bva';

const prospects = [
    {
        id: 'clinica-ludica-sp',
        name: 'Clinica Ludica de Desenvolvimento Infantil & Terapia',
        category: 'Clinicas',
        address: 'Rua Vergueiro, 2045 - Vila Mariana, Sao Paulo - SP',
        phone: '(11) 3344-5566',
        whatsapp: '5511988776655',
        instagram: '@clinicaludica.infantil',
        lat: -23.5855,
        lng: -46.6340,
        status: 'Novo Lead',
        notes: 'Especializada em Terapia Ocupacional e Integracao Sensorial. Perfil para kits sensoriais Studio BVA.',
    },
    {
        id: 'colegio-crescer-aprender',
        name: 'Colegio Crescer & Aprender - Educacao Infantil',
        category: 'Escolas',
        address: 'Av. Brigadeiro Faria Lima, 1500 - Pinheiros, Sao Paulo - SP',
        phone: '(11) 3812-9090',
        whatsapp: '5511977665544',
        instagram: '@colegiocrescer.sp',
        lat: -23.5680,
        lng: -46.6900,
        status: 'Contatado',
        notes: 'Escola com abordagem socioconstrutivista e sala de neurodiversidade.',
    },
    {
        id: 'mundo-magico-brinquedos',
        name: 'Mundo Magico Brinquedos Educativos & Presentes',
        category: 'Lojas',
        address: 'Rua Oscar Freire, 800 - Jardins, Sao Paulo - SP',
        phone: '(11) 3060-4040',
        whatsapp: '5511999887766',
        instagram: '@mundomagico.brinquedos',
        lat: -23.5630,
        lng: -46.6680,
        status: 'Em Negociação',
        notes: 'Loja de varejo premium com interesse em pecas 3D colecionaveis e fidgets articulados.',
    },
    {
        id: 'espaco-sensorial-kids',
        name: 'Espaco Sensorial Kids & Psicopedagogia',
        category: 'Clinicas',
        address: 'Rua dos Pinheiros, 540 - Pinheiros, Sao Paulo - SP',
        phone: '(11) 3088-2211',
        whatsapp: '5511966554433',
        instagram: '@espacosensorial.kids',
        lat: -23.5655,
        lng: -46.6825,
        status: 'Novo Lead',
        notes: 'Centro de apoio multidisciplinar para criancas TEA/TDAH.',
    },
    {
        id: 'buffet-alegria-festa',
        name: 'Buffet Infantil Alegria & Magia',
        category: 'Buffets',
        address: 'Av. Paulista, 1000 - Bela Vista, Sao Paulo - SP',
        phone: '(11) 3255-8080',
        whatsapp: '5511955443322',
        instagram: '@buffetalegriamagia',
        lat: -23.5650,
        lng: -46.6520,
        status: 'Novo Lead',
        notes: 'Buffet de festas infantis. Oportunidade para lembrancinhas 3D personalizadas.',
    },
    {
        id: 'escola-viver-aprender',
        name: 'Escola Viver & Aprender Bilingue',
        category: 'Escolas',
        address: 'Rua Domingos de Morais, 1200 - Vila Mariana, Sao Paulo - SP',
        phone: '(11) 5579-1010',
        whatsapp: '5511944332211',
        instagram: '@escolaviverbilingue',
        lat: -23.5880,
        lng: -46.6380,
        status: 'Parceiro',
        notes: 'Ja realiza compras de kits sensoriais para salas de aula.',
    },
] as const;

await connectMongo();

let upserted = 0;
for (const item of prospects) {
    const { id, ...data } = item;
    await mBvaProspect.findOneAndUpdate(
        { uuid: id },
        {
            $set: {
                uuid: id,
                appKey: APP_KEY,
                ...data,
                source: 'seed:bva-prospects',
            },
        },
        { upsert: true, new: true, runValidators: true }
    );
    upserted++;
}

console.log(`Seed BVA prospects concluido: ${upserted} prospect(s).`);
process.exit(0);
