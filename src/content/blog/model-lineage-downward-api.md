---
title: "Who Trained This Model? Passing Identity Through the Downward API"
description: "Every model registered in MLflow should be traceable to a real person, even when the training pipeline runs under a shared service account. Here's how a pod label became an audit trail."
pubDate: "Oct 19 2026"
draft: true
---

Our ML platform gives data scientists two ways to train models. They can work in a JupyterHub notebook, or launch [Flyte](https://flyte.org/) workflows, which run each step as a Kubernetes pod. Either way, experiment runs and registered models get tracked in [MLflow](https://mlflow.org/).

The notebooks already handled identity: each user logs in, so their runs carry their name. Flyte workflows launched from someone's laptop didn't. The pods authenticated to MLflow as a shared service account, so every run and registered model showed the same generic user. Ask "who trained this model?" and the honest answer was "someone with access to Flyte".

For an audit trail, that's a real gap. If a model misbehaves in production, the first question is who owns it.

## The identity was already there

The fix started with noticing something we already had. When Flyte launches a workflow, it records who launched it, using the identity from their OIDC login, and our setup puts that username on each task pod as a **label**. Kubernetes knew who started every pod. The training code just couldn't see it.

Code running in a pod could look up its own labels through the Kubernetes API, but that needs a service account with permission to read pods, plus an API call at startup. That's more machinery and more permissions than the job deserves.

## The Downward API

Kubernetes has a built-in feature for exactly this: the **Downward API** exposes a pod's own metadata to its containers, either as environment variables or as files. A pod label can become an environment variable with a `fieldRef`:

```yaml
env:
  - name: EXECUTION_IDENTITY
    valueFrom:
      fieldRef:
        fieldPath: metadata.labels['<identity-label-key>']
```

The kubelet fills in the value when the container starts. No API call and no extra permissions are needed, because the pod is only reading information about itself. In our case, the change was a few lines in the Helm values template that defines Flyte's default pod spec, so every task pod in every workflow got the variable automatically, and no one had to change their workflow code.

## Getting it into MLflow

Having the variable in the pod is only half of it. MLflow has to use it. Our data scientists use an internal Python package that wraps the MLflow client and handles authentication. I changed its `authenticate()` step to check for the identity variable. When it's present, which means the code is running in a Flyte pod, the run is attributed to that user instead of the service account. When it's absent, as on a laptop or in a notebook, nothing changes.

Because this sits in the client package everyone already imports, nobody had to change how they log runs. The change shipped with unit tests for both paths, inside a Flyte pod and outside one.

The result is lineage from end to end. A person launches a workflow from their machine, Flyte records who they are, Kubernetes passes that into the pod, and MLflow attributes the run and the registered model to them.

## Attribution, not authentication

There's an important limit here. This tells you **who launched** the workflow, according to the platform. It doesn't prove anything on its own. The value is only as trustworthy as the label. It works because the platform sets the label, not the user. If users can set arbitrary labels on their own pods, they can claim to be anyone, so that's worth checking before relying on it.

So I'd describe this as attribution for an audit trail: good for answering "who do I ask about this model?", not a security control. Access control still happens at authentication time. Writing that limit down in the design notes mattered as much as the code, so nobody later mistakes the field for something stronger than it is.

## What I took from it

- **Check what the platform already knows before building something new.** The identity was on every pod already. The whole fix was carrying it the last few metres.
- **Prefer the smallest mechanism that does the job.** The Downward API needs no RBAC, no client library, and no network call. An API lookup would have worked too, at the cost of permissions and code to maintain.
- **Put cross-cutting fixes where everyone already is.** Changing the shared pod template and the shared client package meant zero changes to anyone's workflows.
