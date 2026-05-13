import 'dotenv/config';
import { db } from './client';
import { settings, nicheLibrary } from './schema';
import { sql } from 'drizzle-orm';

const NICHES = [
  { slug: 'pickleball-humor', label: 'Pickleball humor', defaultStyles: ['typography', 'vintage'],
    promptTemplate: 'Funny pickleball-related quotes and dad-joke style designs for pickleball players' },
  { slug: 'dog-mom', label: 'Dog mom / dog lover', defaultStyles: ['illustration', 'typography'],
    promptTemplate: 'Heartfelt and humorous designs for dog moms, with stylized dog illustrations and quotes' },
  { slug: 'teacher-life', label: 'Teacher life', defaultStyles: ['typography', 'vintage'],
    promptTemplate: 'Relatable quotes about teaching life, classroom humor, and subject-specific puns' },
  { slug: 'nurse-life', label: 'Nurse life', defaultStyles: ['typography', 'illustration'],
    promptTemplate: 'Designs celebrating nurses with humor, RN puns, and stethoscope/medical motifs' },
  { slug: 'coffee-addict', label: 'Coffee addict', defaultStyles: ['typography', 'vintage'],
    promptTemplate: 'Bold, retro-styled coffee-themed quotes and illustrations for caffeine enthusiasts' },
  { slug: 'plant-mom', label: 'Plant parent', defaultStyles: ['illustration'],
    promptTemplate: 'Botanical illustrations and quotes celebrating houseplant collectors' },
  { slug: 'gym-bro', label: 'Gym / weightlifting', defaultStyles: ['vintage', 'typography'],
    promptTemplate: 'Retro-fitness inspired designs with motivational quotes and weightlifting motifs' },
  { slug: 'cat-lover', label: 'Cat lover', defaultStyles: ['illustration', 'typography'],
    promptTemplate: 'Cute and witty cat-themed designs with illustrations and quotes' },
  { slug: 'retro-camping', label: 'Camping / outdoors', defaultStyles: ['vintage', 'illustration'],
    promptTemplate: 'Vintage national-park-style camping and outdoor adventure designs' },
  { slug: 'dad-jokes', label: 'Dad jokes', defaultStyles: ['typography'],
    promptTemplate: 'Classic dad-joke style puns, big bold typography on a t-shirt' },
  { slug: 'book-lover', label: 'Book / reading lover', defaultStyles: ['vintage', 'illustration'],
    promptTemplate: 'Bookish designs celebrating readers, libraries, and reading culture' },
  { slug: 'gardening', label: 'Gardening', defaultStyles: ['illustration', 'vintage'],
    promptTemplate: 'Gardening-themed illustrations and quotes for plant cultivators' },
  { slug: 'fishing', label: 'Fishing', defaultStyles: ['vintage', 'typography'],
    promptTemplate: 'Retro fishing-themed designs with fish illustrations and angler humor' },
  { slug: 'mom-life', label: 'Mom life', defaultStyles: ['typography'],
    promptTemplate: 'Humorous and relatable mom-life quotes, coffee-and-chaos energy' },
  { slug: 'autumn-vibes', label: 'Autumn / fall', defaultStyles: ['vintage', 'illustration'],
    promptTemplate: 'Cozy autumn-themed retro designs: pumpkins, sweater weather, hot drinks' },
];

async function seed() {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  for (const n of NICHES) {
    await db.insert(nicheLibrary).values(n).onConflictDoNothing({ target: nicheLibrary.slug });
  }
  console.log(`Seeded ${NICHES.length} niches and settings row.`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
