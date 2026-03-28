const nodeMajor = Number(process.versions.node.split('.')[0]);
const userAgent = process.env.npm_config_user_agent ?? '';
const npmMatch = userAgent.match(/npm\/(\d+)\./);
const npmMajor = npmMatch ? Number(npmMatch[1]) : null;

if (nodeMajor !== 20) {
  console.error(
    `This repository is pinned to Node.js 20.x. Current version: ${process.versions.node}. Use \`nvm use\` before running npm commands.`
  );
  process.exit(1);
}

if (npmMajor !== 10) {
  console.error(
    `This repository requires npm 10.x to keep package-lock.json compatible with GitHub Actions. Current npm user agent: ${userAgent || 'unknown'}.`
  );
  process.exit(1);
}
