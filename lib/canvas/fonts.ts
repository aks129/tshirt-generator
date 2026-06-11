export type BuiltInFont = {
  name: string;
  family: string;
  url: string;
};

export const BUILT_IN_FONTS: BuiltInFont[] = [
  // Defaults / typewriter
  { name: 'Special Elite', family: "'Special Elite', cursive", url: 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap' },
  // Bold display sans (top sellers)
  { name: 'Anton', family: "'Anton', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
  { name: 'Archivo Black', family: "'Archivo Black', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap' },
  { name: 'Bebas Neue', family: "'Bebas Neue', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  { name: 'Oswald', family: "'Oswald', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap' },
  { name: 'Staatliches', family: "'Staatliches', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Staatliches&display=swap' },
  { name: 'Russo One', family: "'Russo One', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Russo+One&display=swap' },
  { name: 'Righteous', family: "'Righteous', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Righteous&display=swap' },
  { name: 'Rubik Mono One', family: "'Rubik Mono One', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Rubik+Mono+One&display=swap' },
  { name: 'Six Caps', family: "'Six Caps', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Six+Caps&display=swap' },
  // Heavy / display
  { name: 'Bowlby One', family: "'Bowlby One', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Bowlby+One&display=swap' },
  { name: 'Bagel Fat One', family: "'Bagel Fat One', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Bagel+Fat+One&display=swap' },
  { name: 'Lilita One', family: "'Lilita One', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap' },
  { name: 'Black Ops One', family: "'Black Ops One', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Black+Ops+One&display=swap' },
  { name: 'Bungee', family: "'Bungee', cursive", url: 'https://fonts.googleapis.com/css2?family=Bungee&display=swap' },
  // Comic / playful
  { name: 'Bangers', family: "'Bangers', cursive", url: 'https://fonts.googleapis.com/css2?family=Bangers&display=swap' },
  { name: 'Permanent Marker', family: "'Permanent Marker', cursive", url: 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap' },
  { name: 'Cabin Sketch', family: "'Cabin Sketch', cursive", url: 'https://fonts.googleapis.com/css2?family=Cabin+Sketch:wght@400;700&display=swap' },
  // Slab serif
  { name: 'Alfa Slab One', family: "'Alfa Slab One', serif", url: 'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap' },
  { name: 'Patua One', family: "'Patua One', serif", url: 'https://fonts.googleapis.com/css2?family=Patua+One&display=swap' },
  // Display serif
  { name: 'Playfair Display', family: "'Playfair Display', serif", url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap' },
  { name: 'Abril Fatface', family: "'Abril Fatface', serif", url: 'https://fonts.googleapis.com/css2?family=Abril+Fatface&display=swap' },
  // Script / cursive
  { name: 'Caveat', family: "'Caveat', cursive", url: 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap' },
  { name: 'Lobster', family: "'Lobster', cursive", url: 'https://fonts.googleapis.com/css2?family=Lobster&display=swap' },
  { name: 'Pacifico', family: "'Pacifico', cursive", url: 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap' },
  // Monospace / techy
  { name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap' },
  { name: 'Audiowide', family: "'Audiowide', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Audiowide&display=swap' },
  { name: 'Press Start 2P', family: "'Press Start 2P', monospace", url: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap' },
  { name: 'Monoton', family: "'Monoton', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Monoton&display=swap' },
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
