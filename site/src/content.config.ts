import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const people = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/people' }),
  schema: z.object({
    name: z.string(),
    title: z.string(), // short role line shown under the name
    kind: z.enum(['faculty', 'member']).default('faculty'), // faculty: profile synced from polito.it
    period: z.string().optional(), // e.g. "2026", shown for members
    photo: z.string().optional(),
    accent: z.string().default('violet'),
    order: z.number().default(99),
    links: z.record(z.string().url()).default({}),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    acronym: z.string().optional(),
    start: z.number(),
    end: z.number().nullable().default(null),
    status: z.enum(['ongoing', 'completed']),
    funder: z.string(),
    partners: z.array(z.string()).default([]),
    website: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    order: z.number().default(0),
  }),
});

const tools = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    platform: z.string(),
    summary: z.string(),
    paper: z.string().url().optional(),
    website: z.string().url().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const recent = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/recent' }),
  schema: z.object({
    title: z.string(),
    kicker: z.string(),
    badge: z.string().optional(),
    color: z.enum(['violet', 'coral', 'cyan', 'yellow', 'lime']).default('violet'),
    link: z.string(),
    linkLabel: z.string().default('Read more'),
    order: z.number().default(0),
  }),
});

export const collections = { people, projects, tools, recent };
