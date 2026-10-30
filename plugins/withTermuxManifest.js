const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withTermuxManifest = (config) => {
  // 1. Modify AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    if (!androidManifest.manifest.queries) {
      androidManifest.manifest.queries = [];
    }

    const hasTermuxQuery = androidManifest.manifest.queries.some(
      (q) => q.package && q.package.some((p) => p.$ && p.$['android:name'] === 'com.termux')
    );

    if (!hasTermuxQuery) {
      androidManifest.manifest.queries.push({
        package: [{ $: { 'android:name': 'com.termux' } }],
      });
    }

    const app = androidManifest.manifest.application?.[0];
    if (app) {
      delete app.$['android:usesCleartextTraffic'];
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }

    return config;
  });

  // 2. Write network_security_config.xml permitting cleartext strictly to loopback (127.0.0.1 & localhost)
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resXmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      fs.mkdirSync(resXmlDir, { recursive: true });
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">127.0.0.1</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>
`;
      fs.writeFileSync(path.join(resXmlDir, 'network_security_config.xml'), xmlContent, 'utf8');
      return config;
    },
  ]);

  return config;
};

module.exports = withTermuxManifest;
