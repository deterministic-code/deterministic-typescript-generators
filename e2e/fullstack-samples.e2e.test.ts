import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  bootFullstackSample,
  dumpFullstackTrace,
  requireFrontendBinding,
} from "./fullstack-sample-app.ts";
import {
  asRecord,
  itemsOf,
  loadFetchClient,
  uniqueSuffix,
  type BindingClient,
} from "./fullstack-sample-client.ts";
import { stopGeneratedApp, type BootedApp } from "./generated-app.ts";

const originOf = (port: number): string => `http://127.0.0.1:${port}`;

const assertReactClientScaffold = async (
  appDir: string,
  entities: readonly string[],
): Promise<void> => {
  await Promise.all([
    requireFrontendBinding(appDir, "frontend/src/App.tsx"),
    requireFrontendBinding(appDir, "frontend/package.json"),
    requireFrontendBinding(appDir, "frontend/src/client/fetch/http.ts"),
    requireFrontendBinding(appDir, "frontend/src/client/index.ts"),
    ...entities.map((entity) =>
      requireFrontendBinding(appDir, `frontend/src/client/fetch/${entity}.ts`),
    ),
  ]);
};

const assertUserCrud = async (
  client: BindingClient,
  extraCreate: Record<string, unknown> = {},
): Promise<void> => {
  const email = `user-${uniqueSuffix()}@example.com`;
  const created = asRecord(
    await client.create({ email, ...extraCreate }),
  );
  assert.equal(created.email, email);
  const id = created.id;
  assert.ok(id !== undefined);

  const got = asRecord(await client.get(id));
  assert.equal(got.email, email);

  const listed = itemsOf(await client.list());
  assert.ok(listed.some((row) => asRecord(row).id === id));

  const patched = asRecord(
    await client.patch(id, { email: `patched-${email}` }),
  );
  assert.equal(patched.email, `patched-${email}`);

  const replaced = asRecord(
    await client.update(id, { email: `put-${email}`, ...extraCreate }),
  );
  assert.equal(replaced.email, `put-${email}`);

  await client.delete(id);
  await assert.rejects(() => client.get(id), /failed: 404/);
};

const assertProjectTaskStack = async (
  appDir: string,
  port: number,
  options: { optimisticConcurrency: boolean },
): Promise<void> => {
  const baseUrl = originOf(port);
  const { client: statuses } = await loadFetchClient(appDir, "status", baseUrl);
  const { client: projects } = await loadFetchClient(
    appDir,
    "project",
    baseUrl,
  );

  const statusNames = itemsOf(await statuses.list())
    .map((row) => asRecord(row).name)
    .sort();
  assert.deepEqual(statusNames, ["active", "archived"]);
  assert.equal(typeof statuses.create, "undefined");

  const suffix = uniqueSuffix();
  const created = asRecord(await projects.create({ name: `alpha-${suffix}` }));
  assert.equal(created.name, `alpha-${suffix}`);
  const projectId = created.id;
  if (options.optimisticConcurrency) {
    assert.equal(typeof created.updated, "string");
  }

  const got = asRecord(await projects.get(projectId));
  assert.equal(got.name, `alpha-${suffix}`);

  const listed = itemsOf(await projects.list());
  assert.ok(listed.some((row) => asRecord(row).id === projectId));

  const byName = asRecord(await projects.getByName(`alpha-${suffix}`));
  assert.equal(byName.id, projectId);

  const nested = asRecord(
    await projects.create({
      name: `nested-${suffix}`,
      tasks: [
        { title: "one", status_name: "active" },
        { title: "two", status_name: "archived" },
      ],
    }),
  );
  const nestedTasks = nested.tasks;
  assert.ok(Array.isArray(nestedTasks));
  assert.equal(nestedTasks.length, 2);
  assert.deepEqual(
    nestedTasks.map((row) => asRecord(row).title).sort(),
    ["one", "two"],
  );
  assert.equal("status_id" in asRecord(nestedTasks[0]!), false);

  const member = asRecord(await projects.get(nested.id));
  const memberTasks = member.tasks;
  assert.ok(Array.isArray(memberTasks));
  assert.equal(memberTasks.length, 2);

  const patched = asRecord(
    await projects.patch(projectId, { name: `alpha-2-${suffix}` }),
  );
  assert.equal(patched.name, `alpha-2-${suffix}`);
  const put = asRecord(
    await projects.update(projectId, { name: `alpha-3-${suffix}` }),
  );
  assert.equal(put.name, `alpha-3-${suffix}`);
  await projects.delete(projectId);

  await assert.rejects(() => projects.get(projectId), /failed: 404/);
};

