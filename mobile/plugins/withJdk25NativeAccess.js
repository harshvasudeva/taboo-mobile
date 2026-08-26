/**
 * Run the Android native build on JDK 24+ (this machine: JDK 25) without
 * pinning an older JDK.
 *
 * 1) Java 24 made JNI/System.load a "restricted method"; AGP Prefab treats
 *    that stderr warning as a hard CMake failure. Enable native access on
 *    the Gradle + Kotlin daemons.
 * 2) Windows ninja still Stat()s paths at MAX_PATH 260. Cursor/sandbox Gradle
 *    homes are far over that, so gradlew forces a short project-local cache.
 */
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const JVMARGS =
  '-Xmx2048m -XX:MaxMetaspaceSize=512m --enable-native-access=ALL-UNNAMED';

const GRADLEW_MARK = 'taboo short gradle home (Windows MAX_PATH + JDK 25)';

const GRADLEW_BLOCK = `
@rem ${GRADLEW_MARK}
if not exist "%~dp0..\\.gradle-home" mkdir "%~dp0..\\.gradle-home"
set "GRADLE_USER_HOME=%~dp0..\\.gradle-home"
set "JAVA_TOOL_OPTIONS=--enable-native-access=ALL-UNNAMED"
`;

function upsert(props, key, value) {
  const i = props.findIndex((p) => p.type === 'property' && p.key === key);
  if (i >= 0) props[i].value = value;
  else props.push({ type: 'property', key, value });
}

function withGradlewShortHome(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const bat = path.join(cfg.modRequest.platformProjectRoot, 'gradlew.bat');
      if (!fs.existsSync(bat)) return cfg;
      let text = fs.readFileSync(bat, 'utf8');
      if (text.includes(GRADLEW_MARK)) return cfg;
      const needle = 'if "%OS%"=="Windows_NT" setlocal';
      if (!text.includes(needle)) return cfg;
      text = text.replace(needle, `${needle}\n${GRADLEW_BLOCK}`);
      fs.writeFileSync(bat, text);
      return cfg;
    },
  ]);
}

module.exports = function withJdk25NativeAccess(config) {
  config = withGradleProperties(config, (cfg) => {
    upsert(cfg.modResults, 'org.gradle.jvmargs', JVMARGS);
    upsert(cfg.modResults, 'kotlin.daemon.jvmargs', JVMARGS);
    return cfg;
  });
  return withGradlewShortHome(config);
};
