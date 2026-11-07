import axios from 'axios';
import { io } from 'socket.io-client';

export const TOKEN_KEY = 'roomkey_token';

export const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let socket, socketToken;
export function getSocket() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io('/', { auth: { token } });
  return socket;
}
