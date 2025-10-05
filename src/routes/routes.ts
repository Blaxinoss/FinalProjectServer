
import express from 'express'
import { PrismaClient } from '../src/generated/prisma/index.js';

const routes = express.Router();

export const prisma = new PrismaClient();


export default routes;