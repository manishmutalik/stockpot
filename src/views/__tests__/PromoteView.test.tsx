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
const promoter = (over: Partial<Promoter> = {}): Promoter => ({ remaining: 15, promote: vi.fn().mockResolvedValue({ ok: true, result }), styling: null, ...over });
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

  describe('Style with AI', () => {
    const withStyling = (style = vi.fn(), left: number | null = 3) => promoter({ styling: { left, style } });
    const done = async (p: Promoter) => {
      const { container } = render(<PromoteView promoter={p} aiBlocked={null} businessName="Food Haven" />);
      pick(container);
      await screen.findByDisplayValue('Rich and creamy. DM to order!');
    };
    const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

    it('is not offered when the server has none', async () => {
      await done(promoter());
      expect(screen.queryByRole('group', { name: 'Style with AI' })).toBeNull();
    });

    it('styles the photo in the shape chosen, and going back to one already made costs nothing', async () => {
      const style = vi.fn()
        .mockResolvedValueOnce({ ok: true, result: { image: 'cnVzdGlj', width: 768, height: 1024, stylesLeft: 2 } })
        .mockResolvedValueOnce({ ok: true, result: { image: 'Y2FmZQ', width: 768, height: 1024, stylesLeft: 1 } });
      await done(withStyling(style));
      expect(screen.getByText('(3 left this month)')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Story/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Rustic table' }));
      await waitFor(() => expect(pressed('Rustic table')).toBe('true'));
      expect(style).toHaveBeenLastCalledWith('aW1n', 'rustic', 'story');
      fireEvent.click(screen.getByRole('button', { name: 'Café' }));
      await waitFor(() => expect(pressed('Café')).toBe('true'));
      fireEvent.click(screen.getByRole('button', { name: 'Rustic table' }));
      fireEvent.click(screen.getByRole('button', { name: 'As taken' }));
      expect(pressed('As taken')).toBe('true');
      expect(style).toHaveBeenCalledTimes(2);
    });

    it('says why a photo could not be styled, and keeps it as it was', async () => {
      await done(withStyling(vi.fn().mockResolvedValue({ ok: false, message: 'You have styled all 8 photos for this month.' })));
      fireEvent.click(screen.getByRole('button', { name: 'Festive' }));
      expect(await screen.findByText(/all 8 photos for this month/)).toBeTruthy();
      expect(pressed('As taken')).toBe('true');
    });

    it('turns the styles off when none are left this month', async () => {
      await done(withStyling(vi.fn(), 0));
      expect((screen.getByRole('button', { name: 'Café' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'As taken' }) as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
