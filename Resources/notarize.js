/*
 * Copyright (c) 2023 Rob Royce
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

require("dotenv").config();
const { notarize } = require("electron-notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appleId = process.env.APPLEID;
  const password = process.env.APPLEPWD;
  const teamId = process.env.TEAMID;

  if (!appleId || !password || !teamId) {
    console.log(
      "Skipping notarization: set APPLEID, APPLEPWD and TEAMID to notarize."
    );
    return;
  }

  return await notarize({
    appBundleId: "com.knowledge.canvas.app",
    appPath: `${appOutDir}/${appName}.app`,
    appleId: appleId,
    appleIdPassword: password,
    teamId: teamId,
    tool: "notarytool",
  });
};
