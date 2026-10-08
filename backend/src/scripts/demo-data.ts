/**
 * Deterministic building blocks for the demo seed: a seeded PRNG, Indian names, and phone numbers that are
 * stable across runs (so the documented demo logins never change).
 */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

const BOYS = ['Aarav', 'Vihaan', 'Arjun', 'Reyansh', 'Ishaan', 'Kabir', 'Advik', 'Ayaan', 'Dhruv', 'Krishna', 'Rudra', 'Shaurya', 'Atharv', 'Vivaan', 'Aditya', 'Arnav', 'Yash', 'Pranav', 'Rohan', 'Kartik', 'Siddharth', 'Harsh', 'Manav', 'Laksh', 'Dev'] as const;
const GIRLS = ['Ananya', 'Aadhya', 'Diya', 'Saanvi', 'Myra', 'Kiara', 'Ira', 'Anika', 'Riya', 'Navya', 'Pari', 'Avni', 'Kavya', 'Tanvi', 'Ishita', 'Sara', 'Meera', 'Nisha', 'Pooja', 'Shreya', 'Aditi', 'Khushi', 'Prisha', 'Vanya', 'Jiya'] as const;
const MEN = ['Rajesh', 'Sanjay', 'Amit', 'Vikas', 'Manoj', 'Sunil', 'Rakesh', 'Deepak', 'Ajay', 'Pankaj', 'Naveen', 'Alok', 'Gaurav', 'Rahul', 'Vinod', 'Ashok', 'Mukesh', 'Anil', 'Sandeep', 'Ravi'] as const;
const WOMEN = ['Sunita', 'Neha', 'Priya', 'Anjali', 'Kavita', 'Rekha', 'Seema', 'Pooja', 'Meenakshi', 'Asha', 'Ritu', 'Swati', 'Nidhi', 'Shalini', 'Geeta', 'Archana', 'Mamta', 'Sarita', 'Usha', 'Vandana'] as const;
const SURNAMES = ['Sharma', 'Verma', 'Gupta', 'Agarwal', 'Jain', 'Singh', 'Chauhan', 'Tyagi', 'Goel', 'Mittal', 'Bansal', 'Rastogi', 'Saxena', 'Mishra', 'Pandey', 'Yadav', 'Rawat', 'Tomar', 'Kumar', 'Malik', 'Chaudhary', 'Garg', 'Arora', 'Kapoor'] as const;

export function childName(r: Rng, surname: string) {
  const male = r.chance(0.52);
  return { name: `${r.pick(male ? BOYS : GIRLS)} ${surname}`, gender: (male ? 'male' : 'female') as 'male' | 'female' };
}
export function adultName(r: Rng, surname = r.pick(SURNAMES)) {
  const male = r.chance(0.5);
  return { name: `${r.pick(male ? MEN : WOMEN)} ${surname}`, gender: (male ? 'male' : 'female') as 'male' | 'female' };
}
export const surname = (r: Rng) => r.pick(SURNAMES);

/**
 * +91 9 T R NNNNNNN — T = tenant (1 school, 2 college, 3 coaching), R = role group, N = sequence.
 * Role groups: 0 owner/admin, 1 staff, 2 guardians, 3 students.
 */
export const demoPhone = (tenant: 1 | 2 | 3, group: 0 | 1 | 2 | 3, seq: number) => `+919${tenant}${group}${String(seq).padStart(7, '0')}`;

/** Monday–Saturday school days before `from` (most recent first). */
export function schoolDays(from: Date, count: number) {
  const out: string[] = [];
  const d = new Date(from);
  while (out.length < count) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
