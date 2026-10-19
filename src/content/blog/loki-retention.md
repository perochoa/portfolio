---
title: "retention_enabled: true Doesn't Delete Anything"
description: "An audit of how long our platform actually kept its logs, metrics, and traces. The answer was forever, for three separate reasons."
pubDate: "Oct 19 2026"
draft: true
---

I was asked a simple question at work: how long do we keep our platform's logs? The observability stack is the Grafana LGTM set: Loki for logs, Mimir for metrics, Tempo for traces, all storing their data in S3. Nobody had a confident answer, so I went and looked.

The answer turned out to be **forever**, and not for just one reason. Three separate settings each would have kept the data indefinitely on their own.

## Reason 1: retention switched on, with no period

Loki's compactor has a `retention_enabled` flag, and ours was `true`. That looks like retention is handled. But the flag only turns on the *mechanism*. How long to keep data is a separate setting, `retention_period` under `limits_config`, and it defaults to `0`, which means keep everything. We had never set it.

```yaml
compactor:
  retention_enabled: true      # the mechanism is on...
limits_config:
  retention_period: 0s         # ...but 0 means "never delete" (the default)
```

That's a footgun, and an easy one to miss in a review: the setting called "retention enabled" says yes, so people assume it's done. When I check a config now, I don't stop at the obvious flag. I check that every value it depends on is actually set.

## Reason 2: no lifecycle rules on the buckets

The second safety net would have been S3 lifecycle policies, which delete objects after a set age at the storage layer. None of the observability buckets had one.

## Reason 3: versioning kept everything twice

The buckets also had **versioning** turned on. With versioning, deleting an object doesn't free any space: S3 adds a delete marker and keeps the old version as a "noncurrent" version until a lifecycle rule expires it. So even if Loki *had* been deleting data, the bytes would have stayed in the bucket and kept costing money.

Versioning protects you against overwrites and accidental deletes, which makes sense for human-edited data. Loki, Tempo, and Mimir don't edit objects in place. They write immutable chunks and blocks and manage their own compaction and deletion, so versioning gave us nothing except a second copy of everything they had deleted. I recommended turning it off for these buckets, and that was adopted.

## Mapping the buckets

To reason about any of this, I first needed an inventory, so I built one:

- **Every bucket the stack wrote to**, including load-balancer access logs and buckets left over from older Loki setups, each with its actual retention status (almost always "none").
- **What each S3 prefix holds.** Inside the shared observability bucket, prefixes separate the signals: one for Loki logs, one for Tempo traces, and Mimir metric data under one prefix per tenant. Mapping them showed a few tenant prefixes with names like `anonymous` and `fake`, which meant some data was being written without the right tenant ID.
- **Every log type the collector ships**: application logs from pods, systemd journal logs from nodes, Kubernetes events, and load balancer access logs. I also found config for a security tool that had been removed from the cluster, still sitting in the collector.

That inventory was the most useful thing I produced. Once everyone could see what we actually stored, the discussion moved from guessing to choosing.

## Two levers, used together

There are two independent ways to expire log data, and they do different things:

| | Loki retention (`retention_period`) | S3 lifecycle policy |
| --- | --- | --- |
| Controls | What Loki can still query | Whether the object still exists |
| Aware of Loki's index? | Yes. It removes data consistently | No. It deletes objects by age |
| Granularity | Per tenant, even per stream | Per bucket or prefix |

If you only use an S3 lifecycle rule, objects can disappear while Loki's index still points at them, so queries for that time range fail instead of returning nothing. My recommendation was to make **Loki's retention the primary mechanism**, with an S3 lifecycle rule set *longer* than the Loki period as a backstop. In normal operation the backstop never fires, but if Loki's retention is ever misconfigured again, the data still can't live forever. Mimir and Tempo have their own retention settings, so the same idea applies to each of them separately.

## Presenting options instead of an answer

How long to keep logs isn't purely a technical question. It's a trade-off between cost, debugging needs, and compliance, and the people who own that trade-off aren't the people who configure Loki. So I wrote it up as three options, each with a rough cost:

1. **One retention period** for everything. Simple to run and explain.
2. **Tiered by log type.** Security and audit logs get a longer period than application debug logs. That follows common industry guidance, and Loki supports it with per-stream retention rules.
3. **Short hot retention plus an archive.** Keep a short window queryable in Loki, and move older data to a cheap archival storage class for the rare case someone needs it.

I also wrote a companion page with real log lines for each log type, so the people deciding could see what "application logs" or "Kubernetes events" actually contain. A short real example made the trade-offs much clearer than a description did.

## What I took from it

- **Defaults are decisions someone made for you.** For a storage system, an unset retention almost always means "keep forever".
- **Check every layer.** Application-level retention, storage lifecycle, and versioning each have to agree, and any one of them can quietly undo the others.
- **The inventory is the work.** Once everything was mapped, the recommendation mostly wrote itself.
