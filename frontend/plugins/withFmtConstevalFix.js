const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26.4 / Apple Clang 21 made consteval stricter, which breaks the `fmt`
// pod (vendored via React Native / folly) when it compiles its FMT_STRING call
// sites under C++20+ (facebook/react-native#55601). Scoping just the `fmt`
// target back to C++17 sidesteps the consteval evaluation without touching the
// EAS image or downgrading anything else.
//
// ios/ is gitignored and regenerated on every build, so we inject this as a
// Podfile post_install hook during prebuild. The hook is idempotent (guarded by
// a marker) and merges into an existing post_install block rather than
// clobbering one (e.g. Expo's react_native_post_install).
const MARKER = '# @koan fmt-consteval-fix';

const FMT_HOOK = (installerVar) => `    ${MARKER}
    ${installerVar}.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |config|
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
    end`;

const withFmtConstevalFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const podfilePath = path.join(projectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      // Idempotent: bail if we already injected the hook this prebuild.
      if (contents.includes(MARKER)) {
        return config;
      }

      const postInstallMatch = contents.match(/post_install do \|([^|]+)\|/);
      if (postInstallMatch) {
        // Insert just inside the existing post_install block, preserving the
        // rest of its contents (other hooks stay intact).
        const installerVar = postInstallMatch[1].trim();
        const anchor = postInstallMatch[0];
        contents = contents.replace(anchor, `${anchor}\n${FMT_HOOK(installerVar)}`);
      } else {
        // No post_install block yet — add one at the end of the file.
        contents = `${contents.replace(/\s*$/, '')}\n\npost_install do |installer|\n${FMT_HOOK('installer')}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents, 'utf-8');
      return config;
    },
  ]);
};

module.exports = withFmtConstevalFix;
