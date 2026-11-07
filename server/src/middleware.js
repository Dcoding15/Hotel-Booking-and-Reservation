import jwt from 'jsonwebtoken';
import { HttpError } from './utils.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user.id ?? user._id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: user.role === 'admin' ? '8h' : '7d',
  });

export const auth = (...roles) => (req, _res, next) => {
  const header = req.headers.authorization || '';
  try {
    const payload = jwt.verify(header.replace(/^Bearer /, ''), process.env.JWT_SECRET);
    if (roles.length && !roles.includes(payload.role)) throw new HttpError(403, 'Forbidden');
    req.auth = { id: payload.sub, role: payload.role };
    next();
  } catch (e) {
    next(e instanceof HttpError ? e : new HttpError(401, 'Please sign in'));
  }
};
