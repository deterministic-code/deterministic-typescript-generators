import { z } from 'zod';
import type { ArgSpec, ServiceSpec } from '../services/types';

const argSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('repo'), name: z.string().min(1) }),
  z.object({ kind: z.literal('service'), name: z.string().min(1) }),
  z.object({ kind: z.literal('config'), key: z.string().min(1) }),
  z.object({ kind: z.literal('undefined') }),
  z.object({ kind: z.literal('literal'), value: z.unknown() }),
]);

const serviceEntrySchema = z
  .object({
    name: z.string().min(1),
    args: z.array(argSpecSchema).optional(),
  })
  .passthrough();

const servicesYamlSchema = z
  .object({
    services: z.array(serviceEntrySchema),
  })
  .passthrough();

export function parseServiceSpecs(doc: unknown): ServiceSpec[] {
  const parsed = servicesYamlSchema.parse(doc);
  return parsed.services.map((entry) => {
    const spec: ServiceSpec = {
      name: entry.name,
      args: Array.isArray(entry.args) ? (entry.args as ArgSpec[]) : [],
    };
    if (typeof entry.type === 'string') spec.type = entry.type;
    if (typeof entry.module === 'string') spec.module = entry.module;
    return spec;
  });
}
