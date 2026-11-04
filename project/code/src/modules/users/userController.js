import { findAllUsers } from './userRepository.js';

export async function listUsersController(_req, res, next) {
  try {
    const users = await findAllUsers();
    res.status(200).json({ data: users });
  } catch (error) {
    next(error);
  }
}

export default { listUsers: listUsersController };
