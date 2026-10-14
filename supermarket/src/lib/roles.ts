import { supabase } from './supabase';
import type { AppRole } from '../types/app';

export async function getRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Could not fetch user role:', error.message);
    return null;
  }

  const role = data?.role;
  if (role === 'admin' || role === 'cashier' || role === 'customer') {
    return role;
  }
  return null;
}

export async function getIsAdmin(userId: string): Promise<boolean> {
  const role = await getRole(userId);
  return role === 'admin';
}