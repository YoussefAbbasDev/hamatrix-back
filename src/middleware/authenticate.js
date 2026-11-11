import { errors } from '../utils/errors.js';
import { verifyToken } from '../modules/auth/service.js';
import { User } from '../modules/users/model.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw errors.unauthenticated();

    let payload;
    try {
      payload = verifyToken(token, 'access');
    } catch (error) {
      if (error.name === 'TokenExpiredError') throw errors.tokenExpired();
      throw errors.unauthenticated('رمز الدخول غير صالح');
    }

    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') throw errors.unauthenticated();
    if (user.tokenVersion !== payload.ver) throw errors.tokenExpired();

    req.admin = user;
    next();
  } catch (error) {
    next(error);
  }
}
