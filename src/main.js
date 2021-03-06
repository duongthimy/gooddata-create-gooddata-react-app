// (C) 2019 GoodData Corporation
import chalk from "chalk";
import path from "path";
import execa from "execa";
import Listr from "listr";
import mkdirp from "mkdirp";
import tar from "tar";

import replaceInFiles from "./replaceInFiles";
import processTigerFiles from "./processTigerFiles";
import { getHostnameWithSchema, getSchema, DEFAULT_SCHEMA } from "./stringUtils";
import { verboseLog } from "./verboseLogging";

const getTargetDirPath = (sanitizedAppName, targetDir) =>
    path.resolve(targetDir || process.cwd(), sanitizedAppName);

const copyAppFiles = async ({ targetDir }) => {
    mkdirp(targetDir);
    return tar.x({
        file: path.resolve(__dirname, "bootstrap.tgz"),
        strip: 1,
        cwd: targetDir,
    });
};

const performTemplateReplacements = ({ targetDir, sanitizedAppName, hostname, backend }) => {
    const hostnameSchema = getSchema(hostname) || DEFAULT_SCHEMA;

    // this object has structure corresponding to the file structure relative to targetDir
    // having it like this makes sure that all the replacements relevant to each file are in one place, thus preventing race conditions
    const replacementDefinitions = {
        "package.json": [
            { regex: /@gooddata\/gdc-app-name/, value: sanitizedAppName },
            backend === "tiger"
                ? { regex: /@gooddata\/sdk-backend-bear/g, value: "@gooddata/sdk-backend-tiger" }
                : "",
            backend === "tiger"
                ? {
                      regex: /"refresh-ldm": "node .\/scripts\/refresh-ldm.js"/g,
                      value: '"refresh-ldm": "node ./scripts/refresh-ldm.js --backend tiger"',
                  }
                : "",
            hostnameSchema !== "https"
                ? {
                      regex: /"start": "cross-env HTTPS=true react-scripts start",/g,
                      value: '"start": "react-scripts start",',
                  }
                : "",
        ],
        src: {
            "constants.js": [
                { regex: /appName: "(.*?)"/, value: `appName: "${sanitizedAppName}"` },
                {
                    regex: /backend: "https:\/\/developer\.na\.gooddata\.com"/g,
                    value: `backend: "${getHostnameWithSchema(hostname)}"`,
                },
                backend === "tiger" ? { regex: /workspace: ""/g, value: 'workspace: "workspace"' } : "",
            ],
            "setupProxy.js": [
                backend === "tiger"
                    ? {
                          regex: /proxy\("\/gdc"/g,
                          value: 'proxy("/api"',
                      }
                    : "",
            ],
            components: {
                Header: {
                    // remove Login / Logout buttons for now from tiger
                    "Header.js": [
                        backend === "tiger" ? { regex: /import Aside from ".\/Aside";\n/g, value: "" } : "",
                        backend === "tiger" ? { regex: /<Aside \/>/g, value: "" } : "",
                    ],
                },
            },
        },
    };

    return replaceInFiles(targetDir, replacementDefinitions);
};

const setupApp = async (bootstrapData) => {
    await performTemplateReplacements(bootstrapData);
    return processTigerFiles(bootstrapData.targetDir, bootstrapData.backend === "tiger");
};

const runYarnInstall = ({ targetDir, install }) => {
    if (!install) {
        console.log("Skipping installation because the --no-install flag was specified");
        return true;
    }

    return execa("yarn", {
        cwd: targetDir,
        stdio: [process.stdin, process.stdout, process.stderr],
    })
        .then(() => true)
        .catch(() => {
            console.log(
                chalk.red(
                    "Installation failed. Please make sure that you have yarn installed and try again.",
                ),
            );
            return false;
        });
};

const outputFinalInstructions = ({ sanitizedAppName, install, targetDir }) => {
    console.log(`Success! Your GoodData-powered application "${sanitizedAppName}" was created.`);
    console.log("You can start it using the following commands:");
    console.log(chalk.cyan(`    cd ${path.relative(process.cwd(), targetDir)}`));
    if (!install) {
        console.log(chalk.cyan("    yarn install"));
    }
    console.log(chalk.cyan("    yarn start"));
};

const main = async (partialBootstrapData) => {
    const bootstrapData = {
        ...partialBootstrapData,
        targetDir: getTargetDirPath(partialBootstrapData.sanitizedAppName, partialBootstrapData.targetDir),
    };

    if (bootstrapData.verbose) {
        verboseLog(`Target directory: ${bootstrapData.targetDir}`);
    }

    const tasks = new Listr([
        {
            title: "Copy app files",
            task: () => copyAppFiles(bootstrapData),
        },
        {
            title: "Set up app",
            task: () => setupApp(bootstrapData),
        },
    ]);

    await tasks.run();

    if (await runYarnInstall(bootstrapData)) {
        outputFinalInstructions(bootstrapData);
    }
};

export default main;
