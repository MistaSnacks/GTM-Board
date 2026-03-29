/**
 * Zernio connector — schedule, list, and publish social media posts via Zernio API.
 *
 * Required .env vars:
 *   ZERNIO_API_KEY — API key (sk_ prefix) from Settings → API Keys
 *
 * Optional .env vars:
 *   ZERNIO_PROFILE_ID — Default profile _id (container for social accounts)
 *   ZERNIO_ACCOUNTS   — JSON map of platform→accountId, e.g. {"twitter":"acc_abc","linkedin":"acc_def"}
 *
 * Setup flow:
 *   1. Create API key at zernio.com Settings → API Keys
 *   2. Create a profile via API or dashboard
 *   3. Connect social accounts via OAuth (dashboard or connect API)
 *   4. List accounts to get per-platform account IDs
 *
 * Post flow: schedule (draft with future time) → list/review → publish immediately
 */

const BASE_URL = "https://zernio.com/api/v1";

interface ZernioPostResponse {
  _id: string;
  content: string;
  platforms: { platform: string; accountId: string }[];
  status: string;
  scheduledFor?: string;
  createdAt?: string;
}

function loadEnv(env: Record<string, string>): {
  apiKey: string;
  profileId?: string;
  accounts?: Record<string, string>;
} {
  const apiKey = env.ZERNIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ZERNIO_API_KEY in .env. Setup:\n" +
        "1. Sign up at zernio.com\n" +
        "2. Settings → API Keys → Create API Key\n" +
        "3. Connect social accounts in dashboard\n" +
        "4. Add to projects/<name>/.env:\n" +
        "   ZERNIO_API_KEY=sk_your_key\n" +
        '   ZERNIO_ACCOUNTS={"twitter":"acc_xxx","linkedin":"acc_yyy"}\n' +
        "   ZERNIO_PROFILE_ID=your_profile_id (optional)"
    );
  }

  let accounts: Record<string, string> | undefined;
  if (env.ZERNIO_ACCOUNTS) {
    try {
      accounts = JSON.parse(env.ZERNIO_ACCOUNTS);
    } catch {
      // ignore parse errors
    }
  }

  return {
    apiKey,
    profileId: env.ZERNIO_PROFILE_ID,
    accounts,
  };
}

