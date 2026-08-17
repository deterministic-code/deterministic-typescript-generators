import type { Bucket, OpenApiDocument, OpenApiPathItem } from "@deterministic-code/generator-sdk/codegen/lib/openapi-types";
export { hasOp, methodsOf, operationRequestSchema, stripStubOperations, groupBuckets, classifyBucket, } from "@deterministic-code/generator-sdk/codegen/lib/openapi-doc-helpers";
export { camelToSnake, snakeToCamel, } from "@deterministic-code/generator-sdk/case";
interface SeedDep {
    field: string;
    parentBucket: Bucket;
    parentEntity: string;
    capture: string;
    pathParam?: boolean;
}
export declare function bucketGetItemsRefName(bucket: Bucket): string | null;
export declare function memberEntityFromGetResp(memberItem: OpenApiPathItem): string | null;
/** The entity a member GET returns when its response is an array envelope (`{ items: [$ref] }`) rather than a single object — the byField list shape, where the member path itself returns the collection. */
export declare function memberEntityFromCollectionResp(memberItem: OpenApiPathItem): string | null;
export declare function findBucketForEntity(entityName: string, buckets: Bucket[]): Bucket | null;
export declare function analyzeDeps(bucket: Bucket, doc: OpenApiDocument, allBuckets: Bucket[]): SeedDep[];
/** Returns the trailing `{<param>}` name from a member path, or "id". */
export declare function memberPathParamName(memberPath: string): string;
