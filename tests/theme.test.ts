import { DARK_TOKENS, LIGHT_TOKENS } from '../src/shared/theme';

test('exposes the confirmed J light and dark tokens', () => {
  expect(LIGHT_TOKENS.primary).toBe('#155EEF');
  expect(LIGHT_TOKENS.background).toBe('#F3F7FF');
  expect(DARK_TOKENS.background).toBe('#0B1220');
  expect(DARK_TOKENS.primary).toBe('#5B9CFF');
});
