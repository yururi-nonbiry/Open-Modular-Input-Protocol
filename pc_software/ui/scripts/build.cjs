const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function getMajorVersion(version) {
  const match = /^v?(\d+)/.exec(version);
  if (!match) {
    return 0;
  }
  return parseInt(match[1], 10);
}

function toWindowsPath(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (process.platform === 'win32') {
    return inputPath;
  }
  if (inputPath.startsWith('/mnt/')) {
    const driveLetter = inputPath.charAt(5);
    const rest = inputPath.slice(6).replace(/\//g, '\\');
    return driveLetter.toUpperCase() + ':\\' + rest;
  }
  return inputPath;
}

function runNodeCommand(nodeBinary, scriptPath, args, options) {
  const execArgs = [scriptPath].concat(args || []);
  const spawnOptions = {
    stdio: 'inherit',
    env: process.env,
  };
  if (options && options.cwd) {
    spawnOptions.cwd = options.cwd;
  }
  const result = childProcess.spawnSync(nodeBinary, execArgs, spawnOptions);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const MIN_MAJOR = 18;
  const currentVersion = process.version;
  const currentMajor = getMajorVersion(currentVersion);
  let nodeBinary = process.execPath;
  let useWindowsStylePaths = false;

  if (currentMajor < MIN_MAJOR) {
    const candidates = [
      '/mnt/c/Program Files/nodejs/node.exe',
      '/mnt/c/Program Files (x86)/nodejs/node.exe',
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      if (fs.existsSync(candidates[i])) {
        nodeBinary = candidates[i];
        useWindowsStylePaths = true;
        console.log('[build] 現在のNode.jsバージョン(' + currentVersion + ')ではビルドできないため、' + nodeBinary + ' を使用します。');
        break;
      }
    }
    if (!useWindowsStylePaths) {
      console.error('[build] Node.js 18以上が必要です。お使いの環境のNode.jsをアップデートしてください。');
      process.exit(1);
    }
  }

  if (useWindowsStylePaths) {
    nodeBinary = toWindowsPath(nodeBinary);
  }

  let projectDir = process.cwd();
  let tscPath = path.resolve(projectDir, 'node_modules', 'typescript', 'bin', 'tsc');
  let vitePath = path.resolve(projectDir, 'node_modules', 'vite', 'bin', 'vite.js');
  let electronBuilderPath = path.resolve(projectDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

  const options = {};
  if (useWindowsStylePaths) {
    projectDir = toWindowsPath(projectDir);
    tscPath = toWindowsPath(tscPath);
    vitePath = toWindowsPath(vitePath);
    electronBuilderPath = toWindowsPath(electronBuilderPath);
    options.cwd = projectDir;
  }

  runNodeCommand(nodeBinary, tscPath, ['-b'], options);
  runNodeCommand(nodeBinary, vitePath, ['build'], options);
  runNodeCommand(nodeBinary, electronBuilderPath, [], options);
}

main();
