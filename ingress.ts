import { Construct } from 'constructs';
import *  as k8s from './imports/k8s';
import * as traefik from './imports/traefik.io';

export interface IngressOptions {

    /**
     * type: konq or traefik
    * @default - traefik
    */
    readonly ingressType?: string;

    /**
     * issuer: cert-manager/cluster-issuer
    * @default none
    */
    readonly issuer: string;

    /**
     * domainCached is the Domain used for the cached setup and should be the main public domain
     * @default - none
     */
    readonly domainCached: string;

    /**
     * domainUncached is the Domain used for the uncached setup and should be the internal for testing pruposes only
     * @default - none
     */
    readonly domainUncached: string;

    /**
     * domainMaintenance is the Domain to access the Plone backend (API) server for maintenance
     * @default - none
     */

    readonly domainMaintenance: string;

    /**
     * frontendServiceName is the K8S Service name of the Plone frontend (Express)
     * @default - none
     */
    readonly frontendServiceName: string;

    /**
     * backendServiceName is the K8S Service name of the Plone backend (API + Blobs)
     * @default - none
     */
    readonly backendServiceName: string;

    /**
     * httpcacheServiceName is the K8S Service name of the http-cache (Varnish)
     * @default - none
     */
    readonly httpcacheServiceName: string;
}


export class IngressChart extends Construct {

    readonly issuer: string;

    constructor(scope: Construct, id: string, options: IngressOptions) {
        super(scope, id);
        this.issuer = options.issuer;
        if (options.ingressType === 'traefik') {
            this.traefikIngress(
                'main',
                'cached',
                options.domainCached,
                '/',
                options.httpcacheServiceName,
                80,
            );
            this.traefikIngress(
                'main',
                'uncached',
                options.domainUncached,
                `/`,
                options.frontendServiceName,
                3000,
            );
            this.traefikIngress(
                'main',
                'maintenance',
                options.domainMaintenance,
                `/`,
                options.backendServiceName,
                8080,
                `/VirtualHostBase/https/${options.domainMaintenance}/VirtualHostRoot/`
            );
        } else if (options.ingressType === 'kong') {

            // Create the ingress for the cached (main) domain
            this.kongIngress(
                'main',
                'cached',
                options.domainCached,
                '/',
                options.httpcacheServiceName,
                80,
            );

            // Create the two ingresses for the uncached (test) domain
            // - to frontend:
            this.kongIngress(
                'uncached',
                'frontend',
                options.domainUncached,
                '/',
                options.frontendServiceName,
                3000,
            );
            // - to backend:
            this.kongIngress(
                'uncached',
                'backend',
                options.domainUncached,
                '/~/((?:(?:\\+\\+api\\+\\+)(?:.*))|(?:(?:.*)/(?:(?:@@images|@@downloads)/.*)))',
                options.backendServiceName,
                8080,
                `/VirtualHostBase/https/${options.domainUncached}/Plone/VirtualHostRoot/$1`,
            );

            // Create the ingress for the maintenance
            this.kongIngress(
                'maintenance',
                'backend',
                options.domainMaintenance,
                '/~/(.*)',
                options.backendServiceName,
                8080,
                `/VirtualHostBase/https/${options.domainMaintenance}/VirtualHostRoot/$1`
            );
        } else {
            throw new Error('Unknown ingress type');
        }
    }

    traefikIngress(prefix: string, postfix: string, domain: string, path: string, backendServiceName: string, backendPort: number, rewrite?: string) {
           var annotations: { [key: string]: string } = {
            'kubernetes.io/ingress.class': 'traefik',
            'cert-manager.io/cluster-issuer': this.issuer,
        };
        if (rewrite !== undefined) {
            const rewritemw = new traefik.Middleware(this, `${prefix}-${postfix}-addprefix`,
                {
                metadata: {},
                    spec: {
                        addPrefix: {
                            prefix: rewrite,
                        },
                    },
                }
            );
            annotations['traefik.ingress.kubernetes.io/router.middlewares'] = `plone-${rewritemw.name}@kubernetescrd`;
        }

        new k8s.KubeIngress(this, `${prefix}-${postfix}`, {
            metadata: {
                annotations: annotations,
            },
            spec: {
                ingressClassName: 'traefik',
                rules: [{
                    host: domain,
                    http: {
                        paths: [{
                            backend: {
                                service: {
                                    name: backendServiceName,
                                    port: { number: backendPort },
                                },
                            },
                            path: path,
                            pathType: 'Prefix',
                        }],
                    },
                }],
            },
        });

    }

    kongIngress(prefix: string, postfix: string, domain: string, path: string, backendServiceName: string, backendPort: number, rewrite?: string) {
        /*
        Create a konq general ingress

        Properties:
        - prefix: prefix for the ingress name used for grouping tls secrets
        - postfix: postfix for the ingress name, used concatenated with the prefix as identifer for the ingress
        - domain: domain for the ingress
        - path: path for the ingress
        - backendServiceName: name of the backend service
        - backendPort: port of the backend service
        - rewrite (optional): rewrite path for the ingress
        */
        var annotations: { [key: string]: string } = {
            'cert-manager.io/cluster-issuer': 'sectigo-issuer',
            'konghq.com/https-redirect-status-code': '308',
            'konghq.com/protocols': 'https',
        };
        if (rewrite !== undefined) {
            annotations['konghq.com/rewrite'] = rewrite;
        }
        new k8s.KubeIngress(this, `${prefix}-${postfix}`, {
            metadata: {
                annotations: annotations,
            },
            spec: {
                ingressClassName: 'kong',
                rules: [{
                    host: domain,
                    http: {
                        paths: [{
                            backend: {
                                service: {
                                    name: backendServiceName,
                                    port: { number: backendPort },
                                },
                            },
                            path: path,
                            pathType: 'Prefix',
                        }],
                    },
                }],
            },
        });
    }
}
