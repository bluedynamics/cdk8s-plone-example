import { Construct } from 'constructs';
import { App, Chart, ChartProps } from 'cdk8s';
import { Plone } from '@bluedynamics/cdk8s-plone';
import * as kplus from 'cdk8s-plus-24';
import * as pgop from './imports/acid.zalan.do'

export class ExampleChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    const mximageversion_backend = 'sha-94c84dc';
    const mximageversion_frontend = 'sha-ffd2b1e';

    const db = new pgop.Postgresql(
      this,
      'db',
      {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'plone-postgresql',
            'app.kubernetes.io/instance': 'postgresql',
            'app.kubernetes.io/component': 'database',
            'app.kubernetes.io/part-of': 'plone',
          }
        },
        spec: {
          numberOfInstances: 2,
          allowedSourceRanges: ['10.0.0.0/8'],
          postgresql: { version: pgop.PostgresqlSpecPostgresqlVersion.VALUE_15 },
          volume: { size: '1Gi' },
          databases: {
            plone: 'plone',
          },
          teamId: 'plone',
          users: {
            plone: [
              pgop.PostgresqlSpecUsers.SUPERUSER,
              pgop.PostgresqlSpecUsers.CREATEDB,
            ],
          },
          resources: {
            limits: {
              cpu: '1000m',
              memory: '1Gi',
            },
            requests: {
              cpu: '300m',
              memory: '400Mi',
            },
          },
        }
      }
    );
    // const dbService = db.node.find(construct => {
    //   log(construct.metadata.name);
    //   if ((construct.kind === 'Service') && (construct.metadata.name?.endsWith('postgresql'))) {
    //     return construct.name;
    //   }
    //   return undefined;
    // });
    const dbMDName = db.metadata.name;
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
