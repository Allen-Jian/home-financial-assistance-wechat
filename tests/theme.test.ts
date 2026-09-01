import { DARK_TOKENS, LIGHT_TOKENS } from '../src/shared/theme';

test('exposes the approved Sunlit light and dark semantic tokens', () => {
  expect(LIGHT_TOKENS).toMatchObject({
    primary: '#2F6F64', background: '#FBF7F0', accent: '#FF9671',
    focus: '#2F6F64', successSurface: '#EAF4F1',
  });
  expect(DARK_TOKENS).toMatchObject({
    primary: '#74C6B2', background: '#101714', accent: '#FF9F7D',
    focus: '#74C6B2', successSurface: '#203C35',
  });
});
