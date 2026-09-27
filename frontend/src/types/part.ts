/** 零件名称 */
export type PartName =
  | '条盒轮'
  | '二轮'
  | '擒纵轮'
  | '擒纵叉'
  | '摆轮'
  | '发条'
  | '宝石轴承'
  | '螺丝';

export const PART_NAMES: PartName[] = [
  '条盒轮',
  '二轮',
  '擒纵轮',
  '擒纵叉',
  '摆轮',
  '发条',
  '宝石轴承',
  '螺丝',
];

/** 磨损状态 */
export type WearState = '完好' | '磨损' | '断裂' | '锈蚀';

export const WEAR_STATES: WearState[] = ['完好', '磨损', '断裂', '锈蚀'];

/** 处理决定 */
export type PartDecision = '保留' | '修配' | '换新';

export const PART_DECISIONS: PartDecision[] = ['保留', '修配', '换新'];

/** 实测判定：待测（含老数据待补录）/ 合格 / 超差 */
export type MeasureState = 'pending' | 'ok' | 'out';

export const MEASURE_STATES: MeasureState[] = ['pending', 'ok', 'out'];

export const MEASURE_STATE_LABELS: Record<MeasureState, string> = {
  pending: '待测',
  ok: '合格',
  out: '超差',
};

/** 机芯零件 */
export interface MovementPart {
  id: string;
  clockId: string;
  name: PartName;
  /** 需要数量 */
  qtyNeeded: number;
  /** 装配位置 */
  position: string;
  wearState: WearState;
  decision: PartDecision;
  /** 配换来源批号 */
  sourceLot: string;
  /** 标准尺寸 mm */
  stdDimension: number;
  /** 允许误差 ±mm */
  tolerance: number;
  /** 实测尺寸 mm；null 表示尚未实测（待测/待补录） */
  measuredDimension: number | null;
}

export type MovementPartDraft = Omit<MovementPart, 'id'>;

/** 是否待修配（磨损且未换新） */
export function needsRepair(part: MovementPart): boolean {
  return part.decision !== '保留' && part.wearState !== '完好';
}

/** 实测判定：未录入实测值为待测，偏差在允许误差内为合格，否则超差 */
export function measureState(part: MovementPart): MeasureState {
  if (part.measuredDimension === null || part.measuredDimension === undefined) return 'pending';
  const dev = Math.abs(part.measuredDimension - part.stdDimension);
  // 1e-9 吸收浮点误差，避免 0.38-0.35 这类值误判
  return dev <= part.tolerance + 1e-9 ? 'ok' : 'out';
}

/** 偏差 mm（实测 - 标准），未实测返回 null */
export function deviation(part: MovementPart): number | null {
  if (part.measuredDimension === null || part.measuredDimension === undefined) return null;
  return round3(part.measuredDimension - part.stdDimension);
}

/** 超出允许误差的量 mm，合格或未实测返回 null */
export function overTolerance(part: MovementPart): number | null {
  if (measureState(part) !== 'out') return null;
  const dev = Math.abs((part.measuredDimension as number) - part.stdDimension);
  return round3(dev - part.tolerance);
}

/** 修配/换新件才需要实测卡控，保留件不参与 */
export function needsMeasure(part: MovementPart): boolean {
  return part.decision !== '保留';
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** mm 数值展示：去掉多余的 0，最多 3 位小数 */
export function fmtMm(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return String(round3(n));
}

/** 带符号的偏差展示，如 +0.03 / -0.015 */
export function fmtSignedMm(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const v = round3(n);
  return v > 0 ? `+${v}` : String(v);
}
