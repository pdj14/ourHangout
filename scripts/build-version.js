const { execFileSync } = require('child_process');
const path = require('path');

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const MAX_DAILY_BUILD_INDEX = 99;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getSeoulDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return {
    year: String(map.year || ''),
    month: String(map.month || ''),
    day: String(map.day || ''),
  };
}

function toDateKey(parts) {
  return `${parts.year}${parts.month}${parts.day}`;
}

function toDayWindow(parts) {
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    since: `${day}T00:00:00+09:00`,
    until: `${day}T23:59:59+09:00`,
  };
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function clampBuildIndex(value) {
  const parsed = parsePositiveInteger(value);
  if (!parsed) return 1;
  return Math.min(parsed, MAX_DAILY_BUILD_INDEX);
}

function getDailyCommitIndex(rootDir, parts) {
  try {
    const { since, until } = toDayWindow(parts);
    const output = execFileSync(
      'git',
      ['rev-list', '--count', `--since=${since}`, `--until=${until}`, 'HEAD'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim();
    return clampBuildIndex(output);
  } catch {
    return 1;
  }
}

function parseExplicitVersion(explicitVersion) {
  const raw = String(explicitVersion || '').trim();
  if (!raw) return null;
  const match = /^(\d{8})_(\d{1,2})$/.exec(raw);
  if (!match) return null;
  const dateKey = match[1];
  const buildIndex = clampBuildIndex(match[2]);
  return {
    dateKey,
    buildIndex,
    versionName: `${dateKey}_${buildIndex}`,
    versionCode: Number(dateKey) * 100 + buildIndex,
  };
}

function getBuildVersionInfo(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const explicit = parseExplicitVersion(options.explicitVersion || process.env.OH_BUILD_VERSION);
  if (explicit) {
    return {
      ...explicit,
      source: 'env:OH_BUILD_VERSION',
      timeZone: SEOUL_TIME_ZONE,
    };
  }

  const parts = getSeoulDateParts(options.now || new Date());
  const dateKey = toDateKey(parts);
  const buildIndex = clampBuildIndex(
    options.explicitIndex || process.env.OH_BUILD_INDEX || getDailyCommitIndex(rootDir, parts)
  );

  return {
    dateKey,
    buildIndex,
    versionName: `${dateKey}_${buildIndex}`,
    versionCode: Number(dateKey) * 100 + buildIndex,
    source: options.explicitIndex || process.env.OH_BUILD_INDEX ? 'env:OH_BUILD_INDEX' : 'git-daily-commit-count',
    timeZone: SEOUL_TIME_ZONE,
  };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(getBuildVersionInfo())}\n`);
}

module.exports = {
  getBuildVersionInfo,
};
