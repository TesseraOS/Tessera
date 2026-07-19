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
    "/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The resolved identity, tenant, and effective permissions for the caller. */
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
                            principal: {
                                id: string;
                                /** @enum {string} */
                                kind: "local" | "user" | "token";
                                displayName?: string;
                                roles: ("owner" | "admin" | "member" | "viewer")[];
                            };
                            tenantId: string;
                            permissions: ("search:read" | "compile:read" | "effects:read" | "memory:read" | "memory:write" | "effects:write" | "sources:read" | "sources:manage" | "projects:read" | "projects:manage" | "stats:read" | "admin:manage")[];
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
    "/v1/rbac": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The RBAC catalog: roles, permissions, and role → permissions. */
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
                            roles: ("owner" | "admin" | "member" | "viewer")[];
                            permissions: ("search:read" | "compile:read" | "effects:read" | "memory:read" | "memory:write" | "effects:write" | "sources:read" | "sources:manage" | "projects:read" | "projects:manage" | "stats:read" | "admin:manage")[];
                            rolePermissions: {
                                [key: string]: ("search:read" | "compile:read" | "effects:read" | "memory:read" | "memory:write" | "effects:write" | "sources:read" | "sources:manage" | "projects:read" | "projects:manage" | "stats:read" | "admin:manage")[];
                            };
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
    "/v1/tokens": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the calling tenant's API tokens (no secrets). */
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
                            tokens: {
                                id: string;
                                principalId: string;
                                displayName?: string;
                                roles: ("owner" | "admin" | "member" | "viewer")[];
                                scopes?: ("search:read" | "compile:read" | "effects:read" | "memory:read" | "memory:write" | "effects:write" | "sources:read" | "sources:manage" | "projects:read" | "projects:manage" | "stats:read" | "admin:manage")[];
                                createdAt: string;
                                revokedAt: string | null;
                                expiresAt: string | null;
                                active: boolean;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Issue a scoped API token (the secret is returned once). */
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
                        principalId: string;
                        displayName?: string;
                        roles: ("owner" | "admin" | "member" | "viewer")[];
                        scopes?: ("search:read" | "compile:read" | "effects:read" | "memory:read" | "memory:write" | "effects:write" | "sources:read" | "sources:manage" | "projects:read" | "projects:manage" | "stats:read" | "admin:manage")[];
                        /** Format: date-time */
                        expiresAt?: string;
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
                            token: {
                                id: string;
                                principalId: string;
                                displayName?: string;
                                roles: ("owner" | "admin" | "member" | "viewer")[];
                                scopes?: ("search:read" | "compile:read" | "effects:read" | "memory:read" | "memory:write" | "effects:write" | "sources:read" | "sources:manage" | "projects:read" | "projects:manage" | "stats:read" | "admin:manage")[];
                                createdAt: string;
                                revokedAt: string | null;
                                expiresAt: string | null;
                                active: boolean;
                            };
                            secret: string;
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
    "/v1/tokens/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoke an API token by id. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            /** @enum {boolean} */
                            revoked: true;
                        };
                    };
                };
            };
        };
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
                        /** @description Extras to attach per hit. Ask only for what you will use — each costs tokens. */
                        include?: {
                            /** @description Classify each hit as `file`, `memory`, or `symbol` (+35). */
                            kind?: boolean;
                            /** @description Attach the graph node to pass to `GET /v1/effects`, when the hit has one (+135). */
                            node?: boolean;
                            /** @description Attach a query-relevant excerpt (~+200). */
                            snippet?: {
                                /** @description Ceiling on the excerpt length (default 240). */
                                maxChars?: number;
                            };
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
                                /** @description Human-readable title — a source path, a memory title, or a symbol name. */
                                label?: string;
                                /** @description What this is: `file`, `memory`, or `symbol`. */
                                kind?: string;
                                snippet?: {
                                    text: string;
                                    /** @description Spans of `text` that matched a query term. */
                                    matches: {
                                        start: number;
                                        end: number;
                                    }[];
                                    /** @description `text` starts mid-document. */
                                    truncatedStart: boolean;
                                    /** @description `text` stops before the end of the document. */
                                    truncatedEnd: boolean;
                                };
                                /** @description The graph node this hit is, when it has one — pass it to `GET /v1/effects` to see what a change here would affect. Absent for items with no node (e.g. a memory). */
                                node?: {
                                    kind: string;
                                    key: string;
                                };
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
        /** Compile context for a task within a token budget (capped to the plan). */
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
        /** Assert an effect-link: changing `from` may require reviewing `to`. */
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
                        from: {
                            /** @enum {string} */
                            kind: "file" | "symbol" | "module" | "person" | "decision" | "memory";
                            key: string;
                        };
                        to: {
                            /** @enum {string} */
                            kind: "file" | "symbol" | "module" | "person" | "decision" | "memory";
                            key: string;
                        };
                        rationale: string;
                        confidence?: number;
                        metadata?: {
                            [key: string]: unknown;
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
                            from: string;
                            to: string;
                            kind: string;
                            rationale: string | null;
                            confidence: number | null;
                            origin: string | null;
                            metadata: {
                                [key: string]: unknown;
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
    "/v1/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A bounded subgraph of the knowledge graph for visualization. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    /** @description Comma-separated node kinds to include. */
                    nodeKinds?: string;
                    /** @description Comma-separated edge kinds to include. */
                    edgeKinds?: string;
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
                            nodes: {
                                id: string;
                                /** @enum {string} */
                                kind: "file" | "symbol" | "module" | "person" | "decision" | "memory";
                                key: string;
                                label: string;
                                metadata: {
                                    [key: string]: unknown;
                                };
                            }[];
                            edges: {
                                id: string;
                                from: string;
                                to: string;
                                /** @enum {string} */
                                kind: "imports" | "calls" | "references" | "contains" | "owns" | "defines" | "supersedes" | "EFFECT_LINK";
                                rationale: string | null;
                                confidence: number | null;
                                origin: string | null;
                                metadata: {
                                    [key: string]: unknown;
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
    "/v1/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the registered sources. */
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
                            sources: {
                                id: string;
                                kind: string;
                                label: string;
                                config: {
                                    [key: string]: unknown;
                                };
                                createdAt: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Register a source (filesystem or git) for ingestion. */
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
                        kind: string;
                        label?: string;
                        config: {
                            root: string;
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
                            kind: string;
                            label: string;
                            config: {
                                [key: string]: unknown;
                            };
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
    "/v1/sources/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get a registered source. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            kind: string;
                            label: string;
                            config: {
                                [key: string]: unknown;
                            };
                            createdAt: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Remove a registered source. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sources/{id}/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A source's most recent scan status. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            /** @enum {string} */
                            state: "idle" | "running" | "error";
                            progress?: {
                                processed: number;
                                total: number;
                            };
                            lastScan?: {
                                summary: {
                                    added: number;
                                    modified: number;
                                    removed: number;
                                    unchanged: number;
                                };
                                at: string;
                            };
                            error?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Start a scan (incremental + idempotent). Returns 202; poll GET or watch /v1/events.
         * @description Accepts the scan and returns immediately — it runs in the background. Follow it with GET /v1/sources/:id/scan or the source.scan.progress / .completed / .failed events. Returns 409 if a scan of this source is already running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            source: {
                                id: string;
                                kind: string;
                                label: string;
                                config: {
                                    [key: string]: unknown;
                                };
                                createdAt: string;
                            };
                            /** @enum {string} */
                            state: "idle" | "running" | "error";
                            progress?: {
                                processed: number;
                                total: number;
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
    "/v1/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the projects in the calling tenant (default first). */
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
                            projects: {
                                id: string;
                                name: string;
                                createdAt: string;
                                isDefault: boolean;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Create a project (a new, isolated workspace scope). */
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
                        name: string;
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
                            name: string;
                            createdAt: string;
                            isDefault: boolean;
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
    "/v1/projects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get a project by id. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            name: string;
                            createdAt: string;
                            isDefault: boolean;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Delete a project (not the reserved default). */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            /** @enum {boolean} */
                            deleted: true;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Rename a project (not the reserved default). */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
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
                            name: string;
                            createdAt: string;
                            isDefault: boolean;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The workspace summary: indexed documents, memories, graph size, sources, last scan. */
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
                            documents: number;
                            memories: number;
                            graph: {
                                nodes: number;
                                effectLinks: number;
                            };
                            sources: number;
                            lastScanAt: string | null;
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
    "/v1/stats/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Daily activity for the Overview chart — audit-derived, floored to the trail (F-084).
         * @description Zero-filled per-day counts of workspace activity, bucketed into the viewer’s calendar days when `tzOffset` (minutes east of UTC) is sent, UTC days otherwise (F-088). `from` is the window the server actually used (clamped to the oldest event the trail holds), which the client must label; `points` is empty when the trail has no history. No trend field is added to /v1/stats.
         */
        get: {
            parameters: {
                query?: {
                    days?: number;
                    tzOffset?: number;
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
                            from: string;
                            until: string;
                            points: {
                                date: string;
                                count: number;
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
    "/v1/stats/activity/recent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The last N successful work actions — what the Recent activity feed and the bell render (F-089).
         * @description A narrowed, member-visible view of the audit trail: success only, work actions minus search, non-sensitive fields only (no outcome, no metadata; targets are ids or route patterns). Newest first; `limit` defaults to 20, max 50. The full trail stays behind /v1/audit (admin:manage).
         */
        get: {
            parameters: {
                query?: {
                    limit?: number;
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
                            events: {
                                id: string;
                                action: string;
                                target?: string;
                                actor: {
                                    principalId: string;
                                    /** @enum {string} */
                                    kind: "local" | "user" | "token";
                                };
                                at: string;
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
    "/v1/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Query this tenant's audit trail (admin only). */
        get: {
            parameters: {
                query?: {
                    /** @description Filter by action. */
                    action?: "search" | "compile" | "effects.read" | "memory.read" | "memory.write" | "effects.write" | "source.read" | "source.manage" | "project.read" | "project.manage" | "billing.read" | "billing.manage" | "audit.read" | "token.read" | "token.manage" | "retention.read" | "retention.manage" | "dsr.export" | "dsr.delete" | "audit.export";
                    /** @description Filter by actor principal id. */
                    actor?: string;
                    /** @description Filter by outcome. */
                    outcome?: "success" | "denied";
                    /** @description Inclusive lower time bound (ISO-8601). */
                    since?: string;
                    /** @description Inclusive upper time bound (ISO-8601). */
                    until?: string;
                    limit?: number;
                    /** @description Opaque forward cursor from a prior page. */
                    cursor?: string;
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
                            events: {
                                id: string;
                                tenantId: string;
                                actor: {
                                    principalId: string;
                                    /** @enum {string} */
                                    kind: "local" | "user" | "token";
                                };
                                /** @enum {string} */
                                action: "search" | "compile" | "effects.read" | "memory.read" | "memory.write" | "effects.write" | "source.read" | "source.manage" | "project.read" | "project.manage" | "billing.read" | "billing.manage" | "audit.read" | "token.read" | "token.manage" | "retention.read" | "retention.manage" | "dsr.export" | "dsr.delete" | "audit.export";
                                target?: string;
                                /** @enum {string} */
                                outcome: "success" | "denied";
                                at: string;
                                metadata?: {
                                    [key: string]: string | number | boolean;
                                };
                            }[];
                            nextCursor?: string;
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
    "/v1/audit/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export every audit event matching the filters (admin only); the export is audited. */
        get: {
            parameters: {
                query?: {
                    /** @description Filter by action. */
                    action?: "search" | "compile" | "effects.read" | "memory.read" | "memory.write" | "effects.write" | "source.read" | "source.manage" | "project.read" | "project.manage" | "billing.read" | "billing.manage" | "audit.read" | "token.read" | "token.manage" | "retention.read" | "retention.manage" | "dsr.export" | "dsr.delete" | "audit.export";
                    /** @description Filter by actor principal id. */
                    actor?: string;
                    /** @description Filter by outcome. */
                    outcome?: "success" | "denied";
                    /** @description Inclusive lower time bound (ISO-8601). */
                    since?: string;
                    /** @description Inclusive upper time bound (ISO-8601). */
                    until?: string;
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
                            /** @description When the server assembled this export (ISO-8601). */
                            exportedAt: string;
                            count: number;
                            /** @description True when the export hit its row cap and is a PREFIX of the matching trail, not all of it. Narrow the date range for the rest. */
                            truncated: boolean;
                            events: {
                                id: string;
                                tenantId: string;
                                actor: {
                                    principalId: string;
                                    /** @enum {string} */
                                    kind: "local" | "user" | "token";
                                };
                                /** @enum {string} */
                                action: "search" | "compile" | "effects.read" | "memory.read" | "memory.write" | "effects.write" | "source.read" | "source.manage" | "project.read" | "project.manage" | "billing.read" | "billing.manage" | "audit.read" | "token.read" | "token.manage" | "retention.read" | "retention.manage" | "dsr.export" | "dsr.delete" | "audit.export";
                                target?: string;
                                /** @enum {string} */
                                outcome: "success" | "denied";
                                at: string;
                                metadata?: {
                                    [key: string]: string | number | boolean;
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
    "/v1/retention": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The deployment's effective memory retention policy (empty rules ⇒ retention off). */
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
                            rules: {
                                /** @enum {string} */
                                kind?: "decision" | "lesson" | "incident" | "failure" | "architecture" | "glossary" | "task";
                                scope?: string;
                                /** @description Expire a lineage whose current version is older than this. */
                                maxAgeMs?: number;
                                /** @description Keep at most this many superseded versions per lineage. */
                                maxSupersededVersions?: number;
                                /** @description Prune superseded versions older than this. */
                                maxSupersededAgeMs?: number;
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
    "/v1/retention/prune": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Apply the retention policy to the calling tenant's memories; returns what was pruned. */
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
                            /** @description Whole lineages deleted by an age-based expiry. */
                            expiredLineages: number;
                            /** @description Superseded versions compacted away. */
                            prunedVersions: number;
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
    "/v1/dsr/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export everything held for the calling tenant (memories, graph, sources, audit). */
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
                            /** @description ISO-8601 time the bundle was assembled. */
                            exportedAt: string;
                            /** @description Every memory version across every lineage. */
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
                            graph: {
                                nodes: {
                                    id: string;
                                    /** @enum {string} */
                                    kind: "file" | "symbol" | "module" | "person" | "decision" | "memory";
                                    key: string;
                                    label: string;
                                    metadata: {
                                        [key: string]: unknown;
                                    };
                                }[];
                                edges: {
                                    id: string;
                                    from: string;
                                    to: string;
                                    /** @enum {string} */
                                    kind: "imports" | "calls" | "references" | "contains" | "owns" | "defines" | "supersedes" | "EFFECT_LINK";
                                    rationale: string | null;
                                    confidence: number | null;
                                    origin: string | null;
                                    metadata: {
                                        [key: string]: unknown;
                                    };
                                }[];
                            };
                            sources: {
                                id: string;
                                kind: string;
                                label: string;
                                config: {
                                    [key: string]: unknown;
                                };
                                createdAt: string;
                            }[];
                            /** @description The tenant's complete audit trail. */
                            audit: {
                                id: string;
                                tenantId: string;
                                actor: {
                                    principalId: string;
                                    /** @enum {string} */
                                    kind: "local" | "user" | "token";
                                };
                                /** @enum {string} */
                                action: "search" | "compile" | "effects.read" | "memory.read" | "memory.write" | "effects.write" | "source.read" | "source.manage" | "project.read" | "project.manage" | "billing.read" | "billing.manage" | "audit.read" | "token.read" | "token.manage" | "retention.read" | "retention.manage" | "dsr.export" | "dsr.delete" | "audit.export";
                                target?: string;
                                /** @enum {string} */
                                outcome: "success" | "denied";
                                at: string;
                                metadata?: {
                                    [key: string]: string | number | boolean;
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
    "/v1/dsr/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Erase the calling tenant's data plane (the audit trail is retained). */
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
                            tenantId: string;
                            deletedAt: string;
                            /** @description Memory lineages deleted (all versions). */
                            memories: number;
                            graph: {
                                nodes: number;
                                edges: number;
                            };
                            sources: number;
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
