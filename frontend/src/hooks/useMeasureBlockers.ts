import { computed, unref, type Ref } from 'vue';
import { usePartStore } from '../stores/partStore';
import { useStepStore } from '../stores/stepStore';
import { assemblyBlockers } from '../types/step';
import type { MeasureBlocker } from '../types/part';

/**
 * 汇总某台钟表各工序的装配核查阻断项（未实测/超差的修配、换新件）。
 * 被钟表详情页与工序录入页消费，用来在页面上直接指出卡住的零件与偏差。
 */
export function useMeasureBlockers(clockId: string | Ref<string>) {
  const stepStore = useStepStore();
  const partStore = usePartStore();
  const id = computed(() => unref(clockId));

  const blockersByStep = computed(() => {
    const map = new Map<string, MeasureBlocker[]>();
    for (const step of stepStore.items) {
      if (step.clockId !== id.value) continue;
      const blockers = assemblyBlockers(step, partStore.items);
      if (blockers.length > 0) map.set(step.id, blockers);
    }
    return map;
  });

  return { blockersByStep };
}
