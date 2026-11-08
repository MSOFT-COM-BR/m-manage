import { Elysia, t } from 'elysia';
import { Course } from '../models/Course';
import { mCursosAuth } from '../middleware/authGuard';

export const courseRoutes = new Elysia({ prefix: '/courses' })
    .get('/', async () => {
        const courses = await Course.find({ status: 'PUBLISHED' }).sort({ createdAt: -1 });
        return { data: courses };
    })
    .get('/:slug', async ({ params: { slug } }) => {
        const course = await Course.findOne({ slug });
        if (!course) throw new Error('Course not found');
        return { data: course };
    })
    .use(mCursosAuth)
    // Instructor/Admin protected routes
    .get('/my-courses', async ({ user }: any) => {
        // Cursos onde o usuário é instrutor
        const courses = await Course.find({ instructorId: user.id }).sort({ createdAt: -1 });
        return { data: courses };
    })
    .post('/', async ({ body, user }: any) => {
        const course = await Course.create({
            ...body,
            instructorId: user.id
        });
        return { data: course };
    }, {
        body: t.Object({
            title: t.String(),
            slug: t.String(),
            shortDescription: t.String(),
            fullDescription: t.Optional(t.String()),
            categoryId: t.Optional(t.String()),
            level: t.Optional(t.String()),
            price: t.Optional(t.Number()),
        })
    })
    .put('/:id', async ({ params: { id }, body, user }: any) => {
        // Idealmente checar se user é ADMIN ou instrutor dono
        const course = await Course.findOneAndUpdate(
            { _id: id, instructorId: user.id },
            body,
            { new: true }
        );
        if (!course) throw new Error('Course not found or unauthorized');
        return { data: course };
    }, {
        body: t.Object({
            title: t.Optional(t.String()),
            slug: t.Optional(t.String()),
            shortDescription: t.Optional(t.String()),
            fullDescription: t.Optional(t.String()),
            categoryId: t.Optional(t.String()),
            level: t.Optional(t.String()),
            price: t.Optional(t.Number()),
            status: t.Optional(t.String()),
        })
    })
    .delete('/:id', async ({ params: { id }, user }: any) => {
        const course = await Course.findOneAndDelete({ _id: id, instructorId: user.id });
        if (!course) throw new Error('Course not found or unauthorized');
        return { success: true };
    });
