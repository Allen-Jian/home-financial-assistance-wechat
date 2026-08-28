import { getAppConfig } from '../src/shared/config';

test('uses a safe mock configuration when no AppID exists', () => {
  expect(getAppConfig({ API_BASE_URL: 'https://ledger-api.test/v1' })).toEqual({
    apiBaseUrl: 'https://ledger-api.test/v1',
    mockAuth: true,
  });
});
