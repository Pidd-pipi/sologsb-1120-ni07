import {
  deviation,
  fmtMm,
  fmtSignedMm,
  measureState,
  needsMeasure,
  overTolerance,
  type MeasureState,
  type MovementPart,
} from '../types/part';
import type { RepairStep } from '../types/step';

/** 装配卡控未通过项：指出是哪只零件、差多少 */
export interface PartBlocker {
  part: MovementPart;
  /** 只可能是 pending（未实测）或 out（超差） */
  state: MeasureState;
  /** 实测 - 标准 mm，未实测为 null */
  deviation: number | null;
  /** 超出允许误差的量 mm，未实测为 null */
  overBy: number | null;
}

/**
 * 装配步骤的零件卡控：
 * 仅「装配」步骤、且关联零件的处理决定为修配/换新时才校验；
 * 未实测或超差的零件会挡住步骤完成。其余工序照常处理。
 */
export function assemblyBlockers(
  step: Pick<RepairStep, 'stepType' | 'partIds'>,
  parts: MovementPart[],
): PartBlocker[] {
  if (step.stepType !== '装配') return [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const blockers: PartBlocker[] = [];
  for (const id of step.partIds) {
    const part = byId.get(id);
    if (!part || !needsMeasure(part)) continue;
    const state = measureState(part);
    if (state === 'ok') continue;
    blockers.push({ part, state, deviation: deviation(part), overBy: overTolerance(part) });
  }
  return blockers;
}

/** 装配步骤是否关联了需要实测的修配/换新件 */
export function hasMeasuredParts(
  step: Pick<RepairStep, 'stepType' | 'partIds'>,
  parts: MovementPart[],
): boolean {
  if (step.stepType !== '装配') return false;
  const byId = new Map(parts.map((p) => [p.id, p]));
  return step.partIds.some((id) => {
    const part = byId.get(id);
    return !!part && needsMeasure(part);
  });
}

/** 装配卡控结果：checked 表示该步骤是否受卡控，blockers 为未通过项 */
export interface GateResult {
  checked: boolean;
  blockers: PartBlocker[];
}

export function assemblyGate(
  step: Pick<RepairStep, 'stepType' | 'partIds'>,
  parts: MovementPart[],
): GateResult {
  const checked = hasMeasuredParts(step, parts);
  return { checked, blockers: checked ? assemblyBlockers(step, parts) : [] };
}

/** 单个卡控项的短文案，如「发条 超差 +0.03mm」 */
export function blockerLabel(b: PartBlocker): string {
  if (b.state === 'pending') return `${b.part.name} 未实测`;
  return `${b.part.name} 超差 ${fmtSignedMm(b.deviation)}mm`;
}

/** 完整说明，用于报错与提示：指出哪只零件、差多少 */
export function formatBlockers(blockers: PartBlocker[]): string {
  return blockers
    .map((b) => {
      if (b.state === 'pending') {
        return `${b.part.name}（${b.part.position}）尚未实测`;
      }
      return (
        `${b.part.name}（${b.part.position}）实测 ${fmtMm(b.part.measuredDimension)}mm / ` +
        `标准 ${fmtMm(b.part.stdDimension)}±${fmtMm(b.part.tolerance)}mm，` +
        `偏差 ${fmtSignedMm(b.deviation)}mm，超差 ${fmtMm(b.overBy)}mm`
      );
    })
    .join('；');
}
