// validation.ts: the rules every form's input must follow, written with zod.
//
// zod is a library for describing what valid data looks like. You build a
// "schema" (a list of rules, e.g. "a string, at least 8 characters"), then
// call schema.safeParse(value). It never throws; it returns either
//   { success: true,  data: <the cleaned-up value> }  or
//   { success: false, error: <a list of problems> }.
//
// Who uses it:
//   - src/components/LoginDialog.tsx: loginSchema, signupSchema
//   - src/contexts/AuthContext.tsx: the LoginInput / SignupInput types
//   - src/components/Inventory.tsx: the product, picture, receive-stock and
//     write-off rules, plus fieldErrors()
//   - src/components/POS.tsx: cashReceivedSchema, cardAmountSchema
//
// This is only the app's first line of defence. Supabase and the database
// check everything again, so these rules are about giving people clear,
// early messages, not about security.
import * as z from 'zod';

// ── Sign in / create account ───────────────────────────────────────────────
//
// An email address: spaces around it removed, must not be empty, must look
// like an email, and is turned into lower case (so "Ana@Mail.com" and
// "ana@mail.com" are the same account).
// `.pipe(...)` passes the trimmed text on to a second schema (zod's built-in
// email check). `.transform(...)` changes the value after it passed the checks.
const emailSchema = z
    .string()
    .trim()
    .min(1, { error: 'Email is required' })
    .pipe(z.email({ error: 'Enter a valid email address' }))
    .transform((value) => value.toLowerCase());

// The sign-in form: an email and a password that isn't empty. The password
// rules aren't repeated here, because Supabase decides if it's correct.
export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, { error: 'Password is required' }),
});

// The create-account form. The password must be 8 to 72 characters (72 is
// the most Supabase's sign-in service accepts), and typed the same way twice.
// `.refine(check, {...})` adds a rule of our own that looks at the whole form;
// `path: ['confirmPassword']` shows its message under the "confirm" box.
export const signupSchema = z
    .object({
        email: emailSchema,
        password: z
        .string()
        .min(8, { error: 'Password must be at least 8 characters' })
        .max(72, { error: 'Password must be 72 characters or fewer' }),
        confirmPassword: z.string().min(1, { error: 'Please confirm your password' }),
    })
    .refine((values) => values.password === values.confirmPassword, {
        error: 'Passwords do not match',
        path: ['confirmPassword'],
    });

// TypeScript types worked out FROM the schemas, so they can never disagree.
// `z.infer<typeof loginSchema>` = "the shape of a value that passed
// loginSchema", here { email: string; password: string }.
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;


// ════════════════════════════════════════════════════════════════════════════
// Inventory and checkout rules
//
// Every form checks what was typed against one of these "schemas" before
// anything is sent to the database. A schema lists the rules for each field;
// `schema.safeParse(values)` either says "success" (with cleaned-up values,
// e.g. text turned into numbers and extra spaces trimmed) or returns a list of
// problems, which `fieldErrors()` below turns into one message per field.
//
// The database has its own checks too (e.g. price can't be negative), so even
// a request that skipped these rules couldn't save bad data. These rules are
// the friendly first line: they catch mistakes early and say how to fix them.
// ════════════════════════════════════════════════════════════════════════════

// ── Small building blocks ──────────────────────────────────────────────────

// Form boxes give us text like "12.50" or "" (empty). This turns the text into
// a number, and an empty box into `undefined` so the "required" message shows.
const toNumber = (value: unknown) => {
    if (typeof value === 'string') return value.trim() === '' ? undefined : Number(value);
    return value;
};

// True if the number has at most 2 decimal places (centavos). Done with a
// small tolerance because computers store 19.99 as 19.98999999...
const hasAtMostTwoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

