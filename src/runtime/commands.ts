import { z } from 'zod';

/**
 * Discriminated RobotCommand union with Zod schemas.
 *
 * Every movement or control request in the system is one of these commands. They
 * are the ONLY way to affect the robot; no component or store applies joint
 * values directly. Commands are validated (schema), normalized, arbitrated, and
 * safety-checked before the runtime executes them.
 */

export const COMMAND_SOURCES = [
  'dashboard',
  'joystick',
  'keyboard',
  'finger',
  'voice',
  'autonomous',
  'agent',
  'system',
] as const;
export type CommandSource = (typeof COMMAND_SOURCES)[number];

/**
 * Deterministic source priority. Higher wins arbitration and may preempt a
 * lower-priority movement. `system` (stop/pause/reset) outranks everything;
 * E-stop is handled out-of-band entirely (see RuntimeController).
 */
export const SOURCE_PRIORITY: Record<CommandSource, number> = {
  system: 100,
  autonomous: 50,
  agent: 40,
  voice: 30,
  dashboard: 20,
  finger: 18,
  keyboard: 15,
  joystick: 10,
};

const SourceSchema = z.enum(COMMAND_SOURCES);
const finite = z.number().finite();
const Vec3Schema = z.tuple([finite, finite, finite]);

const BaseFields = {
  /** Optional caller id; the normalizer fills a unique one if absent. */
  id: z.string().min(1).optional(),
  source: SourceSchema,
  /** Optional caller timestamp (ms); normalizer fills it if absent. */
  issuedAt: z.number().finite().optional(),
};

export const MoveJointsCommandSchema = z.object({
  type: z.literal('move_joints'),
  ...BaseFields,
  /** Absolute target joint values (radians), by joint name. */
  joints: z.record(z.string().min(1), finite),
});

export const CartesianMoveCommandSchema = z.object({
  type: z.literal('cartesian_move'),
  ...BaseFields,
  position: Vec3Schema,
  approachAxis: Vec3Schema,
});

export const CartesianJogCommandSchema = z.object({
  type: z.literal('cartesian_jog'),
  ...BaseFields,
  /** Relative TCP step in the base frame (metres). */
  delta: Vec3Schema,
  approachAxis: Vec3Schema,
});

export const HomeCommandSchema = z.object({ type: z.literal('home'), ...BaseFields });
export const StopCommandSchema = z.object({ type: z.literal('stop'), ...BaseFields });
export const PauseCommandSchema = z.object({ type: z.literal('pause'), ...BaseFields });
export const ResumeCommandSchema = z.object({ type: z.literal('resume'), ...BaseFields });
export const EStopCommandSchema = z.object({ type: z.literal('estop'), ...BaseFields });
export const ResetCommandSchema = z.object({ type: z.literal('reset'), ...BaseFields });

export const RobotCommandSchema = z.discriminatedUnion('type', [
  MoveJointsCommandSchema,
  CartesianMoveCommandSchema,
  CartesianJogCommandSchema,
  HomeCommandSchema,
  StopCommandSchema,
  PauseCommandSchema,
  ResumeCommandSchema,
  EStopCommandSchema,
  ResetCommandSchema,
]);

export type MoveJointsCommand = z.infer<typeof MoveJointsCommandSchema>;
export type CartesianMoveCommand = z.infer<typeof CartesianMoveCommandSchema>;
export type CartesianJogCommand = z.infer<typeof CartesianJogCommandSchema>;
export type RobotCommand = z.infer<typeof RobotCommandSchema>;

/** A command with required id/issuedAt filled in. */
export type NormalizedCommand = RobotCommand & { id: string; issuedAt: number };

/** Movement commands actually drive the robot; others are control verbs. */
export const MOVEMENT_TYPES = new Set(['move_joints', 'cartesian_move', 'cartesian_jog', 'home']);
export function isMovementCommand(c: { type: string }): boolean {
  return MOVEMENT_TYPES.has(c.type);
}

/** Sources a human operator drives directly (jog/manual). */
export const MANUAL_SOURCES: ReadonlySet<CommandSource> = new Set<CommandSource>([
  'dashboard',
  'joystick',
  'keyboard',
  'finger',
]);
export function isManualSource(source: CommandSource): boolean {
  return MANUAL_SOURCES.has(source);
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `cmd-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ParseResult {
  ok: boolean;
  command?: NormalizedCommand;
  error?: string;
}

/**
 * Validate an unknown value against the command schema and normalize it (fill
 * id / issuedAt). Returns a human-readable error on failure — never throws.
 */
export function parseCommand(input: unknown, now: number = Date.now()): ParseResult {
  const result = RobotCommandSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') ?? '';
    return { ok: false, error: `Invalid command${path ? ` at "${path}"` : ''}: ${first?.message ?? 'schema error'}` };
  }
  const command = {
    ...result.data,
    id: result.data.id ?? nextId(),
    issuedAt: result.data.issuedAt ?? now,
  } as NormalizedCommand;
  return { ok: true, command };
}

export function priorityOf(source: CommandSource): number {
  return SOURCE_PRIORITY[source];
}
