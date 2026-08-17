import type { Bucket, BucketClassification, OpenApiDocument, OpenApiPathItem, OpenApiSchema } from "@deterministic-code/generator-sdk/codegen/lib/openapi-types";
import { RawTsExpr } from "@deterministic-code/generator-sdk/codegen/lib/ts-sample-literal";
import type { RuntimeValue } from "@deterministic-code/generator-sdk/codegen/lib/ts-sample-literal";
import type { resolveSelfDoc } from "./frontend-bindings-routes.ts";
import type { CodegenLayout } from "@deterministic-code/generator-sdk/codegen-layout";
type SelfDoc = Awaited<ReturnType<typeof resolveSelfDoc>>["doc"];
type LiveBucket = Bucket & {
    classification: BucketClassification;
};
interface LiveCtx {
    doc: OpenApiDocument;
    paths: Record<string, OpenApiPathItem>;
    buckets: LiveBucket[];
    components: Record<string, OpenApiSchema>;
}
interface SampleObject {
    [key: string]: SampleValue;
}
type SampleValue = string | number | boolean | bigint | null | undefined | Date | Uint8Array | RawTsExpr | RuntimeValue | SampleValue[] | SampleObject;
/** Project the in-process OpenAPI doc into the shape the live-lifecycle generator walks: stub-stripped paths and classified CRUD/readonly/other buckets, resolved once so every block derives structure one way. */
export declare function buildLiveCtx(input: SelfDoc): LiveCtx;
/** The distinct object tags (client directories) present in the doc, insertion-sorted for deterministic output. */
export declare function liveTags(ctx: LiveCtx): string[];
/** Empties eager-write child arrays in an UPDATE/PATCH body. The generated test can't supply a real child id, and a synthetic `id: 1` trips the server's cross-parent guard ("child id N does not belong to this parent"); dropping just the id would violate the update child TYPE, which requires `id`. The child array key is required (nullable, not optional), so it can't be omitted either — an empty array type-checks (no element instantiated) and round-trips (the update writes no children). Nested writes stay covered by the create body, whose child rows carry no id. */
export declare function emptyUpdateChildArrays(sample: SampleValue): void;
interface RenderLiveArgs {
    ds: string;
    entity: string;
    client: string;
    layout: CodegenLayout;
}
/** Render a `<client>.bindings.live.ts` file for one object tag: a full-coverage lifecycle per bucket (CRUD create→read→update→delete, readonly reads, and other/sub-resource routes), seeding FK parents up the tree via the generated parent clients. Returns null when the tag has no buckets. */
export declare function renderLiveFile(ctx: LiveCtx, { ds, entity, client, layout }: RenderLiveArgs): string | null;
export {};
