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

/** 测量判定状态：待补录（缺标准尺寸/允差）→ 待测 → 合格 / 超差 */
export type MeasureStatus = '待补录' | '待测' | '合格' | '超差';

export const MEASURE_STATUSES: MeasureStatus[] = ['待补录', '待测', '合格', '超差'];

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
  /** 标准尺寸 mm（登记时必填；老数据迁移后可能缺失，进入待补录） */
  specDimension?: number;
  /** 允许误差 mm（±） */
  tolerance?: number;
  /** 实测尺寸 mm（来件后录入） */
  measuredDimension?: number;
  /** 实测录入时间 */
  measuredAt?: number;
}

export type MovementPartDraft = Omit<MovementPart, 'id'>;

/** 是否待修配（磨损且未换新） */
export function needsRepair(part: MovementPart): boolean {
  return part.decision !== '保留' && part.wearState !== '完好';
}

/** 判定零件当前的测量状态 */
export function measureStatusOf(part: MovementPart): MeasureStatus {
  if (part.specDimension === undefined || part.tolerance === undefined) return '待补录';
  if (part.measuredDimension === undefined) return '待测';
  // 1e-9 抵消浮点误差，|实测-标准| ≤ 允差 判合格
  return Math.abs(part.measuredDimension - part.specDimension) <= part.tolerance + 1e-9
    ? '合格'
    : '超差';
}

/** 偏差 = 实测 - 标准（未实测或无标准尺寸时无值） */
export function measureDeviation(part: MovementPart): number | undefined {
  if (part.measuredDimension === undefined || part.specDimension === undefined) return undefined;
  return part.measuredDimension - part.specDimension;
}

/** 超出允差的量（仅超差时有值） */
export function overToleranceBy(part: MovementPart): number | undefined {
  const dev = measureDeviation(part);
  if (dev === undefined || part.tolerance === undefined) return undefined;
  const over = Math.abs(dev) - part.tolerance;
  return over > 1e-9 ? over : undefined;
}

/** 装配核查未通过的零件条目 */
export interface MeasureBlocker {
  part: MovementPart;
  /** 只可能是 待补录 / 待测 / 超差 */
  status: MeasureStatus;
  /** 偏差 mm（已实测时） */
  deviation?: number;
  /** 超出允差的量 mm（超差时） */
  overBy?: number;
}

/** 尺寸显示：保留 3 位小数（丝级），无值显示 — */
export function formatDim(n: number | undefined): string {
  return n === undefined ? '—' : n.toFixed(3);
}

/** 带符号偏差显示 */
export function formatSigned(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(3)}`;
}

/** 阻断原因的一句话描述：哪只零件、差多少 */
export function blockerText(b: MeasureBlocker): string {
  const p = b.part;
  const label = `${p.name}（${p.position}）`;
  if (b.status === '待补录') return `${label}：缺标准尺寸/允差，待补录`;
  if (b.status === '待测') return `${label}：来件未实测`;
  return `${label}：实测 ${formatDim(p.measuredDimension)} / 标准 ${formatDim(p.specDimension)}±${formatDim(p.tolerance)}，偏差 ${formatSigned(b.deviation ?? 0)}mm，超允差 ${(b.overBy ?? 0).toFixed(3)}mm`;
}

/** 测量状态对应的角标色调 */
export function measureTone(s: MeasureStatus): 'success' | 'warning' | 'danger' {
  if (s === '合格') return 'success';
  if (s === '待测') return 'warning';
  return 'danger';
}