// A peso amount: a real number, at least `min`, at most ₱1,000,000, and no
// more than 2 decimal places.
// It's a function that BUILDS a schema, so each field gets messages with its
// own name in them (`label`, e.g. "Price"). z.preprocess(toNumber, ...) runs
// toNumber on the raw input first, then checks the result with the rules.
// Text that isn't a number (e.g. "abc") becomes NaN, which z.number() refuses.
const pesoAmount = (label: string, min: number) =>
    z.preprocess(
        toNumber,
        z
            .number({ error: `Enter the ${label.toLowerCase()} as a number` })
            .min(min, { error: min > 0 ? `${label} must be more than ₱0` : `${label} can't be negative` })
            .max(1_000_000, { error: `${label} looks too high (max ₱1,000,000)` })
            .refine(hasAtMostTwoDecimals, { error: `${label} can have at most 2 decimal places` }),
    );

// A count of items: a whole number between `min` and `max`.
// `max = 100_000` is a default: used when no third value is passed.
// (The underscore in 100_000 is only there to make the number easier to read.)
const wholeNumber = (label: string, min: number, max = 100_000) =>
    z.preprocess(
        toNumber,
        z
            .number({ error: `Enter the ${label.toLowerCase()} as a number` })
            .int({ error: `${label} must be a whole number` })
            .min(min, { error: `${label} must be at least ${min}` })
            .max(max, { error: `${label} can't be more than ${max.toLocaleString()}` }),
    );

// ── Regular expressions (patterns the text must match) ─────────────────────
// A regular expression is a pattern written between slashes. Common pieces:
//   ^ = start of the text, $ = end of the text (so the WHOLE text must match)
//   [A-Za-z0-9] = one character from this set
//   {1,31} = the thing before it, between 1 and 31 times; * = any number of times
//   the `u` after the last slash turns on Unicode, needed for \p{...}

// SKU: letters, numbers and dashes only, 2–32 characters, starting with a
// letter or number. e.g. "10001", "MLK-1L", "Banana".
// (1 first character + 1 to 31 more = 2 to 32 in total.)
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/;

// Category: starts with a letter or number; then letters, numbers, spaces and
// a few joining characters (& ' . , / ( ) -). e.g. "Fruits & Vegetables".
// \p{L} = any letter (including ñ, é…), \p{N} = any digit.
export const CATEGORY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &'.,/()-]*$/u;

// A product name must contain at least one letter (so "123" or "!!!" is refused).
const HAS_A_LETTER = /\p{L}/u;

// Dates from the date picker (ui/date-picker.tsx) always look like 2026-11-05.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ── Product (Add New Product and Edit) ─────────────────────────────────────

// The rules shared by the Add and Edit forms, kept as a plain object so both
// schemas below can reuse them (`...productFields` copies them in).
// Each text field is trimmed first, so "  Milk " is checked (and handed back
// by safeParse) as "Milk".
// Price must be at least ₱0.01 (nothing is free); cost may be ₱0.
const productFields = {
    sku: z
        .string()
        .trim()
        .min(1, { error: 'Enter a SKU' })
        .regex(SKU_PATTERN, { error: 'SKU: letters, numbers and dashes only (2–32 characters, no spaces)' }),
    name: z
        .string()
        .trim()
        .min(2, { error: 'Enter the product name (at least 2 characters)' })
        .max(100, { error: 'Product name can be at most 100 characters' })
        .regex(HAS_A_LETTER, { error: 'Product name must contain letters' }),
    // Who makes it, e.g. "Bear Brand". Any letters, numbers and symbols
    // (brands like "Jack 'n Jill" or "M.Y. San"), but it must contain a letter.
    brand: z
        .string()
        .trim()
        .min(1, { error: 'Enter the brand' })
        .max(60, { error: 'Brand can be at most 60 characters' })
        .regex(HAS_A_LETTER, { error: 'Brand must contain letters' }),
    category: z
        .string()
        .trim()
        .min(2, { error: 'Pick or type a category' })
        .max(50, { error: 'Category can be at most 50 characters' })
        .regex(CATEGORY_PATTERN, { error: "Category: letters, numbers, spaces and & ' . , / ( ) - only" }),
    price: pesoAmount('Price', 0.01),
    cost: pesoAmount('Cost', 0),
    // The low-stock alert: when the units on hand drop to this number or
    // fewer, Inventory marks the product "Low stock" so it gets reordered.
    reorder_level: wholeNumber('Reorder level', 0),
    // Optional. An empty box becomes `undefined` so it isn't saved as "".
    description: z
        .string()
        .trim()
        .max(300, { error: 'Description can be at most 300 characters' })
        .optional()
        .transform((text) => (text ? text : undefined)),
};

