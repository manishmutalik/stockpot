import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Plus } from 'lucide-react';
import { ModalShell } from '../ModalShell';
import { ConfirmDialog } from '../ConfirmDialog';

// Overlays inside the app tree share a stacking context with the fixed mobile
// bottom nav, so they must out-rank it or their pinned footers are untappable.
const zOf = (className: string) => Number(/(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?=\s|$)/.exec(className)?.slice(1).find(Boolean));

describe('overlay stacking', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const navZ = zOf(/<nav className="(fixed bottom-0[^"]*)"/.exec(appSource)![1]);

  it('ModalShell sits above the mobile bottom nav', () => {
    const { container } = render(
      <ModalShell title="t" subtitle="s" icon={Plus} onClose={() => {}} footer={<button>Go</button>}>x</ModalShell>
    );
    expect(zOf((container.firstElementChild as HTMLElement).className)).toBeGreaterThan(navZ);
  });

  it('ConfirmDialog sits above ModalShell so it can open on top of a modal', () => {
    const shell = render(
      <ModalShell title="t" subtitle="s" icon={Plus} onClose={() => {}} footer={null}>x</ModalShell>
    );
    const shellZ = zOf((shell.container.firstElementChild as HTMLElement).className);
    const confirm = render(<ConfirmDialog type="alert" title="t" message="m" onClose={() => {}} />);
    expect(zOf((confirm.container.firstElementChild as HTMLElement).className)).toBeGreaterThan(shellZ);
  });
});