describe("fullstack sample 01-simple e2e", { timeout: 180_000 }, () => {
  const TEMP_PREFIX = "ts-fullstack-simple-";
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootFullstackSample("01-simple", TEMP_PREFIX);
  });

  after(async () => {
    if (booted !== undefined) dumpFullstackTrace(booted);
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("writes a React frontend with fetch client bindings", async () => {
    assert.ok(booted);
    await assertReactClientScaffold(booted.appDir, ["user"]);
  });

  it("runs user CRUD through the generated fetch client", async () => {
    assert.ok(booted);
    const { client } = await loadFetchClient(
      booted.appDir,
      "user",
      originOf(booted.port),
    );
    await assertUserCrud(client);
  });
});

describe("fullstack sample 02-moderate e2e", { timeout: 180_000 }, () => {
  const TEMP_PREFIX = "ts-fullstack-moderate-";
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootFullstackSample("02-moderate", TEMP_PREFIX);
  });

  after(async () => {
    if (booted !== undefined) dumpFullstackTrace(booted);
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("writes a React frontend with user and role client bindings", async () => {
    assert.ok(booted);
    await assertReactClientScaffold(booted.appDir, ["user", "role"]);
  });

  it("lists seeded roles and runs user CRUD plus getByEmail", async () => {
    assert.ok(booted);
    const baseUrl = originOf(booted.port);
    const { client: roles } = await loadFetchClient(
      booted.appDir,
      "role",
      baseUrl,
    );
    const { client: users } = await loadFetchClient(
      booted.appDir,
      "user",
      baseUrl,
    );

    const roleRows = itemsOf(await roles.list());
    const names = roleRows.map((row) => asRecord(row).name).sort();
    assert.deepEqual(names, ["admin", "member"]);
    const roleId = asRecord(roleRows[0]!).id;
    assert.equal(typeof roles.create, "undefined");

    const extra = { role_id: roleId };
    await assertUserCrud(users, extra);

    const email = `lookup-${uniqueSuffix()}@example.com`;
    const created = asRecord(await users.create({ email, ...extra }));
    const byEmail = asRecord(await users.getByEmail(email));
    assert.equal(byEmail.id, created.id);
  });
});

describe("fullstack sample 03-complex e2e", { timeout: 180_000 }, () => {
  const TEMP_PREFIX = "ts-fullstack-complex-";
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootFullstackSample("03-complex", TEMP_PREFIX);
  });

  after(async () => {
    if (booted !== undefined) dumpFullstackTrace(booted);
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("writes a React frontend with project, task, and status bindings", async () => {
    assert.ok(booted);
    await assertReactClientScaffold(booted.appDir, ["project", "task", "status"]);
  });

  it("runs project and task CRUD through the generated fetch client", async () => {
    assert.ok(booted);
    await assertProjectTaskStack(booted.appDir, booted.port, {
      optimisticConcurrency: false,
    });
  });
});

describe("fullstack sample 04-occ e2e", { timeout: 180_000 }, () => {
  const TEMP_PREFIX = "ts-fullstack-occ-";
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootFullstackSample(
      "04-complex-optimistic-concurrency",
      TEMP_PREFIX,
    );
  });

  after(async () => {
    if (booted !== undefined) dumpFullstackTrace(booted);
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("writes a React frontend with project, task, and status bindings", async () => {
    assert.ok(booted);
    await assertReactClientScaffold(booted.appDir, ["project", "task", "status"]);
  });

  it("runs project CRUD through the generated fetch client, including OCC timestamps", async () => {
    assert.ok(booted);
    await assertProjectTaskStack(booted.appDir, booted.port, {
      optimisticConcurrency: true,
    });
  });
});
