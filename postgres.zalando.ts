import { Construct } from 'constructs';
import * as pgop from './imports/acid.zalan.do'

export class PGZalandoChart extends Construct {
    // uses the Zalando postgres operator

    public readonly dbServiceName: string;

    constructor(scope: Construct, id: string,) {
        super(scope, id);
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
        this.dbServiceName = db.metadata.name as string;
    }
}