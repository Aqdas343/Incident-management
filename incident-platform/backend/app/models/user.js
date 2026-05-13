import { supabase } from '../database.js';
import crypto from 'crypto';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createUser({ email, role, hashedPassword }) {
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('users').insert([
    {
      id,
      email,
      hashed_password: hashedPassword,
      role,
      is_active: true,
    },
  ]).select('*').single();

  if (error) throw error;
  return data;
}

export async function findUserByEmail(email) {
  const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function findUserById(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function findUserByRefreshToken(refreshToken) {
  const hashed = hashToken(refreshToken);
  const { data, error } = await supabase.from('users').select('*').eq('refresh_token_hash', hashed).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function storeRefreshToken(userId, refreshToken) {
  const hashed = hashToken(refreshToken);
  const { data, error } = await supabase.from('users').update({ refresh_token_hash: hashed, updated_at: new Date().toISOString() }).eq('id', userId).select('*').single();
  if (error) throw error;
  return data;
}
