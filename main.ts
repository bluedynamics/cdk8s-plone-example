import { Construct } from 'constructs';
import { App, Chart, ChartProps, Helm } from 'cdk8s';
import { Plone } from '@bluedynamics/cdk8s-plone';
import * as kplus from 'cdk8s-plus-24';

export class ExampleChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = { }) {
    super(scope, id, props);

    const dbname = 'plone';
    const dbuser = 'plone';
    const dbpass = 'admin@plone';
    const mximageversion_backend = 'sha-94c84dc';
    const mximageversion_frontend = 'sha-ffd2b1e';

    const db = new Helm(this, 'db', {
      chart: 'bitnami/postgresql',
      // TODO: figure out why repo: 'https://charts.bitnami.com/bitnami', does not work
      // in fact I do not want a namespace here. I want to use the passed in with kubectl apply.
      // need to figure out how to achieve this
      namespace: 'plone',
      values: {
        'commonLabels': { 'app.kubernetes.io/part-of': 'plone' },
        'global': {
          'postgresql': {
            'postgresPassword': 'admin@postgres',
            'username': dbuser,
            'password': dbpass,
            'database': dbname,
          },
        },
        'auth': {
          'username': dbuser,
          'password': dbpass,
          'database': dbname,
        }
      }
    });

    const dbService = db.apiObjects.find(construct => {
      if ((construct.kind === 'Service') &&  (construct.metadata.name?.endsWith('postgresql'))) {
        return construct.name;
      }
      return undefined;
    });
    if (dbService === undefined) {
      throw new Error('Could not find postgresql service');
    }
    const env = new kplus.Env(
      [],
      {
        INSTANCE_db_storage: { value: `relstorage` },
        INSTANCE_db_blob_mode: { value: `cache` },
        INSTANCE_db_cache_size: { value: `5000` },
        INSTANCE_db_cache_size_bytes: { value: `1500MB` },
        INSTANCE_db_relstorage: { value: `postgresql` },
        INSTANCE_db_relstorage_postgresql_dsn: { value: `host='${dbService.name}' dbname='${dbname}' user='${dbuser}' password='${dbpass}'` },
        INSTANCE_db_relstorage_cache_local_mb: { value: `800` },
      },
    );
    new Plone(this, 'plone', {
      version: 'test.version',
      backend: {
        image: `ghcr.io/bluedynamics/mximages-plone/mx-plone-backend:${mximageversion_backend}`,
        environment : env,
      },
      frontend: {
        image: `ghcr.io/bluedynamics/mximages-plone/mx-plone-frontend:${mximageversion_frontend}`,
      },
    })
  }
}

const app = new App();
new ExampleChart(app, 'cdk8s-plone-example');
app.synth();
