import { readonly, ref } from 'vue';

export const REPOSITORY_URL = 'https://github.com/losblancos113/open-pos';
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;
const RELEASE_API_URL = 'https://api.github.com/repos/losblancos113/open-pos/releases/latest';

export type PlatformId = 'windows' | 'macos' | 'linux';
export type ReleaseStatus = 'loading' | 'ready' | 'fallback';

export interface DownloadAsset {
  name: string;
  url: string;
  size: number;
}

export interface PlatformDownload {
  id: PlatformId;
  primary: DownloadAsset;
  alternates: DownloadAsset[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
}

const PLATFORM_EXTENSIONS: ReadonlyArray<{ id: PlatformId; extensions: string[] }> = [
  { id: 'windows', extensions: ['.exe', '.msi'] },
  { id: 'macos', extensions: ['.dmg'] },
  { id: 'linux', extensions: ['.appimage', '.deb', '.rpm'] },
];

const status = ref<ReleaseStatus>('loading');
const tagName = ref('');
const platforms = ref<PlatformDownload[]>([]);
let started = false;

function isGitHubAsset(value: unknown): value is GitHubAsset {
  if (typeof value !== 'object' || value === null) return false;
  const asset = value as Record<string, unknown>;
  return (
    typeof asset.name === 'string' &&
    typeof asset.browser_download_url === 'string' &&
    typeof asset.size === 'number'
  );
}

function toAsset(asset: GitHubAsset): DownloadAsset {
  return { name: asset.name, url: asset.browser_download_url, size: asset.size };
}

function groupByPlatform(assets: GitHubAsset[]): PlatformDownload[] {
  const usable = assets.filter((asset) => !asset.name.toLowerCase().endsWith('.sig'));

  return PLATFORM_EXTENSIONS.flatMap(({ id, extensions }) => {
    const matches: DownloadAsset[] = [];
    for (const extension of extensions) {
      for (const asset of usable) {
        if (
          asset.name.toLowerCase().endsWith(extension) &&
          !matches.some((match) => match.name === asset.name)
        ) {
          matches.push(toAsset(asset));
        }
      }
    }

    const primary = matches[0];
    if (!primary) return [];
    return [{ id, primary, alternates: matches.slice(1) }];
  });
}

async function loadLatestRelease(): Promise<void> {
  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`GitHub release API responded with ${response.status}`);
    }

    const release = (await response.json()) as Partial<GitHubRelease>;
    const assets = Array.isArray(release.assets) ? release.assets.filter(isGitHubAsset) : [];
    const grouped = groupByPlatform(assets);
    if (grouped.length === 0) {
      throw new Error('GitHub release has no downloadable assets');
    }

    tagName.value = release.tag_name ?? '';
    platforms.value = grouped;
    status.value = 'ready';
  } catch {
    status.value = 'fallback';
  }
}

export function useLatestRelease() {
  if (!started) {
    started = true;
    void loadLatestRelease();
  }

  return {
    status: readonly(status),
    tagName: readonly(tagName),
    platforms: readonly(platforms),
  };
}
