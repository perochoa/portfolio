---
title: "When Terraform Wants to Replace Every Node at Once"
description: "Some fields on an EKS managed node group can't be changed in place. Here's why that matters for the nodes your cluster can't live without, and the blue-green pattern I designed around it."
pubDate: "Oct 19 2026"
draft: true
---

Most of our EKS cluster's nodes are provisioned on demand by [Karpenter](https://karpenter.sh/). Karpenter itself has to run somewhere, though, along with CoreDNS and a few other add-ons that everything else depends on. Those live on a small **managed node group** that Terraform owns. I'll call it the core node group.

This post is about what happens when you need to change that group, and the blue-green design I wrote so a routine change can't take the platform down.

## Some fields can't be updated in place

Terraform's `aws_eks_node_group` resource maps to two kinds of AWS API calls. Some fields can be changed on a running group through `UpdateNodegroupConfig` or `UpdateNodegroupVersion`. Others can only be set when the group is created, so changing them in Terraform plans a **destroy and recreate**:

| Updated in place | Forces replacement |
| --- | --- |
| `scaling_config` (desired, min, max) | `instance_types` |
| `labels`, `taints` | `capacity_type` (on-demand or spot) |
| `launch_template` version | `subnet_ids` |
| Kubernetes and AMI release version | `disk_size` |

The plan output does say `must be replaced`. It's easy to miss in a long plan, and it doesn't tell you what replacement *means* for this particular group.

For the core group, replacement is about the worst outcome there is. Every node goes away together. Karpenter and CoreDNS get evicted with nowhere to reschedule. With Karpenter down, nothing can provision nodes for any other workload, and the platform stays degraded until the new group comes up and the add-ons recover. We found this out the hard way, from what should have been a simple instance-type change.

## Why `create_before_destroy` isn't enough

The obvious Terraform answer is `lifecycle { create_before_destroy = true }`. With a fixed `node_group_name`, that doesn't work: the new group needs the same name as the old one, and EKS rejects the create while the old one still exists.

You can get around the name clash with `node_group_name_prefix`, but it still leaves the cut-over to Terraform. You don't control when workloads move, you can't check the new nodes before the old ones go, and once the apply finishes there's no old group left to roll back to. For the nodes that run the thing that runs your nodes, I wanted every one of those steps to be deliberate.

## Two groups, one of them parked

The design is two managed node groups, `core-blue` and `core-green`, that are identical apart from their names. They share a launch template, an IAM role, and the same labels and taints, so a workload scheduled for "core" can land on either one.

At any time, one group is **active** with its normal size and the other is **standby** at zero nodes. A change that would force replacement is never applied to the active group. Instead:

1. Apply the change to the standby group. Replacing a group with zero nodes is free.
2. Scale the standby group up and wait for its nodes to be `Ready`.
3. Cordon the active group's nodes and drain them. PodDisruptionBudgets keep Karpenter and CoreDNS available while pods move to the other color.
4. Check that everything is healthy on the new color.
5. Scale the old active group to zero. It's now the standby group, ready to roll back to.

Each step is a small targeted Terraform apply or a `kubectl` command, with a check in between. Nothing happens unless someone decides it should.

## Pinning launch template versions

Changes like a new AMI or new user data don't force replacement. They go out as a new launch template version, and the risk there is a bad version that makes nodes fail to join.

So the active color pins a specific, known-good launch template version number, while the standby color tracks `$Latest`. A new version only reaches the standby group. If its nodes come up broken, the active group never noticed, and rolling back means scaling the standby group back to zero.

## The runbook

Design docs are only useful if someone can follow them at 2 a.m., so the doc ends in a runbook. Every command uses `ACTIVE` and `STANDBY` shell variables instead of hard-coded colors, so the same steps work in both directions. It includes:

- pre-flight checks (which color is active, current versions, PDBs in place),
- verification commands after each step,
- and two rollback paths, depending on whether the old color has already been scaled down.

## The alternative I rejected

A reviewer asked whether we could manage these node groups through Kubernetes instead, with [AWS Controllers for Kubernetes](https://aws-controllers-k8s.github.io/community/) driven by ArgoCD, like a lot of our other infrastructure.

For most resources that's a good pattern. For the core group, it's circular. The controller that manages the node group would run *on* the node group it manages, so a bad change could evict the thing that's supposed to fix it. AWS's own Karpenter guidance makes the same point: don't run Karpenter on nodes Karpenter manages. The bootstrap layer has to be managed from outside the cluster, which is why it stays in Terraform. The doc includes a comparison of blast radius, rollback, drift detection, and day-2 operations for both approaches, so the decision and its reasons are written down.

## What I took from it

- **Read `must be replaced` as a design question, not just a warning.** The real question is what replacing this specific resource will do to everything that depends on it.
- **Keep a known-good copy around.** Blue-green is mostly about having something to roll back to, without rebuilding it under pressure.
- **Know which layer bootstraps which.** Anything that manages a resource shouldn't depend on that resource to run.
