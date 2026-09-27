import {
  measureDeviation,
  measureStatusOf,
  overToleranceBy,
  type MeasureBlocker,
  type MovementPart,
} from './part';

/** 维修步骤类型 */
export type StepType = '拆解' | '清洗' | '润滑' | '装配' | '调试' | '走时测试';

export const STEP_TYPES: StepType[] = ['拆解', '清洗', '润滑', '装配', '调试', '走时测试'];

/** 步骤状态 */
export type StepState = 'pending' | 'done' | 'rolledback';

/** 各步骤类型的动态字段开关 */
export const STEP_FIELD_MAP: Record<
  StepType,
  { needSolvent: boolean; needOil: boolean; needTorque: boolean }
> = {
  拆解: { needSolvent: false, needOil: false, needTorque: true },
  清洗: { needSolvent: true, needOil: false, needTorque: false },
  润滑: { needSolvent: false, needOil: true, needTorque: false },
  装配: { needSolvent: false, needOil: true, needTorque: true },
  调试: { needSolvent: false, needOil: false, needTorque: false },
  走时测试: { needSolvent: false, needOil: false, needTorque: false },
};

/** 维修工序 */
export interface RepairStep {
  id: string;
  clockId: string;
  stepType: StepType;
  /** 顺序号，不得跳号 */
  seq: number;
  /** 关联零件 */
  partIds: string[];
  /** 清洗液 */
  cleanSolvent: string;
  /** 清洗方式 */
  cleanMethod: string;
  /** 润滑油脂型号 */
  oilType: string;
  /** 润滑点位 */
  oilPoints: string;
  /** 拧紧力矩 N·m */
  torque: number;
  troubleNote: string;
  operator: string;
  startedAt: number;
  finishedAt?: number;
  state: StepState;
}

export type RepairStepDraft = Omit<RepairStep, 'id'>;

/**
 * 装配核查：装配步骤关联的修配/换新件中，仍未实测（待补录/待测）或超差的零件。
 * 返回空数组表示可正常完成；未关联装配件的工序一律照常处理。
 */
export function assemblyBlockers(step: RepairStep, parts: MovementPart[]): MeasureBlocker[] {
  if (step.stepType !== '装配' || step.partIds.length === 0) return [];
  const blockers: MeasureBlocker[] = [];
  for (const pid of step.partIds) {
    const part = parts.find((p) => p.id === pid);
    if (!part || part.decision === '保留') continue;
    const status = measureStatusOf(part);
    if (status === '合格') continue;
    blockers.push({
      part,
      status,
      deviation: measureDeviation(part),
      overBy: overToleranceBy(part),
    });
  }
  return blockers;
}
