/**
 * Meta Marketing API — write operations for creating/managing ad campaigns.
 *
 * API version: v21.0
 * Base URL: https://graph.facebook.com/v21.0
 *
 * Required env vars:
 *   META_ACCESS_TOKEN — Long-lived access token with ads_management permission
 *   META_AD_ACCOUNT_ID — Ad account ID (without "act_" prefix)
 *
 * Optional env vars:
 *   META_PAGE_ID — Facebook Page ID (required for some ad formats)
 *   META_IG_USER_ID — Instagram user ID (for IG placement)
 */

const BASE_URL = "https://graph.facebook.com/v21.0";

async function metaApiCall(
  env: Record<string, string>,
  endpoint: string,
  method: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const token = env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Missing META_ACCESS_TOKEN in .env. Required for Meta Marketing API write operations."
    );
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${separator}access_token=${token}`;

  const options: RequestInit = { method };
  if (body && method !== "GET") {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json() as Record<string, unknown>;

  if (!response.ok || data.error) {
    const err = data.error as Record<string, unknown> | undefined;
    throw new Error(
      `Meta API error: ${err?.message || response.statusText} (code: ${err?.code || response.status})`
    );
  }

  return data;
}

export async function createMetaCampaign(params: {
  env: Record<string, string>;
  name: string;
  objective: string;
  status?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  special_ad_categories?: string[];
}): Promise<{ id: string; name: string; objective: string; status: string }> {
  const accountId = params.env.META_AD_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("Missing META_AD_ACCOUNT_ID in .env.");
  }

  const body: Record<string, unknown> = {
    name: params.name,
    objective: params.objective,
    status: params.status || "PAUSED",
    special_ad_categories: params.special_ad_categories || ["NONE"],
  };

  if (params.daily_budget !== undefined) {
    body.daily_budget = params.daily_budget;
  }
  if (params.lifetime_budget !== undefined) {
    body.lifetime_budget = params.lifetime_budget;
  }

  const result = (await metaApiCall(
    params.env,
    `/act_${accountId}/campaigns`,
    "POST",
    body
  )) as { id: string };

  return {
    id: result.id,
    name: params.name,
    objective: params.objective,
    status: params.status || "PAUSED",
  };
}

export async function createMetaAdSet(params: {
  env: Record<string, string>;
  campaign_id: string;
  name: string;
  daily_budget?: number;
  lifetime_budget?: number;
  start_time?: string;
  end_time?: string;
  targeting: Record<string, unknown>;
  billing_event?: string;
  optimization_goal?: string;
  status?: string;
}): Promise<{ id: string; name: string; campaign_id: string; status: string }> {
  const accountId = params.env.META_AD_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("Missing META_AD_ACCOUNT_ID in .env.");
  }

  const body: Record<string, unknown> = {
    campaign_id: params.campaign_id,
    name: params.name,
    targeting: params.targeting,
    billing_event: params.billing_event || "IMPRESSIONS",
    optimization_goal: params.optimization_goal || "LINK_CLICKS",
    status: params.status || "PAUSED",
  };

  if (params.daily_budget !== undefined) body.daily_budget = params.daily_budget;
  if (params.lifetime_budget !== undefined) body.lifetime_budget = params.lifetime_budget;
  if (params.start_time) body.start_time = params.start_time;
  if (params.end_time) body.end_time = params.end_time;

  const result = (await metaApiCall(
    params.env,
    `/act_${accountId}/adsets`,
    "POST",
    body
  )) as { id: string };

  return {
    id: result.id,
    name: params.name,
    campaign_id: params.campaign_id,
    status: params.status || "PAUSED",
  };
}

export async function createMetaAd(params: {
  env: Record<string, string>;
  adset_id: string;
  name: string;
  creative: {
    title: string;
    body: string;
    link_url: string;
    image_url?: string;
    call_to_action?: string;
  };
  status?: string;
}): Promise<{ id: string; name: string; adset_id: string; status: string; creative_id: string }> {
  const accountId = params.env.META_AD_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("Missing META_AD_ACCOUNT_ID in .env.");
  }

  const pageId = params.env.META_PAGE_ID;
  if (!pageId) {
    throw new Error("Missing META_PAGE_ID in .env. Required for ad creative.");
  }

  let imageHash: string | undefined;

  // Upload image if provided
  if (params.creative.image_url) {
    const imageResult = (await metaApiCall(
      params.env,
      `/act_${accountId}/adimages`,
      "POST",
      { url: params.creative.image_url }
    )) as { images?: Record<string, { hash: string }> };

    if (imageResult.images) {
      const firstKey = Object.keys(imageResult.images)[0];
      imageHash = imageResult.images[firstKey]?.hash;
    }
  }

  // Build link_data for object_story_spec
  const linkData: Record<string, unknown> = {
    link: params.creative.link_url,
    message: params.creative.body,
    name: params.creative.title,
  };

  if (imageHash) {
    linkData.image_hash = imageHash;
  }

  if (params.creative.call_to_action) {
    linkData.call_to_action = {
      type: params.creative.call_to_action,
      value: { link: params.creative.link_url },
    };
  }

  const body: Record<string, unknown> = {
    name: params.name,
    adset_id: params.adset_id,
    creative: {
      object_story_spec: {
        page_id: pageId,
        link_data: linkData,
      },
    },
    status: params.status || "PAUSED",
  };

  const result = (await metaApiCall(
    params.env,
    `/act_${accountId}/ads`,
    "POST",
    body
  )) as { id: string };

  return {
    id: result.id,
    name: params.name,
    adset_id: params.adset_id,
    status: params.status || "PAUSED",
    creative_id: result.id,
  };
}

export async function updateMetaCampaign(params: {
  env: Record<string, string>;
  campaign_id: string;
  updates: Record<string, unknown>;
}): Promise<{ success: boolean; campaign_id: string }> {
  await metaApiCall(params.env, `/${params.campaign_id}`, "POST", params.updates);

  return { success: true, campaign_id: params.campaign_id };
}

export async function listMetaCampaigns(params: {
  env: Record<string, string>;
  status?: string;
  limit?: number;
}): Promise<{ campaigns: unknown[] }> {
  const accountId = params.env.META_AD_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("Missing META_AD_ACCOUNT_ID in .env.");
  }

  const fields = "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,created_time";
  let endpoint = `/act_${accountId}/campaigns?fields=${fields}`;

  if (params.limit) {
    endpoint += `&limit=${params.limit}`;
  }

  const result = (await metaApiCall(params.env, endpoint, "GET")) as {
    data?: unknown[];
  };

  let campaigns = result.data || [];

  if (params.status) {
    campaigns = campaigns.filter(
      (c) => (c as Record<string, unknown>).status === params.status
    );
  }

  return { campaigns };
}
