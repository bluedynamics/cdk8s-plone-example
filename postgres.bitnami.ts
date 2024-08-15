import { Construct } from 'constructs';
import { Helm } from 'cdk8s';

export class PGBitnamiChart extends Construct {
    public readonly dbServiceName: string;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const dbname = 'plone';
        const dbuser = 'plone';
        const dbpass = 'admin@plone';

        const db = new Helm(this, 'db', {
            chart: 'postgresql',
            repo: 'https://charts.bitnami.com/bitnami',
            // XXX: in fact I do not want a namespace here.
            // I want to use the passed in with kubectl apply.
            // need to figure out how to achieve this. Could be bitnami specific.
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
            if ((construct.kind === 'Service') && (construct.metadata.name?.endsWith('postgresql'))) {
                return construct.name;
            }
            return undefined;
        });
        if (dbService === undefined) {
            throw new Error('Could not find postgresql service');
        }
        this.dbServiceName = dbService.name;
    }
};
