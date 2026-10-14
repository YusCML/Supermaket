import { supabase } from './supabase';

export async function getIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Could not fetch user role:', error.message);
    return false;
  }
  return data?.is_admin ?? false;
}