import { analyzeDeps, bucketGetItemsRefName, memberEntityFromGetResp, memberEntityFromCollectionResp, findBucketForEntity, memberPathParamName, hasOp, methodsOf, operationRequestSchema, stripStubOperations, groupBuckets, classifyBucket, camelToSnake, snakeToCamel, } from "./openapi-crud-helpers.js";
import { sampleForSchema } from "./component-fixture.js";
import { RawTsExpr, serializeSampleValue, } from "@deterministic-code/generator-sdk/codegen/lib/ts-sample-literal";
import { fnNameOf, pathParamsOf } from "./client-op-model.js";
import { entityOf } from "./frontend-bindings-routes.js";
const SEED_DEPTH_LIMIT = 5;
const SEED_INDENT = "    ";
function sanitize(s) {
    return String(s)
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
/** Project the in-process OpenAPI doc into the shape the live-lifecycle emitter walks: stub-stripped paths and classified CRUD/readonly/other buckets, resolved once so every block derives structure one way. */
export function buildLiveCtx(input) {
    const doc = input;
    const paths = stripStubOperations(doc.paths ?? {});
    const buckets = groupBuckets(paths).map((b) => ({
        ...b,
        classification: classifyBucket(b, paths, doc),
    }));
    return { doc, paths, buckets, components: doc.components?.schemas ?? {} };
}
function opAt(ctx, method, path) {
    return (ctx.paths[path][method.toLowerCase()] ??
        null);
}
function fnAt(ctx, method, path) {
    const op = opAt(ctx, method, path);
    if (!op)
        return null;
    return fnNameOf({ name: op.operationId, method: method.toUpperCase(), path });
}
function tagOfPath(ctx, path) {
    const item = ctx.paths[path];
    const op = item.get ?? item.post ?? item.put ?? item.patch ?? item.delete;
    return entityOf(op, path);
}
function tagOfBucket(ctx, bucket) {
    const path = ctx.paths[bucket.collectionPath] != null
        ? bucket.collectionPath
        : bucket.memberPath;
    return tagOfPath(ctx, path);
}
/** The distinct object tags (client directories) present in the doc, insertion-sorted for deterministic output. */
export function liveTags(ctx) {
    const seen = new Set();
    const tags = [];
    for (const bucket of ctx.buckets) {
        const tag = tagOfBucket(ctx, bucket);
        if (seen.has(tag))
            continue;
        seen.add(tag);
        tags.push(tag);
    }
    return tags;
}
function newBuilder(ctx, currentTag) {
    return { ctx, currentTag, seq: { n: 0 }, imports: new Map(), lines: [] };
}
function slotName(builder, hint) {
    return `seed_${sanitize(hint)}_${builder.seq.n++}`;
}
function registerImport(builder, tag, fn) {
    if (!fn)
        return;
    const set = builder.imports.get(tag) ?? new Set();
    set.add(fn);
    builder.imports.set(tag, set);
}
function collectionPathArgs(bucket, idByField) {
    return pathParamsOf(bucket.collectionPath).map((p) => idByField[p] ?? "1");
}
function memberCallArgs(memberPath, idByField, memberIdExpr) {
    const params = pathParamsOf(memberPath);
    return params.map((p, i) => i === params.length - 1 ? memberIdExpr : (idByField[p] ?? "1"));
}
function isPlainObject(v) {
    return v != null && typeof v === "object" && !(v instanceof RawTsExpr);
}
/** True for an eager-write UPDATE child array: elements are objects carrying their own `id`. The update child type (`_eager_row`) keeps `id` (required), so sampleForSchema stamps a synthetic `id: 1`; the create child type (`_eager_create_row`) omits it, so create child samples have no `id`. This distinguishes the two without threading the verb. */
function isUpdateChildArray(value) {
    return (Array.isArray(value) &&
        value.length > 0 &&
        isPlainObject(value[0]) &&
        "id" in value[0]);
}
/** Empties eager-write child arrays in an UPDATE/PATCH body. The generated test can't supply a real child id, and a synthetic `id: 1` trips the server's cross-parent guard ("child id N does not belong to this parent"); dropping just the id would violate the update child TYPE, which requires `id`. The child array key is required (nullable, not optional), so it can't be omitted either — an empty array type-checks (no element instantiated) and round-trips (the update writes no children). Nested writes stay covered by the create body, whose child rows carry no id. */
export function emptyUpdateChildArrays(sample) {
    if (!isPlainObject(sample))
        return;
    for (const [key, value] of Object.entries(sample)) {
        if (isUpdateChildArray(value))
            sample[key] = [];
    }
}
/** A request-body literal for `op` as TS source: a COMPLETE sample (every property the client's body type demands, via sampleForSchema — matching the mocked client-binding tests), then each FK field whose value was seeded up the tree is overwritten with the captured parent-id expression so the live POST satisfies its foreign keys. Returns null when the op takes no body. */
function requestBodyExpr(ctx, op, { idByField }) {
    const schema = operationRequestSchema(op);
    if (!schema)
        return null;
    const sample = sampleForSchema(schema, ctx.components, {
        datetime: "native",
    });
    if (sample && typeof sample === "object" && !Array.isArray(sample)) {
        const obj = sample;
        for (const [field, expr] of Object.entries(idByField)) {
            if (field in obj)
                obj[field] = new RawTsExpr(expr);
        }
    }
    emptyUpdateChildArrays(sample);
    return serializeSampleValue(sample);
}
/** Emit the recursive FK-parent seed chain for `bucket`, driving the parents' own emitted client functions. Dedupes by PARENT (collection + captured column), so a route's path param and a body FK that both reference the same parent reuse one created row — keeping the nested resource's path id and its body FK coherent. Returns the map from each dep field to the in-scope JS expression holding its resolved id. */
function seedBucket(builder, bucket, depth = 0) {
    const idByField = {};
    if (depth > SEED_DEPTH_LIMIT)
        return idByField;
    const deps = analyzeDeps(bucket, builder.ctx.doc, builder.ctx.buckets);
    const slotByParent = new Map();
    for (const dep of deps) {
        const key = `${dep.parentBucket.collectionPath}::${dep.capture}`;
        let s = slotByParent.get(key);
        if (!s) {
            s = resolveParentId(builder, dep, depth);
            slotByParent.set(key, s);
        }
        idByField[dep.field] = s;
    }
    return idByField;
}
function resolveParentId(builder, dep, depth) {
    const { ctx } = builder;
    const parent = dep.parentBucket;
    const grand = seedBucket(builder, parent, depth + 1);
    const seed = {
        dep,
        parent,
        parentTag: tagOfBucket(ctx, parent),
        grand,
        s: slotName(builder, dep.field),
    };
    if (hasOp(parent.classification.collectionItem, "post")) {
        emitCreatedParent(builder, seed);
    }
    else {
        emitLookupParent(builder, seed);
    }
    return seed.s;
}
function emitCreatedParent(builder, seed) {
    const { ctx } = builder;
    const { dep, parent, parentTag, grand, s } = seed;
    const fn = fnAt(ctx, "post", parent.collectionPath);
    registerImport(builder, parentTag, fn);
    const body = requestBodyExpr(ctx, opAt(ctx, "post", parent.collectionPath), {
        idByField: grand,
    });
    const args = [...collectionPathArgs(parent, grand), body].filter((a) => a != null);
    builder.lines.push(`${SEED_INDENT}const ${s} = ((await ${fn}(${args.join(", ")})) as any).${dep.capture};`);
}
function emitLookupParent(builder, seed) {
    const { ctx } = builder;
    const { dep, parent, parentTag, grand, s } = seed;
    const fn = fnAt(ctx, "get", parent.collectionPath);
    registerImport(builder, parentTag, fn);
    const args = collectionPathArgs(parent, grand);
    const list = `${s}_list`;
    const arr = `${s}_arr`;
    builder.lines.push(`${SEED_INDENT}const ${list} = (await ${fn}(${args.join(", ")})) as any;`, `${SEED_INDENT}const ${arr} = Array.isArray(${list}) ? ${list} : (${list}?.items ?? []);`, `${SEED_INDENT}if (${arr}.length === 0) throw new Error("live-bindings: no seeded ${dep.parentEntity} to satisfy ${dep.field}");`, `${SEED_INDENT}const ${s} = ${arr}[0].${dep.capture};`);
}
function ownFn(builder, method, path) {
    const fn = fnAt(builder.ctx, method, path);
    registerImport(builder, builder.currentTag, fn);
    return fn;
}
function pkFieldOf(memberPath) {
    return memberPath ? memberPathParamName(memberPath) : "id";
}
function crudPlan(builder, bucket) {
    const { ctx } = builder;
    const coll = bucket.collectionPath;
    const mem = bucket.memberPath;
    const { updateVerb, memberItem } = bucket.classification;
    const idByField = seedBucket(builder, bucket);
    const patchFn = updateVerb === "put" && hasOp(memberItem, "patch")
        ? ownFn(builder, "patch", mem)
        : null;
    return {
        idByField,
        mem,
        pk: pkFieldOf(mem),
        collArgs: collectionPathArgs(bucket, idByField),
        listFn: ownFn(builder, "get", coll),
        createFn: ownFn(builder, "post", coll),
        getFn: ownFn(builder, "get", mem),
        updateFn: ownFn(builder, updateVerb, mem),
        patchFn,
        deleteFn: ownFn(builder, "delete", mem),
        createBody: requestBodyExpr(ctx, opAt(ctx, "post", coll), { idByField }),
        updateBody: requestBodyExpr(ctx, opAt(ctx, updateVerb, mem), { idByField }),
    };
}
function crudLifecycleLines(builder, bucket) {
    const p = crudPlan(builder, bucket);
    const mArgs = (idExpr, body) => {
        const args = memberCallArgs(p.mem, p.idByField, idExpr);
        if (body != null)
            args.push(body);
        return args.join(", ");
    };
    const createArgs = [...p.collArgs, p.createBody].filter((a) => a != null);
    const lines = [...builder.lines];
    if (p.listFn) {
        lines.push(`    expect(await ${p.listFn}(${p.collArgs.join(", ")})).toBeDefined();`);
    }
    lines.push(`    const created = ((await ${p.createFn}(${createArgs.join(", ")})) as any);`, `    const id = created.${p.pk};`, `    expect(id).toBeDefined();`);
    if (p.getFn)
        lines.push(`    expect(await ${p.getFn}(${mArgs("id")})).toBeDefined();`);
    lines.push(`    await ${p.updateFn}(${mArgs("id", p.updateBody)});`);
    if (p.patchFn)
        lines.push(`    await ${p.patchFn}(${mArgs("id", p.updateBody)});`);
    lines.push(`    await ${p.deleteFn}(${mArgs("id")});`);
    if (p.getFn) {
        lines.push(`    await expect(${p.getFn}(${mArgs("id")})).rejects.toThrow();`);
    }
    return lines;
}
function readonlyLines(builder, bucket) {
    const { collectionPath: coll, memberPath: mem } = bucket;
    const idByField = seedBucket(builder, bucket);
    const collArgs = collectionPathArgs(bucket, idByField);
    const listFn = ownFn(builder, "get", coll);
    const memberGetFn = mem && hasOp(bucket.classification.memberItem, "get")
        ? ownFn(builder, "get", mem)
        : null;
    const lines = [...builder.lines];
    lines.push(`    const list = (await ${listFn}(${collArgs.join(", ")})) as any;`, `    expect(list).toBeDefined();`);
    if (memberGetFn) {
        const pk = pkFieldOf(mem);
        lines.push(`    const arr = Array.isArray(list) ? list : (list?.items ?? []);`, `    expect(arr.length, "no seeded rows for ${coll}").toBeGreaterThan(0);`, `    expect(await ${memberGetFn}(${memberCallArgs(mem, idByField, `arr[0].${pk}`).join(", ")})).toBeDefined();`);
    }
    return lines;
}
function memberIdFor(builder, bucket, { idByField, createdExpr, }) {
    const mem = bucket.memberPath;
    const lastParam = memberPathParamName(mem);
    const candidates = [
        lastParam,
        camelToSnake(lastParam),
        snakeToCamel(lastParam),
    ];
    for (const field of candidates) {
        if (idByField[field])
            return idByField[field];
    }
    if (createdExpr)
        return createdExpr;
    return seedSiblingMemberId(builder, bucket, lastParam);
}
function seedSiblingMemberId(builder, bucket, lastParam) {
    const { ctx } = builder;
    const memberItem = bucket.classification.memberItem;
    const entity = bucketGetItemsRefName(bucket) ??
        memberEntityFromGetResp(memberItem) ??
        memberEntityFromCollectionResp(memberItem) ??
        sanitize(lastParam);
    const sibling = findBucketForEntity(entity, ctx.buckets);
    if (!sibling || sibling === bucket) {
        throw new Error(`live-bindings: cannot resolve a member id for ${bucket.memberPath} — no writeable sibling bucket for ${entity}`);
    }
    const grand = seedBucket(builder, sibling);
    const fn = fnAt(ctx, "post", sibling.collectionPath);
    registerImport(builder, tagOfBucket(ctx, sibling), fn);
    const body = requestBodyExpr(ctx, opAt(ctx, "post", sibling.collectionPath), {
        idByField: grand,
    });
    const args = [...collectionPathArgs(sibling, grand), body].filter((a) => a != null);
    const s = slotName(builder, `member_${lastParam}`);
    const pk = pkFieldOf(sibling.memberPath);
    builder.lines.push(`${SEED_INDENT}const ${s} = ((await ${fn}(${args.join(", ")})) as any).${pk};`);
    return s;
}
function otherCollectionLines(builder, bucket, { idByField, collArgs, }) {
    const { ctx } = builder;
    const coll = bucket.collectionPath;
    const lines = [];
    let createdExpr = null;
    for (const method of methodsOf(bucket.classification.collectionItem)) {
        const fn = ownFn(builder, method, coll);
        if (method === "get") {
            lines.push(`    expect(await ${fn}(${collArgs.join(", ")})).toBeDefined();`);
        }
        else {
            const body = requestBodyExpr(ctx, opAt(ctx, method, coll), { idByField });
            const args = [...collArgs, body].filter((a) => a != null);
            lines.push(`    const created = ((await ${fn}(${args.join(", ")})) as any);`, `    expect(created).toBeDefined();`);
            createdExpr = `created.${pkFieldOf(bucket.memberPath)}`;
        }
    }
    return { lines, createdExpr };
}
function otherMemberLines(builder, bucket, { idByField, memberIdExpr, }) {
    const { ctx } = builder;
    const mem = bucket.memberPath;
    const lines = [];
    const order = ["get", "put", "patch", "post", "delete"];
    for (const method of order) {
        if (!hasOp(bucket.classification.memberItem, method))
            continue;
        const fn = ownFn(builder, method, mem);
        const body = method === "get" || method === "delete"
            ? null
            : requestBodyExpr(ctx, opAt(ctx, method, mem), { idByField });
        const args = memberCallArgs(mem, idByField, memberIdExpr);
        if (body != null)
            args.push(body);
        const call = `${fn}(${args.join(", ")})`;
        lines.push(method === "get"
            ? `    expect(await ${call}).toBeDefined();`
            : `    await ${call};`);
    }
    return lines;
}
function otherLines(builder, bucket) {
    const idByField = seedBucket(builder, bucket);
    const collArgs = collectionPathArgs(bucket, idByField);
    const seedLines = [...builder.lines];
    const { lines: collLines, createdExpr } = otherCollectionLines(builder, bucket, {
        idByField,
        collArgs,
    });
    const lines = [...seedLines, ...collLines];
    if (bucket.memberPath && methodsOf(bucket.classification.memberItem).length) {
        const memberIdExpr = memberIdFor(builder, bucket, {
            idByField,
            createdExpr,
        });
        const extraSeed = builder.lines.slice(seedLines.length);
        lines.push(...extraSeed, ...otherMemberLines(builder, bucket, { idByField, memberIdExpr }));
    }
    return lines;
}
function bodyLinesFor(builder, bucket) {
    const kind = bucket.classification.kind;
    if (kind === "crud")
        return crudLifecycleLines(builder, bucket);
    if (kind === "readonly" || kind === "readonly-singleton") {
        return readonlyLines(builder, bucket);
    }
    return otherLines(builder, bucket);
}
function describeBlock(builder, bucket, client) {
    const lines = bodyLinesFor(builder, bucket);
    const title = `${bucket.collectionPath} (${bucket.classification.kind})`;
    return [
        `describe("${builder.currentTag} ${client} client (live): ${title}", () => {`,
        `  it("every ${bucket.collectionPath} endpoint round-trips through the live API", async () => {`,
        ...lines,
        `  });`,
        `});`,
    ].join("\n");
}
function importLines(builder, { ds, client, layout, fromFile }) {
    const specTo = (tag) => layout.frontendRelImport(fromFile, layout.frontendClientFile(ds, tag, `${client}.ts`));
    const lines = [];
    const own = builder.imports.get(builder.currentTag);
    if (own && own.size) {
        const spec = specTo(builder.currentTag);
        lines.push(`import { ${[...own].sort().join(", ")} } from "${spec}";`);
    }
    for (const [tag, fns] of builder.imports) {
        if (tag === builder.currentTag)
            continue;
        lines.push(`import { ${[...fns].sort().join(", ")} } from "${specTo(tag)}";`);
    }
    return lines;
}
const AXIOS_BEFORE_ALL = `beforeAll(() => {
  axios.defaults.baseURL = process.env.BINDINGS_BASE_URL;
});`;
function vitestImport(client) {
    const symbols = ["describe", "it", "expect"];
    if (client === "axios")
        symbols.push("beforeAll");
    return `import { ${symbols.join(", ")} } from "vitest";`;
}
/** Render a `<client>.bindings.live.ts` file for one object tag: a full-coverage lifecycle per bucket (CRUD create→read→update→delete, readonly reads, and other/sub-resource routes), seeding FK parents up the tree via the emitted parent clients. Returns null when the tag has no buckets. */
export function renderLiveFile(ctx, { ds, entity, client, layout }) {
    const buckets = ctx.buckets.filter((b) => tagOfBucket(ctx, b) === entity);
    if (buckets.length === 0)
        return null;
    const builder = newBuilder(ctx, entity);
    const blocks = buckets.map((bucket) => {
        builder.lines = [];
        return describeBlock(builder, bucket, client);
    });
    const body = blocks.join("\n\n");
    const head = [vitestImport(client)];
    if (client === "axios")
        head.push('import axios from "axios";');
    const fromFile = layout.frontendClientFile(ds, entity, `${client}.bindings.live.ts`);
    head.push(...importLines(builder, { ds, client, layout, fromFile }));
    const preambleText = client === "axios" ? `${AXIOS_BEFORE_ALL}\n\n` : "";
    return `${head.join("\n")}\n\n${preambleText}${body}\n`;
}
