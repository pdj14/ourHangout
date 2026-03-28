const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const MAX_DAILY_BUILD_INDEX = 99;
const VERSION_STATE_DIR = '.build-meta';
const VERSION_STATE_FILE = 'build-version-state.json';
const NAMED_RELEASE_DIR = path.join('android', 'app', 'build', 'outputs', 'release-named');

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

function normalizeRelativePath(value) {
  return String(value || '').split(path.sep).join('/');
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

function getVersionStatePath(rootDir) {
  return path.join(rootDir, VERSION_STATE_DIR, VERSION_STATE_FILE);
}

function readVersionState(rootDir) {
  try {
    const raw = fs.readFileSync(getVersionStatePath(rootDir), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!/^\d{8}$/.test(String(parsed.dateKey || ''))) return null;
    const buildIndex = clampBuildIndex(parsed.buildIndex);
    const fingerprint = String(parsed.fingerprint || '').trim();
    if (!fingerprint) return null;
    return {
      dateKey: String(parsed.dateKey),
      buildIndex,
      fingerprint,
    };
  } catch {
    return null;
  }
}

function writeVersionState(rootDir, state) {
  const dirPath = path.join(rootDir, VERSION_STATE_DIR);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    getVersionStatePath(rootDir),
    JSON.stringify(
      {
        dateKey: state.dateKey,
        buildIndex: state.buildIndex,
        fingerprint: state.fingerprint,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function getWorkspaceFilesFromGit(rootDir) {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: rootDir,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map(normalizeRelativePath)
      .filter((relativePath) => relativePath !== `${VERSION_STATE_DIR}/${VERSION_STATE_FILE}`)
      .sort();
  } catch {
    return [];
  }
}

function hashFileContents(hash, absolutePath) {
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    hash.update('dir\0');
    return;
  }
  hash.update('file\0');
  hash.update(fs.readFileSync(absolutePath));
  hash.update('\0');
}

function getWorkspaceFingerprint(rootDir) {
  const files = getWorkspaceFilesFromGit(rootDir);
  if (files.length === 0) {
    return 'workspace-empty';
  }

  const hash = crypto.createHash('sha256');
  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    hash.update(normalizeRelativePath(relativePath));
    hash.update('\0');
    if (!fs.existsSync(absolutePath)) {
      hash.update('missing\0');
      continue;
    }
    hashFileContents(hash, absolutePath);
  }
  return hash.digest('hex');
}

function getExistingNamedReleaseIndex(rootDir, dateKey) {
  try {
    const releaseDir = path.join(rootDir, NAMED_RELEASE_DIR);
    const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
    let maxIndex = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = new RegExp(`^ourhangout_${dateKey}_(\\d{1,2})-release\\.apk$`).exec(entry.name);
      if (!match) continue;
      maxIndex = Math.max(maxIndex, clampBuildIndex(match[1]));
    }
    return maxIndex;
  } catch {
    return 0;
  }
}

function resolveWorkspaceBuildIndex(rootDir, dateKey, fingerprint) {
  const currentState = readVersionState(rootDir);
  if (currentState && currentState.dateKey === dateKey) {
    return currentState.fingerprint === fingerprint
      ? currentState.buildIndex
      : clampBuildIndex(currentState.buildIndex + 1);
  }
  if (currentState && currentState.dateKey !== dateKey) {
    return 1;
  }
  const existingIndex = getExistingNamedReleaseIndex(rootDir, dateKey);
  return existingIndex > 0 ? clampBuildIndex(existingIndex + 1) : 1;
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
  const explicitIndex = options.explicitIndex || process.env.OH_BUILD_INDEX;
  const fingerprint = explicitIndex ? '' : getWorkspaceFingerprint(rootDir);
  const buildIndex = clampBuildIndex(
    explicitIndex || resolveWorkspaceBuildIndex(rootDir, dateKey, fingerprint) || getDailyCommitIndex(rootDir, parts)
  );

  if (!explicitIndex && fingerprint) {
    writeVersionState(rootDir, {
      dateKey,
      buildIndex,
      fingerprint,
    });
  }

  return {
    dateKey,
    buildIndex,
    versionName: `${dateKey}_${buildIndex}`,
    versionCode: Number(dateKey) * 100 + buildIndex,
    source: explicitIndex ? 'env:OH_BUILD_INDEX' : 'workspace-fingerprint',
    timeZone: SEOUL_TIME_ZONE,
  };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(getBuildVersionInfo())}\n`);
}

module.exports = {
  getBuildVersionInfo,
};
