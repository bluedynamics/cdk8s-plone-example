import { Construct } from 'constructs';
import { App, Chart, ChartProps, Helm } from 'cdk8s';
import { Plone } from 'cdk8s-plone';
import * as kplus from 'cdk8s-plus-24';

export class MyChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = { }) {
    super(scope, id, props);

    const dbname = 'plone';
    const dbuser = 'plone';
    const dbpass = 'admin@plone';

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
    const env = new kplus.Env([], { RELSTORAGE_DSN: { value: `host='${dbService.name}' dbname='${dbname}' user='${dbuser}' password='${dbpass}'` } });
    new Plone(this, 'plone', {
      'version': 'test.version',
      'backend': {
        'environment' : env,
      },
    })

  }
}

const app = new App();
new MyChart(app, 'cdk8s-plone-example');
app.synth();
