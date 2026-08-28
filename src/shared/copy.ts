export const copy = {
  appName: '家庭手账',
  loading: '正在加载…',
  cachedData: '缓存数据',
  networkRequired: '此操作需要联网，请检查网络后重试',
  invalidAmount: '请输入大于 0 的金额',
  duplicateLater: '稍后处理',
  duplicateKeep: '保留两笔',
  confirmEntry: '确认入账',
  draftReview: '待确认草稿',
  aiReadOnlyNotice: 'AI 只能读取已确认的账本数据，不会自动改账',
  loginExpired: '登录已过期，请重新登录',
  duplicateConflict: '账本存在重复或版本冲突，请回到账目页面处理',
  requestTimeout: '请求超时，请稍后重试',
  aiFailed: 'AI 暂时不可用，请稍后重试',
} as const;

export const AI_CHAT_STORAGE_KEY = 'family-ledger.ai-chat.v1';
