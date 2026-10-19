---
title: "The SLA Rules That Never Fired"
description: "Debugging a model-health dashboard that stayed red: a label filter that matched nothing, counters scraped through a Service, and why 'no data' should be treated as a failure."
pubDate: "Oct 19 2026"
draft: true
---

One of the bigger projects I worked on was a health dashboard for the ML models our platform serves. The goal was a single view that answers "are the models OK?" for people who will never open Prometheus. Each model gets a status from a few signals: availability, p95 latency, and error rate, compared against that model's SLA thresholds.

The plumbing is standard. Services expose Prometheus metrics, [Grafana Alloy](https://grafana.com/docs/alloy/latest/) scrapes them and writes them to Mimir, and **recording rules** precompute the per-model numbers the dashboard reads.

For a while, one column was solid red for every model. This post is about why, and about a few other ways metrics can look fine while being wrong.

## Recording rules in one paragraph

A recording rule runs a PromQL query on a schedule and saves the result as a new time series. Instead of having the dashboard compute a p95 from raw histogram buckets for every model on every refresh, a rule computes it once a minute and stores it under a name like `model:p95_latency_ms:5m`. That name follows the `level:metric:operations` convention: the label it's aggregated by, what it measures, and how. Dashboards and alerts then read the cheap precomputed series.

```yaml
groups:
  - name: model-sla
    rules:
      - record: model:p95_latency_ms:5m
        expr: |
          1000 * histogram_quantile(0.95,
            sum by (model, le) (rate(request_duration_seconds_bucket{job="<scrape job>"}[5m]))
          )
      - record: model:availability_percent:5m
        expr: |
          100 * (
            sum by (model) (rate(requests_total{job="<scrape job>", code!~"5.."}[5m]))
            / sum by (model) (rate(requests_total{job="<scrape job>"}[5m]))
          )
```

(The metric names here are simplified, not the real ones.)

## Bug 1: a filter that matched nothing

The rules filtered on the `job` label, as in the example above. In Alloy, a `prometheus.scrape` component sets `job` to its own component name by default, so metrics scraped by a component called `prometheus.scrape.pods` get `job="prometheus.scrape.pods"`.

The rules were written for the pod scrape job. But the metrics they needed were actually being collected by a *different* component, the one that scrapes Services, so the series carried `job="prometheus.scrape.services"`. The selector matched zero series. Every rule returned nothing, every recorded series was empty, and the dashboard treated "no data" as "not healthy".

Nothing errored. Prometheus doesn't complain when a selector matches nothing; it simply returns an empty result. The rules loaded, ran on schedule, and quietly produced nothing.

Once I found it, the fix was a small change to the scrape config. Finding it took longer, because I first had to rule out the metrics, the thresholds, and the dashboard query. The fastest check turned out to be running each rule's expression by hand in Grafana Explore, then removing label matchers one at a time until data came back.

## Bug 2: counters scraped through a Service

While I was in there, I found a subtler problem. Some services were scraped through their Kubernetes **Service** instead of each pod directly.

A Service load-balances, so each scrape lands on whichever pod the Service picks. Every pod has its own counter, so the "single" series Prometheus records jumps between different pods' values from one scrape to the next. To `rate()`, a counter that drops looks like a restart, so the computed rates come out wrong. It got worse when a model sat idle, because then the jumps were all there was.

The fix was to scrape **pods**, not Services, so each pod is its own series with its own `pod` label, then sum by `model` in the rule. I also had to make sure each pod was scraped exactly once. A pod that was picked up by both scrape jobs would be counted twice.

To trust the result, I compared it with ground truth. NVIDIA Triton exports its own request counter, `nv_inference_count`, so I ran a load test and checked that our per-model request rates matched Triton's own numbers for the same window. Until they matched, I didn't believe any dashboard built on top of them.

## Bug 3: "no data" looked like an outage

The dashboard showed missing data as red. That's arguably the safe default: if you can't see a model, you shouldn't call it healthy. But it meant a monitoring bug and a real outage looked exactly the same, which is how a broken rule could pass as "that model's unhealthy".

What I'd want next time:

- **Alert on missing rule output.** For example, `absent(model:availability_percent:5m)` fires when a recording rule produces nothing at all, which separates "the monitoring is broken" from "the model is broken".
- **Show a different state for no data.** Grey with "no data" is honest. Red sends someone after the wrong problem.
- **Test rules before deploying them.** `promtool test rules` runs recording and alerting rules against synthetic series in a unit test, so a selector that matches nothing fails in CI instead of in production.

## Simplifying before production

By the time everything worked in staging, the rule file had grown with experiments: rules for signals we didn't end up using, and intermediate steps nothing read. Before promoting to production I cut it down to the rules the dashboard and alerts actually use. The diff deleted roughly three times as many lines as it added. Every rule is something someone has to understand later, and it costs a little evaluation time every minute, forever.

## What I took from it

- **An empty result is the default failure mode in Prometheus.** Selectors that match nothing don't error. Assume they can, and build checks for it.
- **Know where every label comes from.** `job`, `instance`, and `pod` are set by the scrape config, not your application. A rule filtering on them is coupled to the scrape config, whether or not anyone wrote that down.
- **Check your metrics against an independent source.** If the system you're monitoring keeps its own count, use it to check yours.
