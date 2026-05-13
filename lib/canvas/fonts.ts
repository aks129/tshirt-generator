export type BuiltInFont = {
  name: string;
  family: string;
  url: string;
};

export const BUILT_IN_FONTS: BuiltInFont[] = [
  { name: 'Caveat', family: "'Caveat', cursive", url: 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap' },
  { name: 'Bebas Neue', family: "'Bebas Neue', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  { name: 'Anton', family: "'Anton', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
  { name: 'Bungee', family: "'Bungee', cursive", url: 'https://fonts.googleapis.com/css2?family=Bungee&display=swap' },
  { name: 'Permanent Marker', family: "'Permanent Marker', cursive", url: 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap' },
  { name: 'Playfair Display', family: "'Playfair Display', serif", url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap' },
  { name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap' },
  { name: 'Archivo Black', family: "'Archivo Black', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap' },
  { name: 'Special Elite', family: "'Special Elite', cursive", url: 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap' },
  { name: 'Rubik Mono One', family: "'Rubik Mono One', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Rubik+Mono+One&display=swap' },
];

export const SHIRT_PRESETS: { name: string; value: string }[] = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#1a1a1a' },
  { name: 'Heather Gray', value: '#b8b8b8' },
  { name: 'Navy', value: '#1f2a44' },
  { name: 'Forest', value: '#2d4a36' },
  { name: 'Maroon', value: '#5c1a2b' },
  { name: 'Mustard', value: '#d4a544' },
  { name: 'Dusty Pink', value: '#d9a3a3' },
  { name: 'Cream', value: '#f0e6d2' },
  { name: 'Light Brown', value: '#b88862' },
];

export const SAMPLE_TEXT = `Running on Coffee and Dog Kisses.
I came. I saw. I made it awkward.
Running late is my cardio.
I put the "pro" in procrastinate.
Doing my best (it's not much).
Chaos Coordinator
Unsupervised and thriving
Feral
Gen X and Feral
Slightly Unhinged.
I run on coffee and chaos.
Some days I amaze myself. Other days I lose my phone while holding it.
Surviving, not thriving.
Powered by coffee and tiny humans.
Sorry I'm late, I saw a dog.
Calm but internally screaming.
No F's left.
I'm not lazy, I'm on energy-saving mode.
Low battery, send snacks.
Coffee Beach Repeat`;

export function loadGoogleFont(url: string) {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${url}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = url;
  document.head.appendChild(l);
}

export function preloadAllFonts() {
  BUILT_IN_FONTS.forEach((f) => loadGoogleFont(f.url));
}
