import { defineStore } from 'pinia';
import { db, toPlain } from '../utils/db';
import { newId } from '../utils/id';
import { assemblyBlockers, type RepairStep, type RepairStepDraft } from '../types/step';
import type { TimekeepingTest, TimekeepingTestDraft } from '../types/test';
import type { MeasureBlocker } from '../types/part';
import { usePartStore } from './partStore';

interface StepState {
  items: RepairStep[];
  tests: TimekeepingTest[];
  loaded: boolean;
}

/** 完成步骤的结果：被装配核查拦下时返回未实测/超差零件明细 */
export type FinishResult = { ok: true } | { ok: false; blockers: MeasureBlocker[] };

export const useStepStore = defineStore('step', {
  state: (): StepState => ({ items: [], tests: [], loaded: false }),
  getters: {
    byClock: (state) => (clockId: string) =>
      state.items.filter((it) => it.clockId === clockId).sort((a, b) => a.seq - b.seq),
    testsByClock: (state) => (clockId: string) =>
      state.tests.filter((it) => it.clockId === clockId).sort((a, b) => b.testedAt - a.testedAt),
  },
  actions: {
    async load() {
      const steps = await db.steps.toArray();
      steps.sort((a, b) => a.seq - b.seq || a.startedAt - b.startedAt);
      this.items = steps;
      const tests = await db.tests.toArray();
      this.tests = tests.sort((a, b) => b.testedAt - a.testedAt);
      this.loaded = true;
    },
    async add(draft: RepairStepDraft) {
      const record: RepairStep = { ...toPlain(draft), id: newId('stp') };
      await db.steps.put(toPlain(record));
      this.items = [...this.items, record];
      return record;
    },
    /**
     * 完成步骤。装配步骤关联的修配/换新件未实测或超差时拒绝完成，
     * 进度停在完成前；其余工序（未关联装配件）照常处理。
     */
    async finish(id: string): Promise<FinishResult> {
      const step = this.items.find((it) => it.id === id);
      if (!step) return { ok: true };
      const blockers = assemblyBlockers(step, usePartStore().items);
      if (blockers.length > 0) return { ok: false, blockers };
      const patch: Partial<RepairStep> = { state: 'done', finishedAt: Date.now() };
      await db.steps.update(id, patch);
      this.items = this.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
      return { ok: true };
    },
    async rollback(id: string) {
      const patch: Partial<RepairStep> = { state: 'rolledback', finishedAt: undefined };
      await db.steps.update(id, patch);
      this.items = this.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
    },
    /** 上下移动排序：交换两个相邻步骤的 seq */
    async swapSeq(aId: string, bId: string) {
      const a = this.items.find((it) => it.id === aId);
      const b = this.items.find((it) => it.id === bId);
      if (!a || !b) return;
      const aSeq = a.seq;
      await db.steps.update(a.id, { seq: b.seq });
      await db.steps.update(b.id, { seq: aSeq });
      this.items = this.items.map((it) => {
        if (it.id === a.id) return { ...it, seq: b.seq };
        if (it.id === b.id) return { ...it, seq: aSeq };
        return it;
      });
    },
    async addTest(draft: TimekeepingTestDraft) {
      const record: TimekeepingTest = { ...toPlain(draft), id: newId('tst') };
      await db.tests.put(toPlain(record));
      this.tests = [record, ...this.tests];
      return record;
    },
    async removeTest(id: string) {
      await db.tests.delete(id);
      this.tests = this.tests.filter((it) => it.id !== id);
    },
  },
});
