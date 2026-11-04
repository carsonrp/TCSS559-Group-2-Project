import { Router } from 'express';
import { listUsersController } from './userController.js';

const userRouter = Router();

userRouter.get('/', listUsersController);

export default userRouter;
