/**
 * Google Ads API — write operations for creating/managing ad campaigns.
 *
 * API version: v23
 * Base URL: https://googleads.googleapis.com/v23
 *
 * Required env vars:
 *   GOOGLE_ADS_DEVELOPER_TOKEN — Developer token from API Center
 *   GOOGLE_ADS_CUSTOMER_ID — Customer ID (format: XXX-XXX-XXXX, stored without dashes)
 *   GOOGLE_CLIENT_ID — OAuth client ID
 *   GOOGLE_CLIENT_SECRET — OAuth client secret
 *   GOOGLE_REFRESH_TOKEN — OAuth refresh token
 *
 * Optional:
 *   GOOGLE_ADS_MANAGER_ID — MCC manager account ID (for login-customer-id header)
 */

const BASE_URL = "https://googleads.googleapis.com/v23";

let cachedToken: { token: string; expiresAt: number } | null = null;

function stripDashes(id: string): string {
  return id.replace(/-/g, "");
}

async function refreshGoogleAccessToken(env: Record<string, string>): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google OAuth credentials. Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

async function googleAdsApiCall(
  env: Record<string, string>,
  endpoint: string,
  method: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const devToken = env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) {
    return {
      error:
        "Missing GOOGLE_ADS_DEVELOPER_TOKEN. Get it from Google Ads > Settings > API Center.",
    };
  }

  const customerId = env.GOOGLE_ADS_CUSTOMER_ID;
  if (!customerId) {
    throw new Error("Missing GOOGLE_ADS_CUSTOMER_ID in .env.");
  }

  const token = await refreshGoogleAccessToken(env);
  const cleanCustomerId = stripDashes(customerId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };

  const managerId = env.GOOGLE_ADS_MANAGER_ID;
  if (managerId) {
    headers["login-customer-id"] = stripDashes(managerId);
  }

  const url = `${BASE_URL}/customers/${cleanCustomerId}${endpoint}`;

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      `Google Ads API returned non-JSON (HTTP ${response.status}). ` +
      `This usually means the API version is sunset or the API is not enabled. ` +
      `Response: ${text.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errors = (data.error as Record<string, unknown>)?.details || data.error;
    throw new Error(
      `Google Ads API error: ${JSON.stringify(errors) || response.statusText}`
    );
  }

  return data;
}

export async function createGoogleCampaign(params: {
  env: Record<string, string>;
  name: string;
  type: string;
  budget_amount_micros: number;
  status?: string;
}): Promise<{ campaign_id: string; budget_id: string; name: string; status: string }> {
  const customerId = stripDashes(params.env.GOOGLE_ADS_CUSTOMER_ID || "");

  // Step 1: Create campaign budget
  const budgetResult = (await googleAdsApiCall(
    params.env,
    "/campaignBudgets:mutate",
    "POST",
    {
      operations: [
        {
          create: {
            name: `${params.name} Budget`,
            amountMicros: params.budget_amount_micros.toString(),
            deliveryMethod: "STANDARD",
          },
        },
      ],
    }
  )) as { results?: { resourceName: string }[]; error?: string };

  if ((budgetResult as Record<string, unknown>).error) {
    throw new Error(String((budgetResult as Record<string, unknown>).error));
  }

  const budgetResourceName = budgetResult.results?.[0]?.resourceName;
  if (!budgetResourceName) {
    throw new Error("Failed to create campaign budget — no resource name returned");
  }

  // Step 2: Create campaign
  const campaignResult = (await googleAdsApiCall(
    params.env,
    "/campaigns:mutate",
    "POST",
    {
      operations: [
        {
          create: {
            name: params.name,
            advertisingChannelType: params.type,
            campaignBudget: budgetResourceName,
            status: params.status || "PAUSED",
            maximizeClicks: {},
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
            },
          },
        },
      ],
    }
  )) as { results?: { resourceName: string }[] };

  const campaignResourceName = campaignResult.results?.[0]?.resourceName || "";
  const campaignId = campaignResourceName.split("/").pop() || "";
  const budgetId = budgetResourceName.split("/").pop() || "";

  return {
    campaign_id: campaignId,
    budget_id: budgetId,
    name: params.name,
    status: params.status || "PAUSED",
  };
}

export async function createGoogleAdGroup(params: {
  env: Record<string, string>;
  campaign_id: string;
  name: string;
  cpc_bid_micros?: number;
  status?: string;
}): Promise<{ ad_group_id: string; name: string; campaign_id: string }> {
  const customerId = stripDashes(params.env.GOOGLE_ADS_CUSTOMER_ID || "");

  const result = (await googleAdsApiCall(
    params.env,
    "/adGroups:mutate",
    "POST",
    {
      operations: [
        {
          create: {
            name: params.name,
            campaign: `customers/${customerId}/campaigns/${params.campaign_id}`,
            cpcBidMicros: (params.cpc_bid_micros || 1_000_000).toString(),
            status: params.status || "ENABLED",
          },
        },
      ],
    }
  )) as { results?: { resourceName: string }[] };

  const resourceName = result.results?.[0]?.resourceName || "";
  const adGroupId = resourceName.split("/").pop() || "";

  return {
    ad_group_id: adGroupId,
    name: params.name,
    campaign_id: params.campaign_id,
  };
}

export async function createGoogleAd(params: {
  env: Record<string, string>;
  ad_group_id: string;
  headlines: string[];
  descriptions: string[];
  final_urls: string[];
  path1?: string;
  path2?: string;
}): Promise<{ ad_id: string; ad_group_id: string; headlines_count: number; descriptions_count: number }> {
  const customerId = stripDashes(params.env.GOOGLE_ADS_CUSTOMER_ID || "");

  const adData: Record<string, unknown> = {
    responsiveSearchAd: {
      headlines: params.headlines.map((h) => ({ text: h })),
      descriptions: params.descriptions.map((d) => ({ text: d })),
    },
    finalUrls: params.final_urls,
  };

  if (params.path1) {
    (adData.responsiveSearchAd as Record<string, unknown>).path1 = params.path1;
  }
  if (params.path2) {
    (adData.responsiveSearchAd as Record<string, unknown>).path2 = params.path2;
  }

  const result = (await googleAdsApiCall(
    params.env,
    "/adGroupAds:mutate",
    "POST",
    {
      operations: [
        {
          create: {
            adGroup: `customers/${customerId}/adGroups/${params.ad_group_id}`,
            ad: adData,
            status: "PAUSED",
          },
        },
      ],
    }
  )) as { results?: { resourceName: string }[] };

  const resourceName = result.results?.[0]?.resourceName || "";
  const adId = resourceName.split("/").pop() || "";

  return {
    ad_id: adId,
    ad_group_id: params.ad_group_id,
    headlines_count: params.headlines.length,
    descriptions_count: params.descriptions.length,
  };
}

export async function updateGoogleCampaign(params: {
  env: Record<string, string>;
  campaign_resource_name: string;
  updates: Record<string, unknown>;
}): Promise<{ success: boolean; campaign_resource_name: string }> {
  const updateMask = Object.keys(params.updates).join(",");

  await googleAdsApiCall(
    params.env,
    "/campaigns:mutate",
    "POST",
    {
      operations: [
        {
          update: {
            resourceName: params.campaign_resource_name,
            ...params.updates,
          },
          updateMask,
        },
      ],
    }
  );

  return { success: true, campaign_resource_name: params.campaign_resource_name };
}

export async function listGoogleCampaigns(params: {
  env: Record<string, string>;
  status?: string;
  limit?: number;
}): Promise<{ campaigns: unknown[] }> {
  const statusFilter = params.status
    ? `WHERE campaign.status = '${params.status}'`
    : "WHERE campaign.status != 'REMOVED'";

  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign ${statusFilter} ORDER BY campaign.id LIMIT ${params.limit || 50}`;

  const result = (await googleAdsApiCall(
    params.env,
    "/googleAds:searchStream",
    "POST",
    { query }
  )) as unknown[];

  const campaigns: unknown[] = [];

  if (Array.isArray(result)) {
    for (const batch of result) {
      const results = (batch as Record<string, unknown>).results as unknown[] | undefined;
      if (Array.isArray(results)) {
        for (const row of results) {
          const r = row as Record<string, unknown>;
          const campaign = r.campaign as Record<string, unknown> | undefined;
          const budget = r.campaignBudget as Record<string, unknown> | undefined;
          if (campaign) {
            campaigns.push({
              id: campaign.id,
              name: campaign.name,
              status: campaign.status,
              type: campaign.advertisingChannelType,
              budget_micros: budget?.amountMicros,
            });
          }
        }
      }
    }
  }

  return { campaigns };
}
