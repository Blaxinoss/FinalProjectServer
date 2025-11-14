
import express from 'express'
import { PrismaClient } from '../../src/generated/prisma/index.js';

import AdminRouter from '../adminRoutes/adminRoutes/AdminRoutesOLDGROUPED.js'
import { authenticateUser } from '../../middleware/AuthenticateUser.js';
import { requireAdminRule } from '../../middleware/requireAdminRules.js';

import  walkInRoutes from '../publicRoutes/WalkInRoute.js'
import webhookRoutes from '../publicRoutes/webHookRoute.js'

const mainRouter = express.Router();
const UserRouter = express.Router();

export const prisma = new PrismaClient();

UserRouter.use()


mainRouter.use('/walk-in', walkInRoutes);     // ⬅️ زي /api/walk-in/register
mainRouter.use('/webhooks', webhookRoutes); // ⬅️ زي /api/webhooks/stripe

mainRouter.use('/admin',authenticateUser,requireAdminRule,AdminRouter)
mainRouter.use('/',authenticateUser,UserRouter)




export default mainRouter;