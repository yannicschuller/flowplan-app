// Android: which certificate authorities the app trusts
// (yannicschuller/flowplan#271 for the app). Apps targeting Android 7+ trust
// only the system's CAs by default – a CA the person installed for their
// self-hosted instance (Settings → Security → Encryption & credentials →
// Install a certificate → CA certificate) is ignored, while the same
// instance opens in Chrome. This network security config trusts the
// person's CAs ("user") in addition to the system's, for the web view and
// the app's own requests alike – the usual setting for apps made for
// self-hosted servers.
//
// The trade-off: a CA in the user store is trusted for every host the app
// talks to, not only the instance – including app.flowplan.org and the push
// relay. Installing a CA takes the device's screen lock and Android warns
// about it permanently ("Network may be monitored"), and a CA that a device
// management profile installed is trusted by the system anyway; the app never
// trusts certificates the person did not install or confirm (pinned ones:
// modules/flowplan-native → CertificatePins.kt). Debug overrides stay off.
//
// cleartextTrafficPermitted keeps plain HTTP as it was: with a network
// security config Android ignores android:usesCleartextTraffic
// (expo-build-properties in app.config.ts), and the app itself only allows
// plain HTTP in the local network (src/server.ts → plainHttpAllowed).
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const FILE = "flowplan_network_security";

const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by plugins/with-network-security.js – see there. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

const withNetworkSecurity = (config) => {
  config = withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${FILE}.xml`), NETWORK_SECURITY_XML);
      return config;
    },
  ]);
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) throw new Error("with-network-security: no <application> in AndroidManifest.xml");
    const existing = application.$["android:networkSecurityConfig"];
    if (existing && existing !== `@xml/${FILE}`) throw new Error(`with-network-security: another network security config is set (${existing})`);
    application.$["android:networkSecurityConfig"] = `@xml/${FILE}`;
    return config;
  });
};

module.exports = withNetworkSecurity;
module.exports.NETWORK_SECURITY_XML = NETWORK_SECURITY_XML;
module.exports.FILE = FILE;
