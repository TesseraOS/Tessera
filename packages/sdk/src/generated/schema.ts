/* eslint-disable */
// AUTO-GENERATED from the /v1 OpenAPI document. Do not edit by hand.
// Regenerate with: pnpm --filter @tessera/sdk generate

export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Liveness probe. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Readiness probe — 503 until dependencies are reachable. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ready" | "not_ready";
                            checks: {
                                name: string;
                                ok: boolean;
                                detail?: string;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ready" | "not_ready";
                            checks: {
                                name: string;
                                ok: boolean;
                                detail?: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Hybrid search across code, memory, and the knowledge graph. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Natural-language or symbol query. */
                        query: string;
                        /** @description Max candidates to return. */
                        limit?: number;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            results: {
                                ref: string;
                                score: number;
                                signals: {
                                    /** @enum {string} */
                                    signal: "semantic" | "keyword" | "graph" | "symbolic" | "temporal";
                                    rank: number;
                                    score: number;
                                    weight: number;
                                    contribution: number;
                                }[];
                                label?: string;
                            }[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/compile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Compile context for a task within a token budget. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The task context is being compiled for. */
                        task: string;
                        /** @description Max tokens the package may occupy. */
                        budget: number;
                        retrievalLimit?: number;
                        /** @description Restrict fragments to these kinds. */
                        filters?: {
                            kinds?: string[];
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            task: string;
                            budget: number;
                            sections: {
                                title: string;
                                fragments: {
                                    ref: string;
                                    text: string;
                                    kind: string;
                                    tokens: number;
                                    score: number;
                                    provenance: {
                                        retrievalScore: number;
                                        signals: ("semantic" | "keyword" | "graph" | "symbolic" | "temporal")[];
                                        expandedFrom?: string;
                                        source?: {
                                            [key: string]: unknown;
                                        };
                                    };
                                    whyIncluded: string;
                                }[];
                            }[];
                            totalTokens: number;
                            trace: {
                                stages: {
                                    stage: string;
                                    inputCount: number;
                                    outputCount: number;
                                    dropped: {
                                        ref: string;
                                        reason: string;
                                    }[];
                                    notes?: string;
                                }[];
                            };
                            scores: {
                                fragmentCount: number;
                                budgetAdherence: number;
                                provenanceCoverage: number;
                                redundancy: number;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/effects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** What is affected if a node changes (ranked, path-bearing). */
        get: {
            parameters: {
                query: {
                    /** @description Kind of the node whose dependents to find. */
                    kind: "file" | "symbol" | "module" | "person" | "decision" | "memory";
                    /** @description Natural key of the node (e.g. a file path or symbol). */
                    key: string;
                    maxDepth?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            effects: {
                                nodeId: string;
                                node: {
                                    id: string;
                                    /** @enum {string} */
                                    kind: "file" | "symbol" | "module" | "person" | "decision" | "memory";
                                    key: string;
                                    label: string;
                                    metadata: {
                                        [key: string]: unknown;
                                    };
                                };
                                path: string[];
                                distance: number;
                                score: number;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/memory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the current memories. */
        get: {
            parameters: {
                query?: {
                    kind?: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                    scope?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            memories: {
                                id: string;
                                lineageId: string;
                                /** @enum {string} */
                                kind: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                                title: string;
                                body: string;
                                scope: string;
                                confidence: number;
                                metadata: {
                                    source?: string;
                                    author?: string;
                                    links?: string[];
                                    tags?: string[];
                                };
                                version: number;
                                supersedes: string | null;
                                supersededBy: string | null;
                                createdAt: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Capture a new memory. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        kind: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                        title: string;
                        body: string;
                        scope?: string;
                        confidence?: number;
                        metadata?: {
                            source?: string;
                            author?: string;
                            links?: string[];
                            tags?: string[];
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            lineageId: string;
                            /** @enum {string} */
                            kind: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                            title: string;
                            body: string;
                            scope: string;
                            confidence: number;
                            metadata: {
                                source?: string;
                                author?: string;
                                links?: string[];
                                tags?: string[];
                            };
                            version: number;
                            supersedes: string | null;
                            supersededBy: string | null;
                            createdAt: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/memory/{lineageId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get the current version of a memory lineage. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    lineageId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            lineageId: string;
                            /** @enum {string} */
                            kind: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                            title: string;
                            body: string;
                            scope: string;
                            confidence: number;
                            metadata: {
                                source?: string;
                                author?: string;
                                links?: string[];
                                tags?: string[];
                            };
                            version: number;
                            supersedes: string | null;
                            supersededBy: string | null;
                            createdAt: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Edit a memory (appends a superseding version). */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    lineageId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        title?: string;
                        body?: string;
                        scope?: string;
                        confidence?: number;
                        metadata?: {
                            source?: string;
                            author?: string;
                            links?: string[];
                            tags?: string[];
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            lineageId: string;
                            /** @enum {string} */
                            kind: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                            title: string;
                            body: string;
                            scope: string;
                            confidence: number;
                            metadata: {
                                source?: string;
                                author?: string;
                                links?: string[];
                                tags?: string[];
                            };
                            version: number;
                            supersedes: string | null;
                            supersededBy: string | null;
                            createdAt: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/memory/{lineageId}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Every version of a memory lineage, oldest first. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    lineageId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            versions: {
                                id: string;
                                lineageId: string;
                                /** @enum {string} */
                                kind: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                                title: string;
                                body: string;
                                scope: string;
                                confidence: number;
                                metadata: {
                                    source?: string;
                                    author?: string;
                                    links?: string[];
                                    tags?: string[];
                                };
                                version: number;
                                supersedes: string | null;
                                supersededBy: string | null;
                                createdAt: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Server-Sent Events stream of live updates — ingest progress and new memories (FR-38). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List subscription plans and their entitlements. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            plans: {
                                /** @enum {string} */
                                id: "free" | "pro" | "enterprise";
                                name: string;
                                priceCents: number;
                                interval: ("month" | "year") | null;
                                entitlements: {
                                    maxMonthlyCompiles: number;
                                    maxSeats: number;
                                    maxTokensPerCompile: number;
                                };
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/subscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The calling tenant's current subscription. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tenantId: string;
                            /** @enum {string} */
                            planId: "free" | "pro" | "enterprise";
                            /** @enum {string} */
                            status: "active" | "trialing" | "past_due" | "canceled";
                            currentPeriodEnd: string | null;
                            externalId?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start a hosted checkout for a paid plan. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        planId: "free" | "pro" | "enterprise";
                        /** Format: uri */
                        successUrl: string;
                        /** Format: uri */
                        cancelUrl: string;
                        /** Format: email */
                        email?: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            url: string;
                            externalId?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Generated OpenAPI document. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Provider billing webhook (signature-verified). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            received: boolean;
                            type: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
