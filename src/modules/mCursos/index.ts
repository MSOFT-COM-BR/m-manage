import { Elysia } from 'elysia';
import { categoryRoutes } from './routes/categoryRoutes';
import { courseRoutes } from './routes/courseRoutes';
import { moduleRoutes } from './routes/moduleRoutes';
import { lessonRoutes } from './routes/lessonRoutes';
import { enrollmentRoutes } from './routes/enrollmentRoutes';
import { progressRoutes } from './routes/progressRoutes';

/**
 * Agregador do serviço de LMS M-Cursos
 */
export const mCursosRoutes = new Elysia({ prefix: '/m-cursos' })
    .use(categoryRoutes)
    .use(courseRoutes)
    .use(moduleRoutes)
    .use(lessonRoutes)
    .use(enrollmentRoutes)
    .use(progressRoutes);

// Exportações granulares de rotas
export {
    categoryRoutes,
    courseRoutes,
    moduleRoutes,
    lessonRoutes,
    enrollmentRoutes,
    progressRoutes,
};

// Middlewares e Guards
export { mCursosAuth } from './middleware/authGuard';

// Entidades / Models e Types do Bounded Context mCursos
export { Category, type ICategory } from './models/Category';
export { Course, type ICourse } from './models/Course';
export { Module, type IModule } from './models/Module';
export { Lesson, type ILesson } from './models/Lesson';
export { Enrollment, type IEnrollment } from './models/Enrollment';
export { LessonProgress, type ILessonProgress } from './models/LessonProgress';
