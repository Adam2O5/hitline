const SHORT_MAX = 3;

const WORDS = [
  // PL
  'kurwa', 'kurwy', 'kurew', 'kurwi', 'chuj', 'huj', 'jeba', 'jebi', 'jebn', 'jebc', 'pierdol', 'pierdal',
  'pizda', 'pizdy', 'cipa', 'cipk', 'kutas', 'fiut', 'dziwka', 'szmata', 'pedal', 'ciota', 'skurwysyn',
  'zjeb', 'cwel', 'suka', 'dupek', 'gowno',
  // EN
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard',
  'hitler', 'nazi', 'porn', 'penis', 'vagina', 'asshole', 'bastard', 'wank', 'twat', 'ass', 'fag', 'cum', 'kys',
];

const SUBSTITUTIONS: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', 'ł': 'l',
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[013457@$ł]/g, c => SUBSTITUTIONS[c])
    .replace(/[\s_\-.]/g, '');
}

const normalized = WORDS.map(normalizeName);
const short = new Set(normalized.filter(w => w.length <= SHORT_MAX));
const long = normalized.filter(w => w.length > SHORT_MAX);

export function isBlockedName(name: string): boolean {
  const n = normalizeName(name);
  return short.has(n) || long.some(w => n.includes(w));
}
