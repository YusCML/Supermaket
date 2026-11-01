// supabase.ts: the app's one connection to Supabase (our hosted Postgres
// database + sign-in service + file storage).
//
// It creates a single "client" object and shares it. Everything that talks to
// Supabase imports it from here:
//   - src/lib/api.ts        (all reading and saving of store data)
//   - src/lib/roles.ts      (looking up which roles someone has)
//   - src/contexts/AuthContext.tsx (signing in and out)
// Having just one client matters: it is also what remembers who is signed in,
// and it attaches that person's login to every request, so the database's
// row-level security knows who is asking.
import { createClient } from '@supabase/supabase-js';

// The project's address and its public "anon" key come from environment
// variables: settings kept in the .env / .env.local file instead of being
// written into the code. Vite only hands variables whose
// name starts with VITE_ to browser code; `import.meta.env` is where Vite
// puts them. Their types are declared in src/vite-env.d.ts.
// The anon key is meant to be public: it only identifies the project. What a
// person may actually see or change is decided by row-level security in the
// database, based on who is signed in.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Stop straight away with a clear message if the settings are missing,
// instead of failing later with a confusing network error.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env variables. Check your .env or .env.local file.');
}

// Note: createClient isn't given generated table types (`npm run gen-types`
// can write them to src/types/supabase.ts), so TypeScript doesn't
// know the shape of database rows. That's why api.ts uses `as Product[]` and
// similar to state the shape itself.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);