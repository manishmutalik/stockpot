import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const { withLocalSettings } = createRequire(import.meta.url)('../../../app.config.js') as {
  withLocalSettings: (config: Record<string, any>, local: { hasGoogleServices: boolean; projectId?: string }) => Record<string, any>;
};

const base = { name: 'Stockpot Quick', android: { package: 'com.stockpot.quick' }, plugins: ['expo-router'] };

describe('app.config.js', () => {
  it('leaves app.json exactly as it is when there is no local setup', () => {
    expect(withLocalSettings(base, { hasGoogleServices: false })).toEqual(base);
    expect(withLocalSettings(base, { hasGoogleServices: false, projectId: '   ' })).toEqual(base);
  });

  it('points Android at google-services.json when the file is there, keeping the rest of android', () => {
    const out = withLocalSettings(base, { hasGoogleServices: true });
    expect(out.android).toEqual({ package: 'com.stockpot.quick', googleServicesFile: './google-services.json' });
    expect(out.extra).toBeUndefined();
  });

  it('adds the Expo project id the push service needs, keeping other extra settings', () => {
    const out = withLocalSettings({ ...base, extra: { router: {}, eas: { other: 1 } } }, { hasGoogleServices: false, projectId: ' abc-123 ' });
    expect(out.extra).toEqual({ router: {}, eas: { other: 1, projectId: 'abc-123' } });
    expect(out.android).toEqual(base.android);
  });

  it('does not change the config it was given', () => {
    const copy = JSON.parse(JSON.stringify(base));
    withLocalSettings(base, { hasGoogleServices: true, projectId: 'x' });
    expect(base).toEqual(copy);
  });
});
