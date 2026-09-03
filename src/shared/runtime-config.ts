import type { ConfigEnv } from './config';

// AppID and API URLs are public client configuration. Secrets stay on the API host.
export const runtimeConfig: ConfigEnv = {
  API_BASE_URL: 'https://ledger-api.allenjian.fun/v1',
  WECHAT_APP_ID: 'wxff77e75108c26871',
  MOCK_AUTH: 'false',
  NODE_ENV: 'production',
};
