# example how to use cdk8s-plone

This is an example how to use the [@bluedynamics/cdk8s-plone](https://www.npmjs.com/package/@bluedynamics/cdk8s-plone) typescript package.

## Preparation

Configure node like so: `nvm use lts/*`
The run `yarn install`.
Have `./node_modules/.bin` in your PATH (or use `yarn run synth` below).


## Basic usage

Create a file `.env` with the following content:

```bash
# This file contains the environment variables for the project.
# The variables are loaded when "cdk8s synth" is called  file.

# configure domain names
DOMAIN_CACHED=mxplone-cached.example.com
DOMAIN_UNCACHED=mxplone-uncached.example.com
DOMAIN_MAINTENANCE=mxplone-maintenance.example.com

# cluster-issuer-to use (to get an TLS certifcate)
CLUSTER_ISSUER=letsencrypt-prod

# configure the images to use (mxmake based!)
PLONE_FRONTEND_IMAGE=ghcr.io/bluedynamics/mximages-plone/mx-plone-frontend:main
PLONE_BACKEND_IMAGE=ghcr.io/bluedynamics/mximages-plone/mx-plone-backend:main

# configure database settings
DATABASE=zalando
```

Generate with

```bash
cdk8s synth
```

apply with kubectl

## TODO/WIP

- add Traefik Ingress for uncached and maintenance
- solve namespace problem with bitnami chart (see below)
- more configuration parameters in `.env`.
- better documnetation

## Notes

Bitnami Helm chart at the moment needs a namespace `plone` to be present.
This is a bit annnoying, but can be fixed by changing the namespace passed the Helm chart in `postgres.bitnami.ts`.

```bash

Zalandos `postgresqls.yaml` file was [downloaded from Operators 1.12.2 Tag](https://raw.githubusercontent.com/zalando/postgres-operator/v1.12.2/charts/postgres-operator/crds/postgresqls.yaml) and modified to fix it.
There were two kind of duplicate entries which resulted in errors generating the CRD in TypeScript: `initContainers` and `init_containers` (latter were removed), `podPriorityClassName` and `pod_priority_class_name` (latter were removed).
