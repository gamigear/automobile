import path from 'node:path';
// settings
import { getSourceDownloadSettings } from './source-download-settings';

// ----------------------------------------------------------------------
// Map đường dẫn giữa host và container bot. Container mount dataRoot -> /data.
// Dùng chung cho vietsub, concat, và các script chạy trong container bot.

// host path (dưới dataRoot) -> path container thấy (/data/...).
export function hostToContainer(hostPath: string): string {
  const { dataRoot } = getSourceDownloadSettings();
  const root = path.resolve(dataRoot);
  const resolved = path.resolve(hostPath);
  if (resolved === root || resolved.startsWith(root + path.sep)) {
    return `/data/${resolved.slice(root.length).replace(/^[/\\]+/, '')}`.replace(/\\/g, '/');
  }

  return hostPath; // ngoài dataRoot -> để nguyên (script có thể không thấy)
}

export function containerToHost(containerPath: string): string {
  const { dataRoot } = getSourceDownloadSettings();
  if (containerPath.startsWith('/data/')) {
    return path.join(dataRoot, containerPath.replace(/^\/data\//, ''));
  }

  return containerPath;
}

// Đổi localhost/127.0.0.1 -> host.docker.internal để container gọi được service trên host.
export function containerReachable(url: string): string {
  return (url || '').replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
}
