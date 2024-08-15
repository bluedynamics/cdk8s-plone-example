import { Construct } from 'constructs';
import { App, Chart, ChartProps } from 'cdk8s';
import { Plone, PloneHttpcache } from '@bluedynamics/cdk8s-plone';
import * as kplus from 'cdk8s-plus-24';
import * as path from 'path';
import { IngressChart } from './ingress';
import { config } from 'dotenv';
import { PGBitnamiChart } from './postgres.bitnami';
import { PGZalandoChart } from './postgres.zalando';

export class ExampleChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    config();

    // ================================================================================================================
    // Postgresql
    let db: PGBitnamiChart | PGZalandoChart;
    if ((process.env.DATABASE ?? 'zalando') == 'bitnami') {
      db = new PGBitnamiChart(this, 'db');
    } else {
      db = new PGZalandoChart(this, 'db');
    }

    // ================================================================================================================
    // Plone

    // prepare the environment variables for the plone deployment
    const dbMDName = db.dbServiceName
    const env = new kplus.Env(
      [],
      {
        SECRET_POSTGRESQL_USERNAME: { valueFrom: { secretKeyRef: { name: `plone.${dbMDName}.credentials.postgresql.acid.zalan.do`, key: 'username' }}},
        SECRET_POSTGRESQL_PASSWORD: { valueFrom: { secretKeyRef: { name: `plone.${dbMDName}.credentials.postgresql.acid.zalan.do`, key: 'password' }}},
        INSTANCE_db_storage: { value: `relstorage` },
        INSTANCE_db_blob_mode: { value: `cache` },
        INSTANCE_db_cache_size: { value: `5000` },
        INSTANCE_db_cache_size_bytes: { value: `1500MB` },
        INSTANCE_db_relstorage: { value: `postgresql` },
        INSTANCE_db_relstorage_postgresql_dsn: { value: `host='${dbMDName}' dbname='plone' user='$(SECRET_POSTGRESQL_USERNAME)' password='$(SECRET_POSTGRESQL_PASSWORD)'` },
        INSTANCE_db_relstorage_cache_local_mb: { value: `800` },
      },
    );

    // create the plone deployment and related resources
    const plone = new Plone(this, 'plone', {
      version: 'test.version',
      backend: {
        image: process.env.PLONE_BACKEND_IMAGE ?? 'ghcr.io/bluedynamics/mximages-plone/mx-plone-backend:main',
        environment: env,
      },
      frontend: {
        image: process.env.PLONE_FRONTEND_IMAGE ?? 'ghcr.io/bluedynamics/mximages-plone/mx-plone-frontend:main',
      },
    })

    // ================================================================================================================
    // Varnish with kube-httpcache
    const httpcache = new PloneHttpcache(
      this,
      'httpcache',
      {
        plone: plone,
        varnishVclFile: path.join(__dirname, 'config', 'varnish.tpl.vcl'),
      }
    )

    // ================================================================================================================
    // Ingress
    new IngressChart(
      this,
      'ingress',
      {
        ingressType: 'traefik',
        issuer: process.env.CLUSTER_ISSUER ?? 'letsencrypt-prod',
        domainCached: process.env.DOMAIN_CACHED ?? 'mxplone-cached.example.com',
        domainUncached: process.env.DOMAIN_UNCACHED ?? 'mxplone-cached.example.com',
        domainMaintenance: process.env.DOMAIN_UNCACHED ?? 'mxplone-maintenance.example.com',
        backendServiceName: plone.backendServiceName,
        frontendServiceName: plone.frontendServiceName ?? '',
        httpcacheServiceName: httpcache.httpcacheServiceName,
      });
  }
}

const app = new App();
new ExampleChart(app, 'example');
app.synth();
