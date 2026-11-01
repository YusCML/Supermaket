import { Receipt, ShoppingBag, Wrench, type LucideIcon } from 'lucide-react';
import type { AppRole } from '../types/app';
import { ROLE_INFO } from '../lib/roles';

const ICONS: Record<string, LucideIcon> = {
  'shopping-bag': ShoppingBag,
  'receipt': Receipt,
  'wrench': Wrench,
};

export function roleIcon(role: AppRole): LucideIcon {
  return ICONS[ROLE_INFO[role].icon] ?? ShoppingBag;
}