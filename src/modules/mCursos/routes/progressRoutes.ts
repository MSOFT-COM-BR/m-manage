import { Elysia, t } from 'elysia';
import { LessonProgress } from '../models/LessonProgress';
import { Enrollment } from '../models/Enrollment';
import { mCursosAuth } from '../middleware/authGuard';

export const progressRoutes = new Elysia({ prefix: '/progress' })
    .use(mCursosAuth)
    .get('/course/:courseId', async ({ params: { courseId }, user }: any) => {
        const progress = await LessonProgress.find({ courseId, studentId: user.id });
        return { data: progress };
    })
    .post('/lesson/:lessonId', async ({ params: { lessonId }, body, user }: any) => {
        // Encontra a matrícula
        const enrollment = await Enrollment.findOne({ courseId: body.courseId, studentId: user.id });
        if (!enrollment) throw new Error("Não matriculado neste curso");

        const progress = await LessonProgress.findOneAndUpdate(
            { lessonId, studentId: user.id },
            {
                courseId: body.courseId,
                enrollmentId: enrollment._id,
                isCompleted: body.isCompleted,
                watchedSeconds: body.watchedSeconds,
                lastAccessedAt: new Date()
            },
            { upsert: true, new: true }
        );

        // TODO: Atualizar progresso total do Enrollment (progressPercentage)

        return { data: progress };
    }, {
        body: t.Object({
            courseId: t.String(),
            isCompleted: t.Optional(t.Boolean()),
            watchedSeconds: t.Optional(t.Number())
        })
    });
