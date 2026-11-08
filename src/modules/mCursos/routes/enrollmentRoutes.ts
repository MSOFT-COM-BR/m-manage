import { Elysia, t } from 'elysia';
import { Enrollment } from '../models/Enrollment';
import { Course } from '../models/Course';
import { mCursosAuth } from '../middleware/authGuard';

export const enrollmentRoutes = new Elysia({ prefix: '/enrollments' })
    .use(mCursosAuth)
    .get('/my', async ({ user }: any) => {
        // Populating course would be good, but we can do a manual join or aggregate
        const enrollments = await Enrollment.find({ studentId: user.id }).sort({ enrolledAt: -1 });

        // Populate course details manually for now to avoid cross-db population issues
        const populated = await Promise.all(enrollments.map(async (enr) => {
            const course = await Course.findById(enr.courseId);
            return {
                ...enr.toObject(),
                course: course ? course.toObject() : null
            };
        }));
        return { data: populated };
    })
    .post('/', async ({ body, user }: any) => {
        // TODO: Em Fase 7 isso seria após pagamento. Na Fase 3 faz direto
        const existing = await Enrollment.findOne({ courseId: body.courseId, studentId: user.id });
        if (existing) {
            return { data: existing, message: "Já matriculado" };
        }

        const enrollment = await Enrollment.create({
            courseId: body.courseId,
            studentId: user.id,
            status: 'ACTIVE'
        });
        return { data: enrollment };
    }, {
        body: t.Object({
            courseId: t.String()
        })
    });
