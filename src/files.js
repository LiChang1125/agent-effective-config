import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

export function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

export function readText(filePath) {
  try {
    return { ok: true, value: fs.readFileSync(filePath, 'utf8') };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function readJson(filePath) {
  const text = readText(filePath);
  if (!text.ok) return text;
  try {
    return { ok: true, value: JSON.parse(text.value) };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}` };
  }
}

export function listFiles(directory, predicate = () => true) {
  if (!isDirectory(directory)) return [];
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

export function listSkillManifests(directory) {
  if (!isDirectory(directory)) return [];
  const manifests = [];
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(directory, entry.name, 'SKILL.md');
      if (isFile(manifest)) manifests.push(manifest);
    }
  } catch {
    return [];
  }
  return manifests;
}

export function homePath(...parts) {
  return path.join(os.homedir(), ...parts);
}

export function displayPath(filePath, cwd) {
  const absolute = path.resolve(filePath);
  const working = path.resolve(cwd);
  const relative = path.relative(working, absolute);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  if (absolute === working) return '.';
  const home = path.resolve(os.homedir());
  const homeRelative = path.relative(home, absolute);
  if (homeRelative && !homeRelative.startsWith('..') && !path.isAbsolute(homeRelative)) {
    return `~/${homeRelative.split(path.sep).join('/')}`;
  }
  return absolute.split(path.sep).join('/');
}

export function gitRoot(cwd) {
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim()
    ? path.resolve(result.stdout.trim())
    : path.resolve(cwd);
}

export function directoriesFromRoot(root, cwd) {
  const top = path.resolve(root);
  const leaf = path.resolve(cwd);
  const relative = path.relative(top, leaf);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return [leaf];
  const result = [top];
  let current = top;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    result.push(current);
  }
  return result;
}

export function findExecutable(command) {
  if (!command || /[\\/]/.test(command)) {
    return command && isFile(path.resolve(command)) ? path.resolve(command) : null;
  }
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

export function runReadOnly(command, args, cwd, timeout = 15000) {
  if (!findExecutable(command)) {
    return { ok: false, missing: true, stdout: '', stderr: `${command} is not installed` };
  }
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    ok: result.status === 0,
    missing: false,
    stdout: result.stdout || '',
    stderr: result.stderr || (result.error ? result.error.message : ''),
    status: result.status,
  };
}

export function firstCanary(filePath) {
  const text = readText(filePath);
  if (!text.ok) return null;
  const match = text.value.match(/\bAEC_CANARY\s*[:=]\s*([A-Za-z0-9_-]{6,80})\b/i);
  return match ? match[1] : null;
}

export function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.path}\u0000${source.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
