import { Elysia, t } from 'elysia';
import { Module } from '../models/Module';
import { Course } from '../models/Course';
import { mCursosAuth } from '../middleware/authGuard';

async function validateCourseOwnership(courseId: string, user: any): Promise<{ allowed: boolean; status?: number; error?: string }> {
    const course = await Course.findById(courseId);
    if (!course) {
        return { allowed: false, status: 404, error: 'Curso associado não encontrado' };
    }
    const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');
    const isOwner = course.instructorId?.toString() === user?.id?.toString();
    if (!isAdmin && !isOwner) {
        return {
            allowed: false,
            status: 403,
            error: 'Acesso negado: apenas o instrutor proprietário ou administrador pode gerenciar módulos deste curso'
        };
    }
    return { allowed: true };
}

export const moduleRoutes = new Elysia({ prefix: '/modules' })
    .get('/course/:courseId', async ({ params: { courseId } }) => {
        const modules = await Module.find({ courseId }).sort({ order: 1 });
        return { data: modules };
    })
    .use(mCursosAuth)
    .post('/', async ({ body, user, set }: any) => {
        const authCheck = await validateCourseOwnership(body.courseId, user);
        if (!authCheck.allowed) {
            set.status = authCheck.status || 403;
            return { success: false, error: authCheck.error };
        }

        const newModule = await Module.create(body);
        return { data: newModule };
    }, {
        body: t.Object({
            courseId: t.String(),
            title: t.String(),
            description: t.Optional(t.String()),
            order: t.Optional(t.Number()),
        })
    })
    .put('/:id', async ({ params: { id }, body, user, set }: any) => {
        const existingModule = await Module.findById(id);
        if (!existingModule) {
            set.status = 404;
            return { success: false, error: 'Módulo não encontrado' };
        }

        const authCheck = await validateCourseOwnership(existingModule.courseId, user);
        if (!authCheck.allowed) {
            set.status = authCheck.status || 403;
            return { success: false, error: authCheck.error };
        }

        const updatedModule = await Module.findByIdAndUpdate(id, body, { new: true });
        return { data: updatedModule };
    }, {
        body: t.Object({
            title: t.Optional(t.String()),
            description: t.Optional(t.String()),
            order: t.Optional(t.Number()),
        })
    })
    .delete('/:id', async ({ params: { id }, user, set }: any) => {
        const existingModule = await Module.findById(id);
        if (!existingModule) {
            set.status = 404;
            return { success: false, error: 'Módulo não encontrado' };
        }

        const authCheck = await validateCourseOwnership(existingModule.courseId, user);
        if (!authCheck.allowed) {
            set.status = authCheck.status || 403;
            return { success: false, error: authCheck.error };
        }

        await Module.findByIdAndDelete(id);
        return { success: true };
    });
