import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromoteView } from '../PromoteView';
import type { Promoter } from '../../hooks/usePromote';
import type { PromoteResult } from '../../utils/promote';

vi.mock('../../hooks/usePromote', () => ({
  cropToShape: vi.fn(async (_image: string, shape: { id: string }) => new File(['x'], `promote-${shape.id}.jpg`, { type: 'image/jpeg' })),
}));
const share = vi.fn();
vi.mock('../../utils/shareFile', () => ({ saveFile: vi.fn(), shareFileViaSystem: (...args: unknown[]) => share(...args) }));

const result: PromoteResult = {
  image: 'aW1n', width: 2048, height: 1536, remaining: 14, orderLine: 'Order on WhatsApp: 98765 43210',
  reading: { isFood: true, menuItemId: 'm1', dishName: 'Butter Chicken', focus: { x: 0.5, y: 0.5 }, caption: 'Rich and creamy. DM to order!', hashtags: ['#butterchicken', '#indianfood', '#punefoodie'] },
};
const promoter = (over: Partial<Promoter> = {}): Promoter => ({ remaining: 15, promote: vi.fn().mockResolvedValue({ ok: true, result }), backgrounds: null, ...over });
const pick = (container: HTMLElement) => {
  const input = container.querySelector('input[capture]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['photo'], 'dish.jpg', { type: 'image/jpeg' })] } });
};

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  share.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('PromoteView', () => {
  it('says why it is not available, when the owner can do something about it', () => {
    render(<PromoteView promoter={null} aiBlocked="AI features need an active plan." businessName="Food Haven" />);
    expect(screen.getByText('AI features need an active plan.')).toBeTruthy();
    expect(screen.queryByText('Take a photo')).toBeNull();
  });

  it('sends a photo in the chosen language, then shows the caption, hashtags and how to order', async () => {
    const p = promoter();
    const { container } = render(<PromoteView promoter={p} aiBlocked={null} businessName="Food Haven" />);
    expect(screen.getByText(/15 left today/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hinglish' }));
    pick(container);
    await screen.findByDisplayValue('Rich and creamy. DM to order!');
    expect(p.promote).toHaveBeenCalledWith(expect.any(File), 'hinglish');
    expect(screen.getByRole('button', { name: '#butterchicken' })).toBeTruthy();
    expect(screen.getByText(/Order on WhatsApp: 98765 43210/)).toBeTruthy();
    expect(screen.getByText('Butter Chicken')).toBeTruthy();
  });

  it('shares the cropped photo with the caption, the order line and the hashtags still chosen', async () => {
    share.mockResolvedValue('shared');
    const { container } = render(<PromoteView promoter={promoter()} aiBlocked={null} businessName="Food Haven" />);
    pick(container);
    await screen.findByDisplayValue('Rich and creamy. DM to order!');
    fireEvent.click(screen.getByRole('button', { name: '#indianfood' }));
    fireEvent.change(screen.getByDisplayValue('Rich and creamy. DM to order!'), { target: { value: 'Made fresh today.' } });
    fireEvent.click(screen.getByRole('button', { name: /Story/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: /^Share$/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /^Share$/ }));
    const text = 'Made fresh today.\n\nOrder on WhatsApp: 98765 43210\n\n#butterchicken #punefoodie';
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(text);
    const [file, sharedText] = share.mock.calls[0];
    expect((file as File).name).toBe('promote-story.jpg');
    expect(sharedText).toBe(text);
    expect(await screen.findByText(/Caption copied too/)).toBeTruthy();
  });

  it('can leave out how to order', async () => {
    const { container } = render(<PromoteView promoter={promoter()} aiBlocked={null} businessName="Food Haven" />);
    pick(container);
    await screen.findByDisplayValue('Rich and creamy. DM to order!');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Copy caption/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Rich and creamy. DM to order!\n\n#butterchicken #indianfood #punefoodie'));
  });

  it('shows what went wrong, and can try the same photo again', async () => {
    const p = promoter({ promote: vi.fn().mockResolvedValueOnce({ ok: false, message: 'You have used all of today\'s AI requests.' }).mockResolvedValueOnce({ ok: true, result }) });
    const { container } = render(<PromoteView promoter={p} aiBlocked={null} businessName="Food Haven" />);
    pick(container);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Try this photo again/ }));
    await screen.findByDisplayValue('Rich and creamy. DM to order!');
    expect(p.promote).toHaveBeenCalledTimes(2);
  });

  it('warns when the photo does not look like food', async () => {
    const p = promoter({ promote: vi.fn().mockResolvedValue({ ok: true, result: { ...result, reading: { ...result.reading, isFood: false } } }) });
    const { container } = render(<PromoteView promoter={p} aiBlocked={null} businessName="Food Haven" />);
    pick(container);
    expect(await screen.findByText(/does not look like food/)).toBeTruthy();
  });

  describe('backgrounds', () => {
    const withBackgrounds = (place = vi.fn(), scenesLeft: number | null = 3) => promoter({ backgrounds: { scenesLeft, place } });
    const done = async (p: Promoter) => {
      const { container } = render(<PromoteView promoter={p} aiBlocked={null} businessName="Food Haven" />);
      pick(container);
      await screen.findByDisplayValue('Rich and creamy. DM to order!');
    };

    it('are not offered when the server has none', async () => {
      await done(promoter());
      expect(screen.queryByRole('group', { name: 'Background' })).toBeNull();
    });

    it('cut the food out once: the mask from the first is sent with the next, and going back costs nothing', async () => {
      const place = vi.fn()
        .mockResolvedValueOnce({ ok: true, result: { image: 'c2FnZQ', width: 2048, height: 1536, mask: 'bWFzaw' } })
        .mockResolvedValueOnce({ ok: true, result: { image: 'd29vZA', width: 2048, height: 1536, scenesLeft: 2 } });
      await done(withBackgrounds(place));
      expect(screen.getByText('(3 left this month)')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Sage' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Sage' }).getAttribute('aria-pressed')).toBe('true'));
      expect(place).toHaveBeenLastCalledWith('aW1n', null, 'sage');
      fireEvent.click(screen.getByRole('button', { name: 'Wooden table' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Wooden table' }).getAttribute('aria-pressed')).toBe('true'));
      expect(place).toHaveBeenLastCalledWith('aW1n', 'bWFzaw', 'wood');
      fireEvent.click(screen.getByRole('button', { name: 'Sage' }));
      fireEvent.click(screen.getByRole('button', { name: 'As taken' }));
      expect(screen.getByRole('button', { name: 'As taken' }).getAttribute('aria-pressed')).toBe('true');
      expect(place).toHaveBeenCalledTimes(2);
    });

    it('says why a background could not be made, and keeps the photo as it was', async () => {
      const place = vi.fn().mockResolvedValue({ ok: false, message: 'You have made all 8 AI backgrounds for this month.' });
      await done(withBackgrounds(place));
      fireEvent.click(screen.getByRole('button', { name: 'Festive' }));
      expect(await screen.findByText(/all 8 AI backgrounds/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'As taken' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('turns the AI scenes off when none are left this month, but not the plain ones', async () => {
      await done(withBackgrounds(vi.fn(), 0));
      expect((screen.getByRole('button', { name: 'Café' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Cream' }) as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
