// Records which native toolchains this host actually has. Absence is reported,
// never filled in. Installs nothing. `--require android|ios` exits 3 when that
// target's prerequisites are missing.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {platform, arch, release} from 'node:os';
import {fileURLToPath} from 'node:url';

// First output line matching `pick`, from stdout or stderr. Null when the command
// is absent, fails or exits nonzero (e.g. macOS Command Line Tools stubs).
export function run(cmd, args, pick = /\S/) {
  const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 15000, env: {...process.env, JAVA_TOOL_OPTIONS: ''}});
  if (r.error || r.status !== 0) return null;
  const line = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').map(l => l.trim()).find(l => pick.test(l) && !l.startsWith('Picked up'));
  return line || 'present (version not reported)';
}

export function probe() {
  const sdkEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || null;
  const sdk = sdkEnv && existsSync(sdkEnv) ? sdkEnv : null;
  const tools = {
    node: process.version,
    java: run('java', ['-version']),
    gradle: run('gradle', ['--version'], /^Gradle /),
    adb: run('adb', ['version']),
    sdkmanager: run('sdkmanager', ['--version']),
    emulator: run('emulator', ['-version']),
    xcodebuild: run('xcodebuild', ['-version']),
    xcrun_simctl: run('xcrun', ['simctl', 'help']),
  };
  const host = {platform: platform(), arch: arch(), release: release(), kvm: existsSync('/dev/kvm'), androidSdkRoot: sdk, androidSdkEnvMissingDir: sdkEnv && !sdk ? sdkEnv : null};
  const devices = tools.adb ? (spawnSync('adb', ['devices'], {encoding: 'utf8'}).stdout || '').split('\n').filter(l => /\tdevice$/.test(l)).length : 0;
  host.adbDevices = devices;
  const missing = {
    // Ready means a target to run on: an emulator this host can accelerate, or an attached device.
    android: [!tools.java && 'java', !sdk && 'ANDROID_HOME/ANDROID_SDK_ROOT (existing directory)', !tools.adb && 'adb',
      !(tools.emulator && (host.platform !== 'linux' || host.kvm)) && devices === 0 && 'an attached device, or emulator with KVM (/dev/kvm) on Linux'].filter(Boolean),
    ios: [host.platform !== 'darwin' && 'macOS host', !tools.xcodebuild && 'Xcode (xcodebuild)', !tools.xcrun_simctl && 'iOS Simulator (xcrun simctl)'].filter(Boolean),
  };
  return {probedAt: new Date().toISOString(), host, tools, missing, ready: {android: missing.android.length === 0, ios: missing.ios.length === 0}};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = probe();
  console.log(JSON.stringify(result, null, 2));
  const i = process.argv.indexOf('--require');
  const target = i > 0 ? process.argv[i + 1] : null;
  if (target && !(target in result.ready)) { console.error(`unknown target ${target}`); process.exit(2); }
  if (target && !result.ready[target]) { console.error(`${target}: missing ${result.missing[target].join(', ')}`); process.exit(3); }
}
