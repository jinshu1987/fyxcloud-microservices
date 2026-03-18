/**
 * Billing Service — Stripe subscriptions, checkout, webhooks, and license management.
 */
import express from "express";
import helmet from "helmet";
import Stripe from "stripe";
import { getDb } from "../shared/db.js";
import { log, logError } from "../shared/logger.js";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });
const db = getDb();

app.set("trust proxy", 1);
app.use(helmet());

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        const plan = session.metadata?.plan;
        if (orgId && plan) {
          await db.insert(db.schema.subscriptions).values({ id: crypto.randomUUID(), orgId, plan, status: "active", stripeCustomerId: session.customer as string, stripeSubscriptionId: session.subscription as string, currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }).onConflictDoUpdate({ target: db.schema.subscriptions.orgId, set: { plan, status: "active", stripeCustomerId: session.customer as string, stripeSubscriptionId: session.subscription as string } });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db.update(db.schema.subscriptions).set({ status: "canceled" }).where(db.schema.subscriptions.stripeSubscriptionId.eq(sub.id));
        break;
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    logError("Webhook processing error", "billing", err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.json());

app.post("/api/billing/create-checkout-session", async (req, res) => {
  try {
    const { orgId, plan, isAnnual } = req.body;
    const PRICES: Record<string, { monthly: string; annual: string }> = {
      starter:      { monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID!,  annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID! },
      professional: { monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,      annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID! },
      enterprise:   { monthly: process.env.STRIPE_ENT_MONTHLY_PRICE_ID!,      annual: process.env.STRIPE_ENT_ANNUAL_PRICE_ID! },
    };
    const priceId = isAnnual ? PRICES[plan]?.annual : PRICES[plan]?.monthly;
    if (!priceId) return res.status(400).json({ error: "Invalid plan" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/billing?success=true`,
      cancel_url: `${process.env.APP_URL}/billing?canceled=true`,
      metadata: { orgId, plan },
    });
    res.json({ url: session.url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get("/api/billing/subscription/:orgId", async (req, res) => {
  try {
    const subscription = await db.query.subscriptions.findFirst({ where: (s: any, { eq }: any) => eq(s.orgId, req.params.orgId) });
    const license = await db.query.licenses.findFirst({ where: (l: any, { eq }: any) => eq(l.orgId, req.params.orgId) });
    res.json({ subscription, license });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post("/api/billing/portal", async (req, res) => {
  try {
    const { orgId } = req.body;
    const subscription = await db.query.subscriptions.findFirst({ where: (s: any, { eq }: any) => eq(s.orgId, orgId) });
    if (!subscription?.stripeCustomerId) return res.status(404).json({ error: "No subscription found" });
    const session = await stripe.billingPortal.sessions.create({ customer: subscription.stripeCustomerId, return_url: `${process.env.APP_URL}/billing` });
    res.json({ url: session.url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "billing-service" }));

const PORT = parseInt(process.env.PORT || "3005", 10);
app.listen(PORT, () => log(`Billing service listening on port ${PORT}`, "billing"));
