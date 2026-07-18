import { Elysia } from 'elysia';
import { db } from './config/database';
import { credentialRoutes } from './routes/credentials';
import { taskRoutes } from './routes/tasks';
import { authRoutes } from './routes/auth';
import { healthtechRoutes } from './routes/healthtech';
import { appRoutes } from './routes/apps';
import { blogRoutes } from './routes/blogs';
import { logRoutes } from './routes/logs';
import { mLeadsRequestRoutes } from './modules/mLeadsRequest';
import { productRoutes } from './modules/products';
import { erpRoutes } from './modules/erp';
import { mjsonRoutes } from './routes/mjson';
import { bvaOrderRoutes } from './routes/bvaOrders';
import { bvaProspectRoutes } from './routes/bvaProspects';
import { cors } from '@elysiajs/cors';

/**
 * Cria e configura a aplicação Elysia
 */
export const app = new Elysia()
    // ... existing code ...
    // Configura CORS
    .use(cors({
        origin: [
            'https://mirandasoft.com.br',
            'https://www.mirandasoft.com.br',
            'https://studiobva.mirandasoft.com.br',
            'http://m-manage.local:3000',
            'http://m-manage.local',
            'http://m-bva.local:3000',
            'http://m-bva.local',
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:3001'
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-TOKEN', 'Origin']
    }))

    // Middleware global de logging


    // Middleware global de tratamento de erros
    .onError(({ code, error, set }) => {

        // Tratamento específico por tipo de erro
        switch (code) {
            case 'VALIDATION':
                set.status = 400;
                return {
                    success: false,
                    error: 'Erro de validação',
                    message: error.message,
                };

            case 'NOT_FOUND':
                set.status = 404;
                return {
                    success: false,
                    error: 'Rota não encontrada',
                };

            case 'INTERNAL_SERVER_ERROR':
                set.status = 500;
                return {
                    success: false,
                    error: 'Erro interno do servidor',
                    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
                };

            default:
                set.status = 500;
                return {
                    success: false,
                    error: 'Erro desconhecido',
                    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
                };
        }
    })

    // Rota de health check
    .get('/', () => ({
        success: true,
        message: 'API Bun + MongoDB está funcionando! 🚀',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    }))

    // Rota de status do banco de dados
    .get('/health', () => {
        const dbStatus = db.getConnectionStatus();

        return {
            success: true,
            status: 'healthy',
            database: {
                connected: dbStatus.isConnected,
                readyState: dbStatus.readyState,
                host: dbStatus.host,
                database: dbStatus.database,
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
        };
    })

    // Registra as rotas
    .use(credentialRoutes)
    .use(taskRoutes)
    .use(authRoutes)
    .use(healthtechRoutes)
    .use(appRoutes)
    .use(blogRoutes)
    .use(logRoutes)
    .use(mLeadsRequestRoutes)
    .use(productRoutes)
    .use(erpRoutes)
    .use(mjsonRoutes)
    .use(bvaOrderRoutes)
    .use(bvaProspectRoutes)

    // Documentação automática (Swagger)
    .get('/docs', () => ({
        success: true,
        message: 'Documentação da API',
        endpoints: {
            health: 'GET /',
            healthCheck: 'GET /health',
            auth: {
                login: 'POST /auth/login',
                register: 'POST /auth/register',
                users: 'GET /auth/users'
            },
            credentials: {
                list: 'GET /credentials (auth)',
                get: 'GET /credentials/:id (auth)',
                create: 'POST /credentials (auth)',
                update: 'PUT /credentials/:id (auth)',
                remove: 'DELETE /credentials/:id (auth)',
            },
            tasks: {
                list: 'GET /tasks',
                get: 'GET /tasks/:id',
                create: 'POST /tasks',
            },
            leads: {
                create: 'POST /leads',
                list: 'GET /leads'
            },
            mjson: {
                list: 'GET /mjson',
                getByKey: 'GET /mjson/:key',
                upsert: 'POST /mjson'
            }
        },
    }));