async function zernioFetch(
  endpoint: string,
  apiKey: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {}
): Promise<unknown> {
  const { method = "GET", body } = options;

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Zernio API error: ${response.status} ${response.statusText} ${text}`);
  }

  return response.json();
}

// ── UTM injection for gettailor.ai links ──

function appendUtmToContent(
  content: string,
  platforms: string[],
  postId?: string
): string {
  // Match bare gettailor.ai URLs (with optional path/query)
  return content.replace(
    /https?:\/\/(www\.)?gettailor\.ai(\/[^\s)]*)?/g,
    (match) => {
      const url = new URL(match);
      // Don't overwrite existing UTM params
      if (url.searchParams.has('utm_source')) return match;

      const platform = platforms[0] || 'social';
      url.searchParams.set('utm_source', platform);
      url.searchParams.set('utm_medium', 'social');
      url.searchParams.set('utm_campaign', 'organic');
      if (postId) {
        url.searchParams.set('utm_content', postId);
      }
      return url.toString();
    }
  );
}

// ── Exported API functions ──

/**
 * List connected accounts to discover account IDs per platform.
 */
export async function listAccounts(params: {
  project: string;
  env: Record<string, string>;
}): Promise<{ accounts: unknown[] }> {
  const { apiKey } = loadEnv(params.env);
  const result = (await zernioFetch("/accounts", apiKey)) as { accounts?: unknown[] };
  return { accounts: result.accounts || (Array.isArray(result) ? result : []) };
}

/**
 * List profiles to find profile _id values.
 */
export async function listProfiles(params: {
  project: string;
  env: Record<string, string>;
}): Promise<{ profiles: unknown[] }> {
  const { apiKey } = loadEnv(params.env);
  const result = (await zernioFetch("/profiles", apiKey)) as { profiles?: unknown[] };
  return { profiles: result.profiles || (Array.isArray(result) ? result : []) };
}

/**
 * Schedule a post for future publishing.
 *
 * Platforms array requires accountId per platform. If ZERNIO_ACCOUNTS is set in .env,
 * platform names are auto-resolved to account IDs. Otherwise, pass account_ids directly.
 */
export async function schedulePost(params: {
  project: string;
  env: Record<string, string>;
  content: string;
  platforms: string[];
  scheduledFor: string;
  timezone?: string;
  accountIds?: Record<string, string>;
  mediaUrls?: string[];
}): Promise<{ scheduled: boolean; postId: string; post: unknown }> {
  const { apiKey, accounts: envAccounts } = loadEnv(params.env);
  const accountMap = params.accountIds || envAccounts;

  // Build platforms array with accountId per platform
  const platforms = params.platforms.map((p) => {
    const accountId = accountMap?.[p];
    if (!accountId) {
      throw new Error(
        `No account ID for platform "${p}". Either:\n` +
          "  - Pass account_ids in the tool call, or\n" +
          '  - Set ZERNIO_ACCOUNTS={"' + p + '":"acc_xxx"} in .env\n' +
          "  - Run gtm_zernio_accounts to discover your account IDs"
      );
    }
    return { platform: p, accountId };
  });

  // Auto-append UTM params to any gettailor.ai links in the post content
  const contentWithUtm = appendUtmToContent(
    params.content,
    params.platforms,
    undefined // postId not known yet — Zernio assigns it
  );

  const body: Record<string, unknown> = {
    content: contentWithUtm,
    platforms,
    scheduledFor: params.scheduledFor,
  };

  if (params.timezone) {
    body.timezone = params.timezone;
  }

  if (params.mediaUrls && params.mediaUrls.length > 0) {
    body.mediaItems = params.mediaUrls.map((url) => ({
      type: url.match(/\.(mp4|mov|webm)$/i) ? "video" : "image",
      url,
    }));
  }

  const result = (await zernioFetch("/posts", apiKey, {
    method: "POST",
    body,
  })) as { post?: ZernioPostResponse };

  const post = result.post || result;
  const postId = (post as ZernioPostResponse)._id || "unknown";

  return { scheduled: true, postId, post };
}

/**
 * List scheduled/queued posts.
 */
export async function listScheduled(params: {
  project: string;
  env: Record<string, string>;
  limit?: number;
}): Promise<{ posts: unknown[] }> {
  const { apiKey } = loadEnv(params.env);

  let endpoint = "/posts?status=scheduled";
  if (params.limit) {
    endpoint += `&limit=${params.limit}`;
  }

  const result = (await zernioFetch(endpoint, apiKey)) as { posts?: unknown[]; data?: unknown[] };
  return { posts: result.posts || result.data || (Array.isArray(result) ? result : []) };
}

/**
 * Publish a scheduled post immediately using publishNow flag.
 */
export async function publishNow(params: {
  project: string;
  env: Record<string, string>;
  postId: string;
}): Promise<{ published: boolean; result: unknown }> {
  const { apiKey } = loadEnv(params.env);

  // Zernio API: PATCH the post with publishNow: true to publish immediately
  const result = await zernioFetch(`/posts/${params.postId}`, apiKey, {
    method: "PATCH",
    body: { publishNow: true },
  });

  return { published: true, result };
}

/**
 * Delete a scheduled post.
 */
export async function deletePost(params: {
  project: string;
  env: Record<string, string>;
  postId: string;
}): Promise<{ deleted: boolean; result: unknown }> {
  const { apiKey } = loadEnv(params.env);

  const result = await zernioFetch(`/posts/${params.postId}`, apiKey, {
    method: "DELETE",
  });

  return { deleted: true, result };
}
