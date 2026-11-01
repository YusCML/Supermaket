// roleIcons.tsx: which icon goes with each role.
//
// lib/roles.ts only stores an icon NAME for each role (plain text such as
// 'receipt'). This file turns that name into the real icon component from
// lucide-react, so roles.ts stays plain data with no icon code in it.
// Used by AccountMenu and RolePickerDialog.
import { Receipt, ShoppingBag, Wrench, type LucideIcon } from 'lucide-react';
import type { AppRole } from '../types/app';
import { ROLE_INFO } from '../lib/roles';

// Icon name -> icon component. Record<string, LucideIcon> means "an object
// whose keys are strings and whose values are lucide icon components".
const ICONS: Record<string, LucideIcon> = {
  'shopping-bag': ShoppingBag,
  'receipt': Receipt,
  'wrench': Wrench,
};

// Gives back the icon component for a role. It returns the component itself,
// not a drawn icon, so the caller picks the size:
//   const Icon = roleIcon('cashier');
//   <Icon className="size-4" />
// `??` falls back to the shopping bag if a name has no entry above.
export function roleIcon(role: AppRole): LucideIcon {
  return ICONS[ROLE_INFO[role].icon] ?? ShoppingBag;
}