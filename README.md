# example how to use  cdk8s-plone

- `main.ts` uses Zalando Postgres-Operator to create a PostgreSQL database
- `main.bitnami.ts` uses Bitnami postgres helm chart to create a PostgreSQL database

(rename files to use latter)

Generate with

```bash
cdk8s synth
```

Note: Zalandos `postgresqls.yaml` file was [downloaded from Operators 1.12.2 Tag](https://raw.githubusercontent.com/zalando/postgres-operator/v1.12.2/charts/postgres-operator/crds/postgresqls.yaml) and modified to fix it.
There were two kind of duplicate entries which resulted in errors generating the CRD in TypeScript: `initContainers` and `init_containers` (latter were removed), `podPriorityClassName` and `pod_priority_class_name` (latter were removed).
