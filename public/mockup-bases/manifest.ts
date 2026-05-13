// IMPORTANT: printArea coords are calibrated to specific image files in this
// directory. If you regenerate any base photo, you MUST re-calibrate its
// coords here. Mis-calibrated coords result in the design being placed off
// the shirt or skewed.

export type MockupBase = {
  id: number;
  file: string;
  color: 'white' | 'black' | 'heather';
  style: 'flat-lay' | 'on-model' | 'hanger' | 'folded';
  printArea: { x: number; y: number; w: number; h: number };
  rotation?: number;
  altText: string;
};

export const MOCKUP_BASES: MockupBase[] = [
  {
    id: 1,
    file: '/mockup-bases/1.png',
    color: 'white',
    style: 'flat-lay',
    printArea: { x: 720, y: 580, w: 600, h: 720 },
    altText: 'White t-shirt flat lay, top-down view',
  },
  {
    id: 2,
    file: '/mockup-bases/2.png',
    color: 'black',
    style: 'flat-lay',
    printArea: { x: 720, y: 580, w: 600, h: 720 },
    altText: 'Black t-shirt flat lay, top-down view',
  },
  {
    id: 3,
    file: '/mockup-bases/3.png',
    color: 'white',
    style: 'on-model',
    printArea: { x: 820, y: 720, w: 400, h: 480 },
    altText: 'White t-shirt worn by model in coffee shop',
  },
  {
    id: 4,
    file: '/mockup-bases/4.png',
    color: 'black',
    style: 'on-model',
    printArea: { x: 820, y: 720, w: 400, h: 480 },
    altText: 'Black t-shirt worn by model against urban brick',
  },
  {
    id: 5,
    file: '/mockup-bases/5.png',
    color: 'white',
    style: 'hanger',
    printArea: { x: 770, y: 700, w: 520, h: 620 },
    altText: 'White t-shirt on wooden hanger',
  },
  {
    id: 6,
    file: '/mockup-bases/6.png',
    color: 'heather',
    style: 'folded',
    printArea: { x: 720, y: 700, w: 600, h: 540 },
    altText: 'Heather grey t-shirt folded in stack',
  },
];

export const MAX_PHOTOS_TO_UPLOAD = MOCKUP_BASES.length;
