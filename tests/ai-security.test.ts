import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

test('does not track production credentials or prompt logging in frontend source', () => {
  const repo = join(dirname(__dirname));
  const tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const source = tracked.filter((file) => /\.(ts|js|json|wxml|wxss)$/.test(file) && !file.startsWith('tests/'));
  const forbidden = /(MINIMAX_API_KEY\s*[:=]|WECHAT_APP_SECRET\s*[:=]|DATABASE_URL\s*[:=]|console\.log\([^\n]*(prompt|raw|token|secret))/i;
  for (const file of source) expect(readFileSync(join(repo, file), 'utf8')).not.toMatch(forbidden);
});
