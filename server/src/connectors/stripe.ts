import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

/**
 * Stripe connector — pulls MRR, subscriber counts, and revenue metrics.
 *
 * Uses STRIPE_SECRET_KEY from project env (already set in TAILOR's .env.local).
 * Calls Stripe REST API directly — no additional dependencies needed.
 *
 * Metrics pulled:
 *   - mrr: Monthly Recurring Revenue (sum of active subscription amounts)
 *   - active_subscriptions: count of active subs
 *   - trialing_subscriptions: count of trialing subs
 *   - revenue_30d: total charges in last 30 days
 *   - new_customers_30d: customers created in last 30 days
 *   - churned_30d: subscriptions canceled in last 30 days
 */

const STRIPE_API = "https://api.stripe.com/v1";

interface StripeConfig {
  enabled: boolean;
}

async function stripeFetch(
  endpoint: string,
  secretKey: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${STRIPE_API}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Stripe API error: ${response.status} ${response.statusText} ${body}`);
  }

  return response.json();
}

interface StripeSubscription {
  id: string;
  status: string;
  items: {
    data: {
      price: {
        unit_amount: number | null;
        recurring: { interval: string; interval_count: number } | null;
      };
      quantity: number;
    }[];
  };
}

interface StripeListResponse<T> {
  data: T[];
  has_more: boolean;
}

/**
 * Calculate monthly amount for a subscription item,
 * normalizing quarterly/yearly to monthly.
 */
function monthlyAmount(item: StripeSubscription["items"]["data"][0]): number {
  const amount = item.price.unit_amount || 0;
  const qty = item.quantity || 1;
  const interval = item.price.recurring?.interval || "month";
  const intervalCount = item.price.recurring?.interval_count || 1;

  const totalCents = amount * qty;

  switch (interval) {
    case "day":
      return (totalCents / intervalCount) * 30;
    case "week":
      return (totalCents / intervalCount) * 4.33;
    case "month":
      return totalCents / intervalCount;
    case "year":
      return totalCents / (intervalCount * 12);
    default:
      return totalCents;
  }
}

export class StripeConnector implements Connector {
  name = "stripe";
  enabled: boolean;

  constructor(config: StripeConfig) {
    this.enabled = config.enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const secretKey = (project as unknown as { env: Record<string, string> }).env?.STRIPE_SECRET_KEY;

    if (!secretKey) {
      return {
        channel: "stripe",
        updated_at: new Date().toISOString(),
        metrics: {},
        raw: {
          error: "Missing STRIPE_SECRET_KEY in .env",
          setup: "Add STRIPE_SECRET_KEY to your project .env or TAILOR's .env.local",
        },
      };
    }

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const errors: Record<string, string> = {};

    // ── Active subscriptions → MRR ──
    let mrr = 0;
    let activeCount = 0;
    let trialingCount = 0;

    try {
      // Fetch active subscriptions (paginate to get all)
      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params: Record<string, string> = {
          status: "active",
          limit: "100",
        };
        if (startingAfter) params.starting_after = startingAfter;

        const result = (await stripeFetch("/subscriptions", secretKey, params)) as StripeListResponse<StripeSubscription>;

        for (const sub of result.data) {
          activeCount++;
          for (const item of sub.items.data) {
            mrr += monthlyAmount(item);
          }
          startingAfter = sub.id;
        }

        hasMore = result.has_more;
      }

      // Trialing subscriptions
      const trialing = (await stripeFetch("/subscriptions", secretKey, {
        status: "trialing",
        limit: "100",
      })) as StripeListResponse<StripeSubscription>;
      trialingCount = trialing.data.length;
    } catch (err) {
      errors.subscriptions = String(err);
    }

    // ── Revenue last 30 days ──
    let revenue30d = 0;
    try {
      const charges = (await stripeFetch("/charges", secretKey, {
        "created[gte]": String(thirtyDaysAgo),
        limit: "100",
        status: "succeeded",
      })) as StripeListResponse<{ amount: number }>;

      for (const charge of charges.data) {
        revenue30d += charge.amount;
      }
    } catch (err) {
      errors.charges = String(err);
    }

    // ── New customers last 30 days ──
    let newCustomers30d = 0;
    try {
      const customers = (await stripeFetch("/customers", secretKey, {
        "created[gte]": String(thirtyDaysAgo),
        limit: "100",
      })) as StripeListResponse<unknown>;
      newCustomers30d = customers.data.length;
    } catch (err) {
      errors.customers = String(err);
    }

    // ── Churned subscriptions last 30 days ──
    let churned30d = 0;
    try {
      const canceled = (await stripeFetch("/subscriptions", secretKey, {
        status: "canceled",
        "current_period_end[gte]": String(thirtyDaysAgo),
        limit: "100",
      })) as StripeListResponse<unknown>;
      churned30d = canceled.data.length;
    } catch (err) {
      errors.churn = String(err);
    }

    // Convert cents to dollars
    const metrics: Record<string, number | null> = {
      mrr: Math.round(mrr) / 100, // cents → dollars
      active_subscriptions: activeCount,
      trialing_subscriptions: trialingCount,
      revenue_30d: Math.round(revenue30d) / 100,
      new_customers_30d: newCustomers30d,
      churned_30d: churned30d,
    };

    // Write metrics file
    const metricsPath = path.join(project.dataDir, "metrics", "stripe.md");
    const metricsDir = path.dirname(metricsPath);
    if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

    const output = matter.stringify(
      `\n## Stripe Metrics\n\nMRR: $${metrics.mrr}\nActive Subs: ${activeCount}\nTrialing: ${trialingCount}\nRevenue (30d): $${metrics.revenue_30d}\nNew Customers (30d): ${newCustomers30d}\nChurned (30d): ${churned30d}\n`,
      {
        channel: "stripe",
        updated_at: new Date().toISOString(),
        ...metrics,
      }
    );
    fs.writeFileSync(metricsPath, output, "utf-8");

    return {
      channel: "stripe",
      updated_at: new Date().toISOString(),
      metrics,
      raw: { errors: Object.keys(errors).length > 0 ? errors : undefined },
    };
  }
}
