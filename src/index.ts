import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as process from "process";
import * as fs from "fs";
import * as restm from "typed-rest-client/RestClient";
import * as toolCache from "@actions/tool-cache";
import * as util from "util";
import * as path from "path";
import * as os from "os";
import { get } from "request-promise";
import * as env from "env-var";

const github = require("@actions/github");

let stack = core.getInput("stack");
let branch = "";

const args = core.getInput("args") || "preview";
const root = process.cwd();
const pulumiRoot = core.getInput("root");
const downloadAuthOnly = core.getInput("download-auth-only");

if (pulumiRoot) {
  process.chdir(pulumiRoot);
}

const workflow = github.context.workflow;

if (workflow) {
  core.exportVariable("PULUMI_CI_SYSTEM", "GitHub");
  core.exportVariable("PULUMI_CI_BUILD_ID", "");
  core.exportVariable("PULUMI_CI_BUILD_TYPE", "");
  core.exportVariable("PULUMI_CI_BUILD_URL", "");
  core.exportVariable("PULUMI_CI_PULL_REQUEST_SHA", github.context.sha);
}

const mode = github.context.payload.pull_request ? "pr" : "";
switch (mode) {
  case "pr":
    if (
      !["opened", "edited", "synchronize"].includes(
        github.context.payload.action as string
      )
    ) {
      core.info(
        `PR event ${github.context.payload.action} contains no changes and does not warrant a Pulumi Preview`
      );
      core.info("Skipping Pulumi action altogether...");
      process.exit(0);
    }
    branch = github.context.payload.pull_request.base.ref;
    break;
  default:
    branch = github.context.ref;
    break;
}

branch = branch.replace(/refs\/heads\//, "");

async function run() {
  await downloadPulumi();

  if (!stack) {
    core.info("Stack not defined, using ci.json");
    const ci = fs.readFileSync(`${root}/.pulumi/ci.json`, "utf8");

    core.info(`Using branch: ${branch}`);
    stack = JSON.parse(ci)[branch];
  }

  await exec("pulumi", ["stack", "select", stack]);

  const gcloudFile = `${process.env.HOME}/gcloud.json`;

  const credentialsKey = "GOOGLE_CREDENTIALS";
  core.info(`Using Google Credentials from: ${credentialsKey}`);

  const googleCredentials = env
    .get(credentialsKey)
    .required()
    .convertFromBase64()
    .asString();

  fs.writeFileSync(gcloudFile, googleCredentials);
  await exec("gcloud auth activate-service-account", [
    `--key-file=${gcloudFile}`
  ]);

  if (fs.existsSync("package.json")) {
    if (fs.existsSync("yarn.lock") || core.getInput("yarn")) {
      await exec("yarn install");
    } else {
      await exec("npm install");
    }
  }

  if (downloadAuthOnly) return;

  var output = "";

  let options = {
    listeners: {
      stdout: (data: Buffer) => {
        let s = data.toString();
        output += s;
        core.info(s);
      },
      stderr: (data: Buffer) => {
        core.error(data.toString());
      }
    },
    ignoreReturnCode: true
  };

  let cmd = "pulumi " + args;
  core.info(`#### :tropical_drink: ${cmd}`);
  const exitCode = await exec(cmd, undefined, options);
  // # If the GitHub action stems from a Pull Request event, we may optionally
  // # leave a comment if the COMMENT_ON_PR is set.
  if (github.context.payload.pull_request && core.getInput("comment-on-pr")) {
    let commentsUrl = github.context.payload.pull_request
      .comments_url as string;
    let token = process.env.GITHUB_TOKEN;
    if (!token) {
      core.setFailed("Can't leave a comment, unknown github-token");
    } else {
      let body = `#### :tropical_drink: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      core.info(`Commenting on PR ${commentsUrl}`);
      let gh = new restm.RestClient("github-api");
      await gh.create(
        commentsUrl,
        { body },
        {
          additionalHeaders: {
            Authorization: `token ${token}`
          }
        }
      );
    }
  }
  process.exit(exitCode);
}

function getDownloadURL(version: string): string {
  switch (os.type()) {
    case "Linux":
      return util.format(
        "https://get.pulumi.com/releases/sdk/pulumi-v%s-linux-x64.tar.gz",
        version
      );

    case "Darwin":
      return util.format(
        "https://get.pulumi.com/releases/sdk/pulumi-v%s-darwin-x64.tar.gz",
        version
      );

    case "Windows_NT":
    default:
      return util.format(
        "https://get.pulumi.com/releases/sdk/pulumi-v%s-windows-x64.tar.gz",
        version
      );
  }
}

async function downloadPulumi() {
  const version = await getLatestVersion();
  core.info(version);
  let cachedToolpath = toolCache.find("pulumi", version);
  if (!cachedToolpath) {
    let downloadPath;
    try {
      downloadPath = await toolCache.downloadTool(getDownloadURL(version));
    } catch (exception) {
      console.log(exception);
      throw new Error(
        util.format(
          "Failed to download Pulumi from location ",
          getDownloadURL(version)
        )
      );
    }

    const extractedPath = await toolCache.extractTar(downloadPath);
    cachedToolpath = await toolCache.cacheDir(
      path.join(extractedPath, "pulumi"),
      "pulumi",
      version
    );
  }

  core.addPath(cachedToolpath);
}

async function getLatestVersion(): Promise<string> {
  const resp = await get("https://pulumi.com/latest-version", {
    followAllRedirects: true
  });

  return resp;
}

run().catch(core.setFailed);