// Adding a product also sets how many are in stock to begin with, and that
// starting stock needs an expiry date, like any delivery. Inventory saves the
// product first, then receives the starting stock as a batch with this date
// (through receive_stock(), the same as the "Receive stock" form).
// The expiry date is only required when there IS starting stock (more than 0):
// a product added with 0 in stock has no batch, so no date to give.
// `isFutureDate` is passed in, as for receiveStockSchema below.
// .superRefine() runs after the fields are checked one by one, and can look at
// several fields together; ctx.addIssue() adds a problem, filed under
// `path` (here the expiry box), just like the field rules do.
export const newProductSchema = (isFutureDate: (date: string) => boolean) =>
    z
        .object({
            ...productFields,
            stock_quantity: wholeNumber('Starting stock', 0),
            expiry_date: z.string().trim(),
        })
        .superRefine((values, ctx) => {
            if (values.stock_quantity <= 0) return;
            const date = values.expiry_date;
            const message = !date
                ? 'Enter the expiry date of the starting stock'
                : !DATE_PATTERN.test(date)
                  ? 'Enter a valid date'
                  : !isFutureDate(date)
                    ? 'Expiry date must be after today (expired stock can’t be added)'
                    : null;
            if (message) ctx.addIssue({ code: 'custom', path: ['expiry_date'], message });
        });

// Editing doesn't change stock (that's done by receiving / writing off batches).
export const editProductSchema = z.object(productFields);

// ── Product picture ────────────────────────────────────────────────────────

// The picture file kinds we accept (as the browser reports them in file.type).
// api.uploadProductImage() names saved files from this same list.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_MB = 5;

// The picture must be a normal photo/graphic file and not too big to upload.
// z.instanceof(File) = "must be a real File object" (what a file input gives).
// file.size is in bytes: 5 × 1024 × 1024 bytes = 5 MB.
export const imageFileSchema = z
    .instanceof(File)
    .refine((file) => IMAGE_TYPES.includes(file.type), { error: 'Picture must be a JPG, PNG, WEBP or GIF file' })
    .refine((file) => file.size <= MAX_IMAGE_MB * 1024 * 1024, {
        error: `Picture must be ${MAX_IMAGE_MB} MB or smaller`,
    });

// ── Receive stock ──────────────────────────────────────────────────────────

// `isFutureDate` comes from lib/expiry (it knows Philippine time). It's passed
// in so this file doesn't need its own date logic.
// (Inventory.tsx builds it with daysUntilExpiry from lib/expiry.) The
// database's receive_stock() refuses the same thing: an expiry date of today
// or earlier, because stock that expires today already counts as expired.
// product_id is checked as text because form dropdowns hold their value as text.
export const receiveStockSchema = (isFutureDate: (date: string) => boolean) =>
    z.object({
        product_id: z.string().min(1, { error: 'Pick a product' }),
        quantity: wholeNumber('Quantity', 1),
        expiry_date: z
            .string()
            .min(1, { error: 'Enter the expiry date' })
            .regex(DATE_PATTERN, { error: 'Enter a valid date' })
            .refine(isFutureDate, { error: 'Expiry date must be after today (expired stock can’t be received)' }),
    });

// ── Write off damaged / spoiled stock ──────────────────────────────────────

