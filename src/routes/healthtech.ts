import { Elysia, t } from 'elysia';
import { Patient } from '../models/healthtech/Patient';
import { Consultation } from '../models/healthtech/Consultation';
import { Formula } from '../models/healthtech/Formula';
import { Pharmacy } from '../models/healthtech/Pharmacy';
import { EducationContent } from '../models/healthtech/EducationContent';
import { LoyaltyProgram, LoyaltyReward } from '../models/healthtech/LoyaltyProgram';
import { FollowUp, FollowUpRule } from '../models/healthtech/FollowUp';
import { AuditLog, createAuditLog } from '../models/healthtech/AuditLog';
import { requireAuth } from '../middleware/requireAuth';

/**
 * HealthTech Routes
 * Farmácia 4.0 - Complete Pharmacy Management System
 * 
 * Modules:
 * 1. Pharmacy Management (Multi-tenancy / White-label)
 * 2. Patient CRM
 * 3. Pharmaceutical Office (Consultations)
 * 4. Formulation & Prescription
 * 5. Education & Health Tips
 * 6. Loyalty & Follow-up
 * 7. Analytics
 */
export const healthtechRoutes = new Elysia({ prefix: '/healthtech' })
    // Dados de pacientes/prontuário: exige sessão válida.
    // TODO: isolar por pharmacyId/tenant via requireAppAccess quando o appKey do healthtech
    // for registrado em mAppAccess — hoje só bloqueia acesso totalmente anônimo.
    .onBeforeHandle((ctx: any) => requireAuth(ctx) ? undefined : { success: false, error: 'Não autorizado' })

    // ============================================
    // PHARMACY MANAGEMENT (Module 1 - White Label)
    // ============================================

    .get('/pharmacy', async () => {
        try {
            return await Pharmacy.find({ active: true }).select('-settings.integrations');
        } catch (error) {
            throw new Error(`Error fetching pharmacies: ${error}`);
        }
    })

    .get('/pharmacy/:id', async ({ params: { id } }) => {
        try {
            const pharmacy = await Pharmacy.findById(id);
            if (!pharmacy) throw new Error('Pharmacy not found');
            return pharmacy;
        } catch (error) {
            throw new Error(`Error fetching pharmacy: ${error}`);
        }
    })

    .post('/pharmacy', async ({ body }: { body: any }) => {
        try {
            const pharmacy = new Pharmacy(body);
            await pharmacy.save();
            return { success: true, data: pharmacy };
        } catch (error) {
            throw new Error(`Error creating pharmacy: ${error}`);
        }
    })

    .put('/pharmacy/:id', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const pharmacy = await Pharmacy.findByIdAndUpdate(id, body, { new: true });
            if (!pharmacy) throw new Error('Pharmacy not found');
            return { success: true, data: pharmacy };
        } catch (error) {
            throw new Error(`Error updating pharmacy: ${error}`);
        }
    })

    // ============================================
    // PATIENT CRM (Module 2)
    // ============================================

    .get('/patients', async ({ query }: { query: any }) => {
        try {
            const filter: any = {};
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;
            if (query.active !== undefined) filter.active = query.active === 'true';
            if (query.phase) filter['journey.currentPhase'] = query.phase;
            if (query.tag) filter.tags = query.tag;

            return await Patient.find(filter)
                .sort({ createdAt: -1 })
                .limit(parseInt(query.limit) || 50);
        } catch (error) {
            throw new Error(`Error fetching patients: ${error}`);
        }
    })

    .get('/patients/:id', async ({ params: { id } }) => {
        try {
            const patient = await Patient.findById(id);
            if (!patient) throw new Error('Patient not found');
            return patient;
        } catch (error) {
            throw new Error(`Error fetching patient: ${error}`);
        }
    })

    .get('/patients/:id/timeline', async ({ params: { id } }) => {
        try {
            const [patient, consultations, formulas, followUps] = await Promise.all([
                Patient.findById(id),
                Consultation.find({ patientId: id }).sort({ date: -1 }).limit(20),
                Formula.find({ patientId: id }).sort({ createdAt: -1 }).limit(20),
                FollowUp.find({ patientId: id }).sort({ scheduledDate: -1 }).limit(20)
            ]);

            if (!patient) throw new Error('Patient not found');

            // Build timeline
            const timeline = [
                ...consultations.map(c => ({ type: 'consultation', date: c.date, data: c })),
                ...formulas.map(f => ({ type: 'formula', date: f.createdAt, data: f })),
                ...followUps.map(f => ({ type: 'follow_up', date: f.scheduledDate, data: f }))
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return {
                patient,
                timeline,
                stats: {
                    totalConsultations: consultations.length,
                    totalFormulas: formulas.length,
                    totalFollowUps: followUps.length
                }
            };
        } catch (error) {
            throw new Error(`Error fetching patient timeline: ${error}`);
        }
    })

    .get('/patients/:id/formulas', async ({ params: { id } }) => {
        try {
            return await Formula.find({ patientId: id }).sort({ createdAt: -1 });
        } catch (error) {
            throw new Error(`Error fetching patient formulas: ${error}`);
        }
    })

    .post('/patients', async ({ body }: { body: any }) => {
        try {
            const patient = new Patient(body);
            await patient.save();
            return { success: true, data: patient };
        } catch (error) {
            throw new Error(`Error creating patient: ${error}`);
        }
    })

    .put('/patients/:id', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const patient = await Patient.findByIdAndUpdate(id, body, { new: true });
            if (!patient) throw new Error('Patient not found');
            return { success: true, data: patient };
        } catch (error) {
            throw new Error(`Error updating patient: ${error}`);
        }
    })

    .post('/patients/:id/tags', async ({ params: { id }, body }: { params: { id: string }, body: { tags: string[] } }) => {
        try {
            const patient = await Patient.findByIdAndUpdate(
                id,
                { $addToSet: { tags: { $each: body.tags } } },
                { new: true }
            );
            if (!patient) throw new Error('Patient not found');
            return { success: true, data: patient };
        } catch (error) {
            throw new Error(`Error adding tags: ${error}`);
        }
    })

    .get('/patients/segment/:tag', async ({ params: { tag }, query }: { params: { tag: string }, query: any }) => {
        try {
            const filter: any = { tags: tag };
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;

            return await Patient.find(filter).sort({ 'journey.lastVisit': -1 });
        } catch (error) {
            throw new Error(`Error fetching patients by segment: ${error}`);
        }
    })

    // ============================================
    // CONSULTATIONS (Module 3 - Pharmaceutical Office)
    // ============================================

    .get('/consultations', async ({ query }: { query: any }) => {
        try {
            const filter: any = {};
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;
            if (query.patientId) filter.patientId = query.patientId;
            if (query.pharmacistId) filter.pharmacistId = query.pharmacistId;
            if (query.status) filter.status = query.status;
            if (query.date) {
                const date = new Date(query.date);
                filter.date = {
                    $gte: new Date(date.setHours(0, 0, 0, 0)),
                    $lt: new Date(date.setHours(23, 59, 59, 999))
                };
            }

            return await Consultation.find(filter)
                .populate('patientId', 'name contact')
                .sort({ date: -1 })
                .limit(parseInt(query.limit) || 50);
        } catch (error) {
            throw new Error(`Error fetching consultations: ${error}`);
        }
    })

    .get('/consultations/:id', async ({ params: { id } }) => {
        try {
            const consultation = await Consultation.findById(id)
                .populate('patientId')
                .populate('pharmacistId', 'name email');
            if (!consultation) throw new Error('Consultation not found');
            return consultation;
        } catch (error) {
            throw new Error(`Error fetching consultation: ${error}`);
        }
    })

    .post('/consultations', async ({ body }: { body: any }) => {
        try {
            const consultation = new Consultation(body);
            await consultation.save();

            // Update patient's last visit
            await Patient.findByIdAndUpdate(body.patientId, {
                'journey.lastVisit': new Date(),
                $inc: { 'journey.totalVisits': 1 }
            });

            return { success: true, data: consultation };
        } catch (error) {
            throw new Error(`Error recording consultation: ${error}`);
        }
    })

    .put('/consultations/:id', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const consultation = await Consultation.findByIdAndUpdate(id, body, { new: true });
            if (!consultation) throw new Error('Consultation not found');
            return { success: true, data: consultation };
        } catch (error) {
            throw new Error(`Error updating consultation: ${error}`);
        }
    })

    .post('/consultations/:id/complete', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const consultation = await Consultation.findByIdAndUpdate(
                id,
                {
                    status: 'completed',
                    completedAt: new Date(),
                    ...body
                },
                { new: true }
            );
            if (!consultation) throw new Error('Consultation not found');
            return { success: true, data: consultation };
        } catch (error) {
            throw new Error(`Error completing consultation: ${error}`);
        }
    })

    .post('/consultations/:id/follow-up', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const consultation = await Consultation.findById(id);
            if (!consultation) throw new Error('Consultation not found');

            // Create follow-up
            const followUp = new FollowUp({
                pharmacyId: consultation.pharmacyId,
                patientId: consultation.patientId,
                consultationId: id,
                type: 'post_consultation',
                scheduledDate: body.scheduledDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days default
                ...body
            });
            await followUp.save();

            // Update consultation
            consultation.followUp = {
                required: true,
                scheduledDate: followUp.scheduledDate,
                notes: body.notes
            };
            await consultation.save();

            return { success: true, data: { consultation, followUp } };
        } catch (error) {
            throw new Error(`Error scheduling follow-up: ${error}`);
        }
    })

    // ============================================
    // FORMULAS & PRESCRIPTIONS (Module 4)
    // ============================================

    .get('/formulas', async ({ query }: { query: any }) => {
        try {
            const filter: any = {};
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;
            if (query.patientId) filter.patientId = query.patientId;
            if (query.isTemplate !== undefined) filter.isTemplate = query.isTemplate === 'true';
            if (query.status) filter['production.status'] = query.status;
            if (query.category) filter.therapeuticCategory = query.category;

            return await Formula.find(filter)
                .populate('patientId', 'name')
                .sort({ createdAt: -1 })
                .limit(parseInt(query.limit) || 50);
        } catch (error) {
            throw new Error(`Error fetching formulas: ${error}`);
        }
    })

    .get('/formulas/templates', async ({ query }: { query: any }) => {
        try {
            const filter: any = { isTemplate: true };
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;
            if (query.category) filter.therapeuticCategory = query.category;

            return await Formula.find(filter).sort({ name: 1 });
        } catch (error) {
            throw new Error(`Error fetching formula templates: ${error}`);
        }
    })

    .get('/formulas/:id', async ({ params: { id } }) => {
        try {
            const formula = await Formula.findById(id)
                .populate('patientId')
                .populate('prescribedBy', 'name');
            if (!formula) throw new Error('Formula not found');
            return formula;
        } catch (error) {
            throw new Error(`Error fetching formula: ${error}`);
        }
    })

    .post('/formulas', async ({ body }: { body: any }) => {
        try {
            const formula = new Formula(body);
            await formula.save();
            return { success: true, data: formula };
        } catch (error) {
            throw new Error(`Error creating formula: ${error}`);
        }
    })

    .put('/formulas/:id', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const formula = await Formula.findByIdAndUpdate(id, body, { new: true });
            if (!formula) throw new Error('Formula not found');
            return { success: true, data: formula };
        } catch (error) {
            throw new Error(`Error updating formula: ${error}`);
        }
    })

    .post('/formulas/:id/clone', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const original = await Formula.findById(id);
            if (!original) throw new Error('Formula not found');

            const cloneData = original.toObject();
            delete cloneData._id;
            cloneData.parentFormulaId = original._id;
            cloneData.patientId = body.patientId || null;
            cloneData.isTemplate = body.isTemplate || false;
            cloneData.name = body.name || `${original.name} (Cópia)`;
            cloneData.createdAt = new Date();

            const clone = new Formula(cloneData);
            await clone.save();

            return { success: true, data: clone };
        } catch (error) {
            throw new Error(`Error cloning formula: ${error}`);
        }
    })

    .put('/formulas/:id/production', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const formula = await Formula.findByIdAndUpdate(
                id,
                { production: body },
                { new: true }
            );
            if (!formula) throw new Error('Formula not found');
            return { success: true, data: formula };
        } catch (error) {
            throw new Error(`Error updating production status: ${error}`);
        }
    })

    // ============================================
    // EDUCATION CONTENT (Module 5)
    // ============================================

    .get('/education/content', async ({ query }: { query: any }) => {
        try {
            const filter: any = { status: 'published' };
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;
            if (query.category) filter.category = query.category;
            if (query.tag) filter.tags = query.tag;
            if (query.type) filter.type = query.type;

            return await EducationContent.find(filter)
                .sort({ publishedAt: -1 })
                .limit(parseInt(query.limit) || 20);
        } catch (error) {
            throw new Error(`Error fetching education content: ${error}`);
        }
    })

    .get('/education/content/:id', async ({ params: { id } }) => {
        try {
            const content = await EducationContent.findByIdAndUpdate(
                id,
                { $inc: { 'engagement.views': 1 } },
                { new: true }
            );
            if (!content) throw new Error('Content not found');
            return content;
        } catch (error) {
            throw new Error(`Error fetching content: ${error}`);
        }
    })

    .get('/education/patient/:patientId', async ({ params: { patientId } }) => {
        try {
            const patient = await Patient.findById(patientId);
            if (!patient) throw new Error('Patient not found');

            // Find content matching patient's tags
            const content = await EducationContent.find({
                pharmacyId: patient.pharmacyId,
                status: 'published',
                $or: [
                    { 'targetAudience.segments': 'all' },
                    { 'targetAudience.patientTags': { $in: patient.tags } },
                    { tags: { $in: patient.tags } }
                ]
            })
                .sort({ publishedAt: -1 })
                .limit(10);

            return content;
        } catch (error) {
            throw new Error(`Error fetching patient content: ${error}`);
        }
    })

    .post('/education/content', async ({ body }: { body: any }) => {
        try {
            const content = new EducationContent(body);
            await content.save();
            return { success: true, data: content };
        } catch (error) {
            throw new Error(`Error creating content: ${error}`);
        }
    })

    .put('/education/content/:id', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const content = await EducationContent.findByIdAndUpdate(id, body, { new: true });
            if (!content) throw new Error('Content not found');
            return { success: true, data: content };
        } catch (error) {
            throw new Error(`Error updating content: ${error}`);
        }
    })

    // Legacy tips endpoint (backwards compatibility)
    .get('/education/tips', ({ query }: { query: any }) => {
        const tips = [
            { tag: 'skincare', text: 'Hidrate sua pele diariamente.' },
            { tag: 'supplements', text: 'Tome seus suplementos com água.' },
            { tag: 'sleep', text: 'Mantenha horários regulares de sono.' },
            { tag: 'nutrition', text: 'Inclua mais fibras na sua alimentação.' }
        ];

        if (query.tag) {
            return tips.filter(t => t.tag === query.tag);
        }
        return tips;
    })

    // ============================================
    // LOYALTY PROGRAM (Module 6)
    // ============================================

    .get('/loyalty/:patientId', async ({ params: { patientId } }) => {
        try {
            let loyalty = await LoyaltyProgram.findOne({ patientId })
                .populate('patientId', 'name');

            if (!loyalty) {
                throw new Error('Loyalty program not found for this patient');
            }

            return loyalty;
        } catch (error) {
            throw new Error(`Error fetching loyalty status: ${error}`);
        }
    })

    .post('/loyalty/enroll', async ({ body }: { body: { pharmacyId: string, patientId: string } }) => {
        try {
            // Check if already enrolled
            let loyalty = await LoyaltyProgram.findOne({
                pharmacyId: body.pharmacyId,
                patientId: body.patientId
            });

            if (loyalty) {
                return { success: true, data: loyalty, message: 'Already enrolled' };
            }

            loyalty = new LoyaltyProgram(body);
            await loyalty.save();

            return { success: true, data: loyalty };
        } catch (error) {
            throw new Error(`Error enrolling in loyalty program: ${error}`);
        }
    })

    .post('/loyalty/points', async ({ body }: { body: any }) => {
        try {
            const loyalty = await LoyaltyProgram.findOne({ patientId: body.patientId });
            if (!loyalty) throw new Error('Loyalty program not found');

            const pointsData = loyalty.points || { current: 0, lifetime: 0, redeemed: 0, expired: 0, pending: 0 };

            if (body.type === 'add') {
                pointsData.current += body.points;
                pointsData.lifetime += body.points;
            } else if (body.type === 'redeem') {
                if (pointsData.current < body.points) {
                    throw new Error('Insufficient points');
                }
                pointsData.current -= body.points;
                pointsData.redeemed += body.points;
            }

            // Add transaction
            if (!loyalty.transactions) {
                loyalty.transactions = [];
            }
            loyalty.transactions.push({
                type: body.type === 'add' ? 'earned' : 'redeemed',
                points: body.type === 'add' ? body.points : -body.points,
                balance: pointsData.current,
                description: body.description,
                createdAt: new Date()
            });

            loyalty.points = pointsData;
            await loyalty.save();

            return { success: true, data: loyalty };
        } catch (error) {
            throw new Error(`Error updating points: ${error}`);
        }
    })

    .get('/loyalty/rewards', async ({ query }: { query: any }) => {
        try {
            const filter: any = { active: true };
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;
            if (query.tier) filter.minimumTier = { $in: [query.tier, 'bronze'] };

            return await LoyaltyReward.find(filter).sort({ pointsCost: 1 });
        } catch (error) {
            throw new Error(`Error fetching rewards: ${error}`);
        }
    })

    .post('/nps', async ({ body }: { body: any }) => {
        try {
            const loyalty = await LoyaltyProgram.findOne({ patientId: body.patientId });
            if (!loyalty) throw new Error('Loyalty program not found');

            // Calculate category
            let category: 'detractor' | 'passive' | 'promoter';
            if (body.score >= 9) category = 'promoter';
            else if (body.score >= 7) category = 'passive';
            else category = 'detractor';

            // Add to history
            if (!loyalty.npsSurveys) {
                loyalty.npsSurveys = [];
            }
            loyalty.npsSurveys.push({
                score: body.score,
                feedback: body.feedback,
                category,
                touchpoint: body.touchpoint,
                submittedAt: new Date()
            });

            // Update current NPS
            loyalty.nps = {
                lastScore: body.score,
                lastSurveyDate: new Date(),
                surveyCount: (loyalty.nps?.surveyCount || 0) + 1,
                category
            };

            // Calculate average
            const avgScore = loyalty.npsSurveys.reduce((sum, s) => sum + s.score, 0) / loyalty.npsSurveys.length;
            loyalty.nps.averageScore = Math.round(avgScore * 10) / 10;

            await loyalty.save();

            return { success: true, data: loyalty.nps };
        } catch (error) {
            throw new Error(`Error submitting NPS: ${error}`);
        }
    })

    // ============================================
    // FOLLOW-UPS (Module 6)
    // ============================================

    .get('/follow-ups', async ({ query }: { query: any }) => {
        try {
            const filter: any = {};
            if (query.pharmacyId) filter.pharmacyId = query.pharmacyId;
            if (query.patientId) filter.patientId = query.patientId;
            if (query.status) filter.status = query.status;
            if (query.type) filter.type = query.type;
            if (query.assignedTo) filter.assignedTo = query.assignedTo;

            // Date filtering
            if (query.date) {
                const date = new Date(query.date);
                filter.scheduledDate = {
                    $gte: new Date(date.setHours(0, 0, 0, 0)),
                    $lt: new Date(date.setHours(23, 59, 59, 999))
                };
            } else if (query.upcoming === 'true') {
                filter.scheduledDate = { $gte: new Date() };
                filter.status = { $in: ['scheduled', 'pending'] };
            }

            return await FollowUp.find(filter)
                .populate('patientId', 'name contact')
                .populate('formulaId', 'name')
                .sort({ scheduledDate: 1 })
                .limit(parseInt(query.limit) || 50);
        } catch (error) {
            throw new Error(`Error fetching follow-ups: ${error}`);
        }
    })

    .get('/follow-ups/:id', async ({ params: { id } }) => {
        try {
            const followUp = await FollowUp.findById(id)
                .populate('patientId')
                .populate('formulaId')
                .populate('consultationId');
            if (!followUp) throw new Error('Follow-up not found');
            return followUp;
        } catch (error) {
            throw new Error(`Error fetching follow-up: ${error}`);
        }
    })

    .post('/follow-ups', async ({ body }: { body: any }) => {
        try {
            const followUp = new FollowUp(body);
            await followUp.save();
            return { success: true, data: followUp };
        } catch (error) {
            throw new Error(`Error creating follow-up: ${error}`);
        }
    })

    .put('/follow-ups/:id', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const followUp = await FollowUp.findByIdAndUpdate(id, body, { new: true });
            if (!followUp) throw new Error('Follow-up not found');
            return { success: true, data: followUp };
        } catch (error) {
            throw new Error(`Error updating follow-up: ${error}`);
        }
    })

    .post('/follow-ups/:id/complete', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const followUp = await FollowUp.findByIdAndUpdate(
                id,
                {
                    status: 'completed',
                    completedAt: new Date(),
                    outcome: body.outcome,
                    ...body
                },
                { new: true }
            );
            if (!followUp) throw new Error('Follow-up not found');
            return { success: true, data: followUp };
        } catch (error) {
            throw new Error(`Error completing follow-up: ${error}`);
        }
    })

    .post('/follow-ups/:id/attempt', async ({ params: { id }, body }: { params: { id: string }, body: any }) => {
        try {
            const followUp = await FollowUp.findById(id);
            if (!followUp) throw new Error('Follow-up not found');

            if (!followUp.attempts) {
                followUp.attempts = [];
            }

            followUp.attempts.push({
                date: new Date(),
                method: body.method,
                outcome: body.outcome,
                notes: body.notes,
                contactedBy: body.contactedBy
            });

            // Update status based on outcome
            if (body.outcome === 'completed') {
                followUp.status = 'completed';
                followUp.completedAt = new Date();
            } else if (body.outcome === 'answered') {
                followUp.status = 'in_progress';
            } else if (followUp.attempts.length >= 3) {
                followUp.status = 'no_response';
            }

            await followUp.save();

            return { success: true, data: followUp };
        } catch (error) {
            throw new Error(`Error adding attempt: ${error}`);
        }
    })

    // ============================================
    // ANALYTICS (Module 7)
    // ============================================

    .get('/analytics/dashboard', async ({ query }: { query: any }) => {
        try {
            const pharmacyId = query.pharmacyId;
            if (!pharmacyId) throw new Error('pharmacyId is required');

            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

            const [
                totalPatients,
                newPatientsThisMonth,
                totalConsultationsThisMonth,
                pendingFormulas,
                pendingFollowUps,
                recentNPS
            ] = await Promise.all([
                Patient.countDocuments({ pharmacyId, active: true }),
                Patient.countDocuments({
                    pharmacyId,
                    createdAt: { $gte: startOfMonth }
                }),
                Consultation.countDocuments({
                    pharmacyId,
                    date: { $gte: startOfMonth }
                }),
                Formula.countDocuments({
                    pharmacyId,
                    'production.status': { $in: ['pending', 'queued', 'in_production'] }
                }),
                FollowUp.countDocuments({
                    pharmacyId,
                    status: { $in: ['scheduled', 'pending'] },
                    scheduledDate: { $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) }
                }),
                LoyaltyProgram.aggregate([
                    { $match: { pharmacyId: pharmacyId } },
                    { $unwind: '$npsSurveys' },
                    { $match: { 'npsSurveys.submittedAt': { $gte: startOfMonth } } },
                    { $group: { _id: null, avgScore: { $avg: '$npsSurveys.score' } } }
                ])
            ]);

            return {
                overview: {
                    totalPatients,
                    newPatientsThisMonth,
                    consultationsThisMonth: totalConsultationsThisMonth,
                    pendingFormulas,
                    pendingFollowUps,
                    averageNPS: recentNPS[0]?.avgScore || null
                },
                timestamp: new Date()
            };
        } catch (error) {
            throw new Error(`Error fetching dashboard analytics: ${error}`);
        }
    })

    .get('/analytics/patients', async ({ query }: { query: any }) => {
        try {
            const pharmacyId = query.pharmacyId;
            if (!pharmacyId) throw new Error('pharmacyId is required');

            const [byPhase, byTag, recentlyActive] = await Promise.all([
                Patient.aggregate([
                    { $match: { pharmacyId: pharmacyId } },
                    { $group: { _id: '$journey.currentPhase', count: { $sum: 1 } } }
                ]),
                Patient.aggregate([
                    { $match: { pharmacyId: pharmacyId } },
                    { $unwind: '$tags' },
                    { $group: { _id: '$tags', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]),
                Patient.find({
                    pharmacyId,
                    'journey.lastVisit': { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }).countDocuments()
            ]);

            return {
                byPhase,
                byTag,
                recentlyActive
            };
        } catch (error) {
            throw new Error(`Error fetching patient analytics: ${error}`);
        }
    })

    .get('/analytics/formulas', async ({ query }: { query: any }) => {
        try {
            const pharmacyId = query.pharmacyId;
            if (!pharmacyId) throw new Error('pharmacyId is required');

            const [byStatus, byCategory, topFormulas] = await Promise.all([
                Formula.aggregate([
                    { $match: { pharmacyId: pharmacyId } },
                    { $group: { _id: '$production.status', count: { $sum: 1 } } }
                ]),
                Formula.aggregate([
                    { $match: { pharmacyId: pharmacyId } },
                    { $group: { _id: '$therapeuticCategory', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                Formula.aggregate([
                    { $match: { pharmacyId: pharmacyId, isTemplate: false } },
                    { $group: { _id: '$name', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ])
            ]);

            return {
                byStatus,
                byCategory,
                topFormulas
            };
        } catch (error) {
            throw new Error(`Error fetching formula analytics: ${error}`);
        }
    });
