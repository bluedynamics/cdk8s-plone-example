import { Construct } from 'constructs';
import { App, Chart, ChartProps } from 'cdk8s';
import { Plone } from '@bluedynamics/cdk8s-plone';
import * as kplus from 'cdk8s-plus-24';
import * as pgop from './imports/acid.zalan.do'

export class ExampleChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    const dbname = 'plone';
    const dbuser = 'plone';
    const dbpass = 'admin@plone';
    const mximageversion_backend = 'sha-94c84dc';
    const mximageversion_frontend = 'sha-ffd2b1e';

    var dbServiceName = 'localhost';

    new pgop.Postgresql(
      this,
      'db',
      {
        spec: {
          numberOfInstances: 2,
          teamId: 'plone',
          postgresql: { version: pgop.PostgresqlSpecPostgresqlVersion.VALUE_16 },
          volume: { size: '10Gi' },
        }
      }
    );

    const env = new kplus.Env(
      [],
      {
        INSTANCE_db_storage: { value: `relstorage` },
        INSTANCE_db_blob_mode: { value: `cache` },
        INSTANCE_db_cache_size: { value: `5000` },
        INSTANCE_db_cache_size_bytes: { value: `1500MB` },
        INSTANCE_db_relstorage: { value: `postgresql` },
        INSTANCE_db_relstorage_postgresql_dsn: { value: `host='${dbServiceName}' dbname='${dbname}' user='${dbuser}' password='${dbpass}'` },
        INSTANCE_db_relstorage_cache_local_mb: { value: `800` },
      },
    );
    new Plone(this, 'plone', {
      version: 'test.version',
      backend: {
        image: `ghcr.io/bluedynamics/mximages-plone/mx-plone-backend:${mximageversion_backend}`,
        environment: env,
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