// `maxQuantity` is how many units the chosen batch still has, so you can't
// write off more than exists.
// Math.max(1, ...) keeps the upper limit at least 1, so the rule still makes
// sense before a batch is picked (when maxQuantity is 0).
// `kind` must be exactly 'damaged' or 'spoiled' (z.enum = one of a fixed list),
// the same two values the database's write_off_stock() accepts.
export const writeOffSchema = (maxQuantity: number) =>
    z.object({
        product_id: z.string().min(1, { error: 'Pick a product' }),
        batch_id: z.string().min(1, { error: 'Pick the batch to write off' }),
        quantity: wholeNumber('Quantity', 1, Math.max(1, maxQuantity)),
        kind: z.enum(['damaged', 'spoiled'], { error: 'Choose damaged or spoiled' }),
        reason: z
            .string()
            .trim()
            .min(3, { error: 'Write a short reason (at least 3 characters)' })
            .max(200, { error: 'Reason can be at most 200 characters' }),
    });

// ── Cash at checkout ───────────────────────────────────────────────────────

// The cash handed over must cover the total and be a sensible peso amount.
// Unlike the others this checks ONE value (the cash box), not a whole form.
// `cash as number` tells TypeScript the value is a number here; it is,
// because pesoAmount has already turned the text into a number by then.
// The database checks the same thing again (process_pos_checkout).
export const cashReceivedSchema = (amountDue: number) =>
    pesoAmount('Cash received', 0).refine((cash) => (cash as number) >= amountDue, {
        error: `Cash received must be at least ₱${amountDue.toFixed(2)}, or use points for the rest`,
    });

// The POS "Amount to charge on card" box. A card is charged EXACTLY what's
// due (there's no change to hand back), so the amount must match it: less
// is short (enter the full amount or use points), more is overcharging.
// Compared in whole centavos (× 100, rounded) so 99.1 vs 99.10 can't differ
// by a tiny decimal error. Only checked in the browser: the database
// records the order total, and a card amount isn't sent to it.
export const cardAmountSchema = (amountDue: number) =>
    pesoAmount('Card amount', 0)
        .refine((amount) => Math.round((amount as number) * 100) >= Math.round(amountDue * 100), {
            error: `The card amount is short of the ₱${amountDue.toFixed(2)} due. Enter the full amount, or use points for the rest`,
        })
        .refine((amount) => Math.round((amount as number) * 100) <= Math.round(amountDue * 100), {
            error: `A card is charged exactly the amount due: ₱${amountDue.toFixed(2)}`,
        });

// ── Member phone number ────────────────────────────────────────────────────

// Turns what was typed into the stored form: spaces, dashes and brackets
// removed, and +639… turned into 09…: "+63 917 123-4567" -> "09171234567".
// Also used by the POS member search, so a phone typed either way is found.
export function normalizePhone(text: string): string {
    const clean = text.replace(/[\s()-]/g, '');
    return /^\+639\d{9}$/.test(clean) ? `0${clean.slice(3)}` : clean;
}

// A Philippine mobile number (09 + 9 digits, after normalizePhone), or empty
// to remove it. The database (set_member_phone) checks the same.
export const memberPhoneSchema = z
    .string()
    .transform(normalizePhone)
    .refine((phone) => phone === '' || /^09\d{9}$/.test(phone), {
        error: 'Enter a mobile number like 0917 123 4567',
    });

// ── Turning problems into messages ─────────────────────────────────────────

// Turns zod's list of problems into { fieldName: 'first message for it' },
// ready to show under each box. e.g. { price: 'Price must be more than ₱0' }.
// Each issue has a `path` saying where it happened, e.g. ['price']. We use the
// first part as the field name. A problem that isn't tied to a field (empty
// path) is filed under 'form'. If a field has several problems, only the
// first is kept, so each box shows one clear message.
export function fieldErrors(error: z.ZodError): Record<string, string> {
    const messages: Record<string, string> = {};
    for (const issue of error.issues) {
        const field = String(issue.path[0] ?? 'form');
        if (!messages[field]) messages[field] = issue.message;
    }
    return messages;
}
