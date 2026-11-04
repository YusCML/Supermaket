/// <reference types="vite/client" />

// vite-env.d.ts: type information only, no code that runs.
//
// A ".d.ts" file only DESCRIBES types to TypeScript. The triple-slash line at
// the very top (it only works above all code, so keep it there) loads Vite's
// own type descriptions, e.g. so that `import.meta.env` and importing .css or
// .svg files are understood.
//
// The two interfaces below add OUR settings to that description. Vite reads
// them from the .env / .env.local file when the app starts (only names that
// begin with VITE_ reach the browser). Because they're declared here,
// src/lib/supabase.ts can write import.meta.env.VITE_SUPABASE_URL and
// TypeScript knows it's a string; a typo in the name would be flagged.
//
// The settings found in import.meta.env. `readonly` = code can't change them.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

// `import.meta` is an object JavaScript gives every file; Vite adds `env` to
// it. Declaring an interface with the same name as an existing one MERGES
// into it, so this adds our typed `env` instead of replacing anything.
interface ImportMeta {
  readonly env: ImportMetaEnv;
}