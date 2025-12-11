import express from 'express';
import AdminRouter from '../routes/adminRoutes/AdminRoutes.js'

import { authenticateUser, } from '../middleware/AuthenticateUser.js';
import { requireAdminRule } from '../middleware/requireAdminRules.js';

import ClientRouter from '../routes/clientRoutes/ClientRoutes.js'
import PublicRouter from '../routes/publicRoutes/PublicRoutes.js'
const mainRouter = express.Router();



//api/admin
mainRouter.use('/admin',authenticateUser,requireAdminRule,AdminRouter)

//api/client
mainRouter.use('/client',authenticateUser,ClientRouter)

//api/public
mainRouter.use('/public',PublicRouter)


export default mainRouter;