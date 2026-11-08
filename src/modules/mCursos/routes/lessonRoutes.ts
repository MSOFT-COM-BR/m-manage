import { Elysia, t } from 'elysia';
import { Lesson } from '../models/Lesson';
import { Module } from '../models/Module';
import { Course } from '../models/Course';
import { mCursosAuth } from '../middleware/authGuard';
import { saveAnyUpload } from '../../../services/uploadService';

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
            error: 'Acesso negado: apenas o instrutor proprietário ou administrador pode gerenciar aulas deste curso'
        };
    }
    return { allowed: true };
}

export const lessonRoutes = new Elysia({ prefix: '/lessons' })
    .get('/module/:moduleId', async ({ params: { moduleId } }) => {
        // Alunos pegam PUBLISHED, admin pegaria tudo. Simplificação para FASE 2:
        const lessons = await Lesson.find({ moduleId }).sort({ order: 1 });
        return { data: lessons };
    })
    .get('/:id', async ({ params: { id } }) => {
        const lesson = await Lesson.findById(id);
        if (!lesson) throw new Error('Lesson not found');
        return { data: lesson };
    })
    .use(mCursosAuth)
    .post('/', async ({ body, user, set }: any) => {
        // Valida se o curso associado pertence ao instrutor ou se é admin
        const authCheck = await validateCourseOwnership(body.courseId, user);
        if (!authCheck.allowed) {
            set.status = authCheck.status || 403;
            return { success: false, error: authCheck.error };
        }

        // Valida se o módulo informado existe e pertence ao mesmo curso
        const module = await Module.findById(body.moduleId);
        if (!module || module.courseId.toString() !== body.courseId.toString()) {
            set.status = 404;
            return { success: false, error: 'Módulo associado não encontrado neste curso' };
        }

        const lesson = await Lesson.create(body);
        return { data: lesson };
    }, {
        body: t.Object({
            moduleId: t.String(),
            courseId: t.String(),
            title: t.String(),
            type: t.String(), // VIDEO, TEXT, PDF, FILE, QUIZ
            content: t.String(),
            duration: t.Optional(t.Number()),
            order: t.Optional(t.Number()),
            status: t.Optional(t.String()),
            isPreview: t.Optional(t.Boolean()),
        })
    })
    .put('/:id', async ({ params: { id }, body, user, set }: any) => {
        const existingLesson = await Lesson.findById(id);
        if (!existingLesson) {
            set.status = 404;
            return { success: false, error: 'Aula não encontrada' };
        }

        const authCheck = await validateCourseOwnership(existingLesson.courseId, user);
        if (!authCheck.allowed) {
            set.status = authCheck.status || 403;
            return { success: false, error: authCheck.error };
        }

        const lesson = await Lesson.findByIdAndUpdate(id, body, { new: true });
        return { data: lesson };
    }, {
        body: t.Object({
            title: t.Optional(t.String()),
            type: t.Optional(t.String()),
            content: t.Optional(t.String()),
            duration: t.Optional(t.Number()),
            order: t.Optional(t.Number()),
            status: t.Optional(t.String()),
            isPreview: t.Optional(t.Boolean()),
        })
    })
    .delete('/:id', async ({ params: { id }, user, set }: any) => {
        const existingLesson = await Lesson.findById(id);
        if (!existingLesson) {
            set.status = 404;
            return { success: false, error: 'Aula não encontrada' };
        }

        const authCheck = await validateCourseOwnership(existingLesson.courseId, user);
        if (!authCheck.allowed) {
            set.status = authCheck.status || 403;
            return { success: false, error: authCheck.error };
        }

        await Lesson.findByIdAndDelete(id);
        return { success: true };
    })
    // Material Upload Endpoint
    .post('/upload', async ({ body }: any) => {
        const file = body.file as File;
        if (!file) throw new Error('No file uploaded');

        // Upload para pasta mcursos/materials
        const result = await saveAnyUpload(file, 'mcursos/materials');
        return { data: result };
    }, {
        body: t.Object({
            file: t.File()
        })
    });
