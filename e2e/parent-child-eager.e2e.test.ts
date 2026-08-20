import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  bootParentChildEagerApp,
  dumpParentChildTrace,
} from "./parent-child-eager-app.ts";
import { stopGeneratedApp, type BootedApp } from "./generated-app.ts";

const TEMP_PREFIX = "ts-parent-child-eager-";

type Json = {
  status: number;
  body: unknown;
};

const requestJson = async (
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<Json> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text === "" ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
};

const asRecord = (value: unknown): Record<string, unknown> => {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
};

const itemsOf = (body: unknown): unknown[] => {
  const rec = asRecord(body);
  assert.ok(Array.isArray(rec.items), "expected { items: [] }");
  return rec.items;
};

describe("parent-child eager e2e", { timeout: 360_000 }, () => {
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootParentChildEagerApp(TEMP_PREFIX);
  });

  after(async () => {
    if (booted !== undefined) dumpParentChildTrace(booted);
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("lists two seeded statuses and rejects writes", async () => {
    assert.ok(booted);
    const listed = await requestJson(booted.port, "GET", "/api/statuses");
    assert.equal(listed.status, 200);
    const names = itemsOf(listed.body)
      .map((row) => asRecord(row).name)
      .sort();
    assert.deepEqual(names, ["active", "archived"]);

    const created = await requestJson(booted.port, "POST", "/api/statuses", {
      name: "other",
    });
    assert.ok(created.status >= 400);
  });

  it("runs project CRUD and find_by name", async () => {
    assert.ok(booted);
    const created = await requestJson(booted.port, "POST", "/api/projects", {
      name: "alpha",
    });
    assert.equal(created.status, 201);
    const project = asRecord(created.body);
    const id = project.id;
    assert.equal(project.name, "alpha");

    const got = await requestJson(booted.port, "GET", `/api/projects/${id}`);
    assert.equal(got.status, 200);
    assert.equal(asRecord(got.body).name, "alpha");

    const listed = await requestJson(booted.port, "GET", "/api/projects");
    assert.equal(listed.status, 200);
    assert.ok(itemsOf(listed.body).some((row) => asRecord(row).id === id));

    const byName = await requestJson(
      booted.port,
      "GET",
      "/api/projects/name/alpha",
    );
    assert.equal(byName.status, 200);
    assert.equal(asRecord(byName.body).id, id);

    const patched = await requestJson(booted.port, "PATCH", `/api/projects/${id}`, {
      name: "alpha-2",
    });
    assert.equal(patched.status, 200);
    assert.equal(asRecord(patched.body).name, "alpha-2");

    const put = await requestJson(booted.port, "PUT", `/api/projects/${id}`, {
      name: "alpha-3",
    });
    assert.equal(put.status, 200);
    assert.equal(asRecord(put.body).name, "alpha-3");

    const deleted = await requestJson(
      booted.port,
      "DELETE",
      `/api/projects/${id}`,
    );
    assert.equal(deleted.status, 200);
    const missing = await requestJson(booted.port, "GET", `/api/projects/${id}`);
    assert.equal(missing.status, 404);
  });

  it("runs task CRUD with status_name enrichment", async () => {
    assert.ok(booted);
    const parent = await requestJson(booted.port, "POST", "/api/projects", {
      name: "task-home",
    });
    assert.equal(parent.status, 201);
    const projectId = asRecord(parent.body).id;

    const created = await requestJson(booted.port, "POST", "/api/tasks", {
      title: "ship",
      project_id: projectId,
      status_name: "active",
    });
    assert.equal(created.status, 201);
    const task = asRecord(created.body);
    assert.equal(task.title, "ship");
    assert.equal(task.status_name, "active");
    assert.equal("status_id" in task, false);

    const got = await requestJson(booted.port, "GET", `/api/tasks/${task.id}`);
    assert.equal(got.status, 200);
    assert.equal(asRecord(got.body).status_name, "active");

    const patched = await requestJson(
      booted.port,
      "PATCH",
      `/api/tasks/${task.id}`,
      { status_name: "archived" },
    );
    assert.equal(patched.status, 200);
    assert.equal(asRecord(patched.body).status_name, "archived");

    const put = await requestJson(booted.port, "PUT", `/api/tasks/${task.id}`, {
      title: "shipped",
      project_id: projectId,
      status_name: "active",
    });
    assert.equal(put.status, 200);
    assert.equal(asRecord(put.body).title, "shipped");
    assert.equal(asRecord(put.body).status_name, "active");

    const listed = await requestJson(booted.port, "GET", "/api/tasks");
    assert.equal(listed.status, 200);
    assert.ok(itemsOf(listed.body).some((row) => asRecord(row).id === task.id));

    const deleted = await requestJson(
      booted.port,
      "DELETE",
      `/api/tasks/${task.id}`,
    );
    assert.equal(deleted.status, 200);
  });

  it("eager-writes nested tasks and eager-reads them on the parent", async () => {
    assert.ok(booted);
    const created = await requestJson(booted.port, "POST", "/api/projects", {
      name: "nested",
      tasks: [
        { title: "one", status_name: "active" },
        { title: "two", status_name: "archived" },
      ],
    });
    assert.equal(created.status, 201);
    const project = asRecord(created.body);
    const nested = project.tasks;
    assert.ok(Array.isArray(nested));
    assert.equal(nested.length, 2);
    const titles = nested.map((row) => asRecord(row).title).sort();
    assert.deepEqual(titles, ["one", "two"]);

    const member = await requestJson(
      booted.port,
      "GET",
      `/api/projects/${project.id}`,
    );
    assert.equal(member.status, 200);
    const memberTasks = asRecord(member.body).tasks;
    assert.ok(Array.isArray(memberTasks));
    assert.equal(memberTasks.length, 2);

    const listed = await requestJson(booted.port, "GET", "/api/projects");
    assert.equal(listed.status, 200);
    const listedProject = itemsOf(listed.body).find(
      (row) => asRecord(row).id === project.id,
    );
    assert.ok(listedProject);
    const listTasks = asRecord(listedProject).tasks;
    assert.ok(Array.isArray(listTasks));
    assert.equal(listTasks.length, 2);

    const keep = asRecord(memberTasks[0]);
    const patched = await requestJson(
      booted.port,
      "PATCH",
      `/api/projects/${project.id}`,
      {
        tasks: [{ id: keep.id, title: "one-updated", status_name: "active" }],
      },
    );
    assert.equal(patched.status, 200);
    const after = asRecord(patched.body).tasks;
    assert.ok(Array.isArray(after));
    assert.equal(after.length, 1);
    assert.equal(asRecord(after[0]).title, "one-updated");
  });
});
