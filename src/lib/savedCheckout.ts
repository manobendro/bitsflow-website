/**
 * The customer's last-used checkout details, for pre-filling the order form.
 *
 * Written server-side on every successful order (functions/src/index.ts →
 * `users/{uid}.checkout`), read here by the owner (firestore.rules: a user can
 * read their own profile). Best-effort: any failure just means an empty form.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/client';

export interface SavedCheckout {
  customer: { name: string; phone: string; occupation: string; school: string };
  shipping: {
    line1: string;
    line2: string;
    city: string;
    district: string;
    postcode: string;
  };
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function loadSavedCheckout(uid: string): Promise<SavedCheckout | null> {
  try {
    const snap = await getDoc(doc(db(), 'users', uid));
    const c = snap.data()?.checkout as
      | { customer?: Record<string, unknown>; shipping?: Record<string, unknown> }
      | undefined;
    const sh = c?.shipping ?? {};
    // Only worth pre-filling if the address itself is usable.
    if (!s(sh.line1) || !s(sh.city) || !s(sh.district)) return null;
    const cu = c?.customer ?? {};
    return {
      customer: {
        name: s(cu.name),
        phone: s(cu.phone),
        occupation: s(cu.occupation),
        school: s(cu.school),
      },
      shipping: {
        line1: s(sh.line1),
        line2: s(sh.line2),
        city: s(sh.city),
        district: s(sh.district),
        postcode: s(sh.postcode),
      },
    };
  } catch {
    return null;
  }
}
