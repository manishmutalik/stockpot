import { describe, expect, it } from 'vitest';
import {
  cleanHashtag, cropRect, orderLine, postText, PROMOTE_CAPTION_MAX, PROMOTE_MAX_HASHTAGS, PROMOTE_SHAPES, shapeOf,
  validatePromoteReading,
} from '../promote';

const good = {
  isFood: true, menuItemId: 'm1', dishName: 'Butter Chicken', focusX: 0.4, focusY: 0.6,
  caption: 'Slow-cooked, creamy and rich.\nOur butter chicken is ready for your dinner tonight. DM to order!',
  hashtags: ['#butterchicken', 'indianfood', '#Pune Foodie', '#homechef'],
};

describe('cropRect', () => {
  it('takes the whole height of a landscape photo for a portrait post, centred on the food', () => {
    expect(cropRect(2048, 1536, shapeOf('post'), { x: 0.5, y: 0.5 })).toEqual({ x: 410, y: 0, width: 1229, height: 1536 });
  });

  it('moves the crop towards the food but never past the edge', () => {
    expect(cropRect(2048, 1536, shapeOf('post'), { x: 0, y: 0.5 }).x).toBe(0);
    expect(cropRect(2048, 1536, shapeOf('post'), { x: 1, y: 0.5 }).x).toBe(2048 - 1229);
    expect(cropRect(1536, 2048, shapeOf('square'), { x: 0.5, y: 0.9 })).toEqual({ x: 0, y: 512, width: 1536, height: 1536 });
  });

  it('keeps every shape inside the photo, whatever the focus', () => {
    for (const shape of PROMOTE_SHAPES) {
      for (const focus of [{ x: -1, y: 2 }, { x: NaN, y: 0.3 }, { x: 0.5, y: 0.5 }]) {
        const r = cropRect(1200, 1600, shape, focus);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(1200);
        expect(r.y + r.height).toBeLessThanOrEqual(1600);
        expect(r.width / r.height).toBeCloseTo(shape.width / shape.height, 2);
      }
    }
  });
});

describe('the text to post', () => {
  it('says how to order only when there is a real number', () => {
    expect(orderLine(' 98765 43210 ')).toBe('Order on WhatsApp: 98765 43210');
    expect(orderLine('')).toBeNull();
    expect(orderLine('call us')).toBeNull();
    expect(orderLine(undefined)).toBeNull();
  });

  it('puts the caption, how to order and the hashtags in that order', () => {
    expect(postText(' Fresh today. ', ['#cake', '#bakery'], 'Order on WhatsApp: 98765 43210'))
      .toBe('Fresh today.\n\nOrder on WhatsApp: 98765 43210\n\n#cake #bakery');
    expect(postText('Fresh today.', [], null)).toBe('Fresh today.');
  });
});

describe('cleanHashtag', () => {
  it('makes one hashtag of what the model wrote, or nothing', () => {
    expect(cleanHashtag('##Pune Foodie!')).toBe('#PuneFoodie');
    expect(cleanHashtag('घरकाखाना')).toBe('#घरकाखाना');
    expect(cleanHashtag('#')).toBeNull();
    expect(cleanHashtag('a')).toBeNull();
  });
});

describe('validatePromoteReading', () => {
  const menuIds = ['m1', 'm2'];

  it('accepts a good answer, and tidies its hashtags', () => {
    const v = validatePromoteReading(good, { menuIds });
    expect(v.ok).toBe(true);
    if (v.ok !== true) return;
    expect(v.reading).toMatchObject({ menuItemId: 'm1', dishName: 'Butter Chicken', focus: { x: 0.4, y: 0.6 } });
    expect(v.reading.hashtags).toEqual(['#butterchicken', '#indianfood', '#PuneFoodie', '#homechef']);
  });

  it('drops repeated hashtags and keeps at most the maximum', () => {
    const many = Array.from({ length: 25 }, (_, i) => `#tag${i}`);
    const v = validatePromoteReading({ ...good, hashtags: ['#Cake', '#cake', ...many] }, { menuIds });
    expect(v.ok === true && v.reading.hashtags.length).toBe(PROMOTE_MAX_HASHTAGS);
    expect(v.ok === true && v.reading.hashtags.filter(t => t.toLowerCase() === '#cake').length).toBe(1);
  });

  it('takes an empty menu id as none', () => {
    const v = validatePromoteReading({ ...good, menuItemId: '' }, { menuIds });
    expect(v.ok === true && v.reading.menuItemId).toBeNull();
  });

  it('refuses a menu id that was not sent, a focus outside the photo, and too few hashtags', () => {
    const v = validatePromoteReading({ ...good, menuItemId: 'other', focusX: 1.4, hashtags: ['#a1'] }, { menuIds });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problems).toEqual([
      expect.stringMatching(/menuItemId/), expect.stringMatching(/focusX/), expect.stringMatching(/at least 3 hashtags/),
    ]);
  });

  it('refuses hashtags or a phone number in the caption, and a caption that is empty or too long', () => {
    const problems = (caption: string) => { const v = validatePromoteReading({ ...good, caption }, { menuIds }); return v.ok === false ? v.problems : []; };
    expect(problems('Fresh today #cake')).toEqual([expect.stringMatching(/hashtags/)]);
    expect(problems('Call 98765 43210 to order')).toEqual([expect.stringMatching(/phone number/)]);
    expect(problems('  ')).toEqual([expect.stringMatching(/empty/)]);
    expect(problems('a'.repeat(PROMOTE_CAPTION_MAX + 1))).toEqual([expect.stringMatching(/longer/)]);
  });

  it('refuses something that is not an answer', () => {
    expect(validatePromoteReading(null, { menuIds }).ok).toBe(false);
    expect(validatePromoteReading([good], { menuIds }).ok).toBe(false);
    expect(validatePromoteReading({ ...good, isFood: 'yes' }, { menuIds }).ok).toBe(false);
  });
});
