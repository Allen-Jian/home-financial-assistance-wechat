export interface AppConfig {
  apiBaseUrl: string;
  mockAuth: boolean;
}

export type ConfigEnv = {
  API_BASE_URL?: string;
  MOCK_AUTH?: string;
  WECHAT_APP_ID?: string;
  NODE_ENV?: string;
};

export function getAppConfig(env: ConfigEnv): AppConfig {
  const apiBaseUrl = env.API_BASE_URL?.trim();
  if (!apiBaseUrl) throw new Error('API_BASE_URL is required');

  const mockAuth = env.MOCK_AUTH === undefined
    ? !env.WECHAT_APP_ID
    : env.MOCK_AUTH.toLowerCase() === 'true';
  if (env.NODE_ENV === 'production' && mockAuth) {
    throw new Error('Mock auth is not allowed in production');
  }
  return { apiBaseUrl, mockAuth };
}
