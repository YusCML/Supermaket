import * as z from 'zod';

const emailSchema = z
    .string()
    .trim()
    .min(1, { error: 'Email is required' })
    .pipe(z.email({ error: 'Enter a valid email address' }))
    .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, { error: 'Password is required' }),
});

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

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;