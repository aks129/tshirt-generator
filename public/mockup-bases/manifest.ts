// IMPORTANT: printArea coords are calibrated to specific image files in this
// directory. If you regenerate any base photo, you MUST re-calibrate its
// coords here. Mis-calibrated coords result in the design being placed off
// the shirt or skewed.
//
// Color taxonomy:
//   light shirts ('white', 'heather'): design composited via multiply (keeps black text)
//   dark shirts  ('black', 'navy', 'charcoal'): design RGB inverted, composited over (paints white text)
// See lib/mockups/compose.ts for the blend logic.

export type MockupBase = {
  id: number;
  file: string;
  color: 'white' | 'black' | 'heather' | 'navy' | 'charcoal';
  style: 'flat-lay' | 'on-model' | 'hanger' | 'folded';
  printArea: { x: number; y: number; w: number; h: number };
  /** Clockwise degrees to rotate the design before compositing, to match a tilted shirt. */
  rotation?: number;
  altText: string;
};

export const MOCKUP_BASES: MockupBase[] = [
  {
    id: 1,
    file: '/mockup-bases/1.png',
    color: 'white',
    style: 'flat-lay',
    // Folded white tee on linen. Shirt tilts ~8° clockwise; visible chest area
    // is the right half of the upper portion.
    printArea: { x: 410, y: 340, w: 260, h: 280 },
    rotation: 8,
    altText: 'White t-shirt folded on linen, top-down view',
  },
  {
    id: 2,
    file: '/mockup-bases/2.png',
    color: 'black',
    style: 'flat-lay',
    // Black tee laid flat on oak wood. Slight clockwise tilt.
    printArea: { x: 330, y: 300, w: 360, h: 370 },
    rotation: 3,
    altText: 'Black t-shirt flat lay on wood, top-down view',
  },
  {
    id: 3,
    file: '/mockup-bases/3.png',
    color: 'white',
    style: 'on-model',
    // Young woman wearing white tee in cafe. Chest area framed center.
    printArea: { x: 370, y: 280, w: 230, h: 270 },
    altText: 'White t-shirt worn by woman in cafe, mid-shot',
  },
  {
    id: 4,
    file: '/mockup-bases/4.png',
    color: 'black',
    style: 'on-model',
    // Young man in black tee against brick wall, turned slightly.
    printArea: { x: 340, y: 320, w: 250, h: 280 },
    altText: 'Black t-shirt worn by model against urban brick',
  },
  {
    id: 5,
    file: '/mockup-bases/5.png',
    color: 'white',
    style: 'hanger',
    // White tee on wooden hanger, hangs slightly off-vertical.
    printArea: { x: 350, y: 300, w: 320, h: 380 },
    rotation: 2,
    altText: 'White t-shirt on wooden hanger',
  },
  {
    id: 6,
    file: '/mockup-bases/6.png',
    color: 'heather',
    style: 'folded',
    // Heather grey folded stack on tan surface. Folded edge runs left side.
    printArea: { x: 320, y: 320, w: 400, h: 370 },
    rotation: 4,
    altText: 'Heather grey t-shirt folded in stack',
  },
  {
    id: 7,
    file: '/mockup-bases/7.png',
    color: 'white',
    style: 'on-model',
    // Young woman in park, body angled slightly. Chest area narrower.
    printArea: { x: 420, y: 280, w: 200, h: 240 },
    altText: 'White t-shirt worn by woman outdoors, casual style',
  },
  {
    id: 8,
    file: '/mockup-bases/8.png',
    color: 'black',
    style: 'on-model',
    // Woman in studio, standing slightly turned right.
    printArea: { x: 380, y: 290, w: 230, h: 260 },
    altText: 'Black t-shirt worn by woman, lifestyle portrait',
  },
];

export const MAX_PHOTOS_TO_UPLOAD = MOCKUP_BASES.length;
