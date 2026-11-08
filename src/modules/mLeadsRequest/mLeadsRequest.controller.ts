import { Elysia, t } from 'elysia';
import { mLead } from '../../models/mLeads';
import { mLogs } from '../../models/mLogs';
import { requireMasterAdmin } from '../../middleware/requireAuth';

/** POST /leads — captura de oportunidades (site expertise e outros). */
const createLeadBody = t.Object({
    name: t.String({ minLength: 2, maxLength: 120 }),
    email: t.String({ minLength: 5, maxLength: 180, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }),
    phone: t.String({ minLength: 8, maxLength: 30 }),
    company: t.Optional(t.String({ maxLength: 180 })),
    service: t.String({ minLength: 2, maxLength: 120 }),
    budget: t.Optional(t.String({ maxLength: 80 })),
    message: t.String({ minLength: 10, maxLength: 3000 }),
    source: t.Optional(t.String({ maxLength: 120 }))
});

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return 'Erro interno ao processar lead';
};

export const mLeadsRequestRoutes = new Elysia({ prefix: '/leads' })
    .post('/', async ({ body, set }) => {
        try {
            const lead = await mLead.create({
                name: body.name.trim(),
                email: body.email.trim().toLowerCase(),
                phone: body.phone.trim(),
                company: body.company?.trim() || undefined,
                service: body.service.trim(),
                budget: body.budget?.trim() || undefined,
                message: body.message.trim(),
                source: (body.source || 'website:expertise').trim(),
                status: 'new'
            });

            try {
                await mLogs.create({
                    action: 'CREATE_LEAD',
                    details: `New lead created from ${lead.source} - ${lead.email}`,
                    user: lead.email,
                    level: 'info'
                });
            } catch {
                // Logging must not block lead capture
            }

            set.status = 201;
            return {
                success: true,
                message: 'Lead registrado com sucesso',
                data: {
                    id: String(lead._id),
                    status: lead.status
                }
            };
        } catch (error: unknown) {
            set.status = 500;
            return {
                success: false,
                error: getErrorMessage(error)
            };
        }
    }, {
        body: createLeadBody
    })
    .get('/', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) {
            return { success: false, error: 'Não autorizado' };
        }

        try {
            const leads = await mLead.find().sort({ createdAt: -1 }).limit(200);
            return {
                success: true,
                count: leads.length,
                data: leads
            };
        } catch (error: unknown) {
            ctx.set.status = 500;
            return {
                success: false,
                error: getErrorMessage(error)
            };
        }
    });
