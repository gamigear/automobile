export function getSourceDownloadSettings() {
  return {
    enabled: process.env.DOWNLOAD_BOTS_ENABLED !== 'false',
    xhsApiUrl: process.env.DOWNLOAD_BOTS_XHS_API_URL || 'http://localhost:5556',
    douyinContainer: process.env.DOWNLOAD_BOTS_DOUYIN_CONTAINER || 'standalone-gamigear-bot',
    dockerBin: process.env.DOWNLOAD_BOTS_DOCKER_BIN || 'docker',
    dataRoot:
      process.env.DOWNLOAD_BOTS_DATA_ROOT ||
      '/Users/dteanh/Documents/Project/OpenClaw_AI/.openclaw-workspace/download-bots-standalone/data',
  };
}
