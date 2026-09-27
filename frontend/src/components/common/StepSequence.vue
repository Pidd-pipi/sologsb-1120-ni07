<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RepairStep } from '../../types/step';
import { blockerText, type MeasureBlocker } from '../../types/part';
import { findSeqGaps } from '../../utils/id';
import StateBadge from './StateBadge.vue';

const props = defineProps<{
  items: RepairStep[];
  /** 是否展示上下移动/拖拽排序 */
  sortable?: boolean;
  /** 各步骤的装配核查阻断项（未实测/超差零件） */
  blockers?: Map<string, MeasureBlocker[]>;
}>();

const emit = defineEmits<{
  (e: 'finish', id: string): void;
  (e: 'rollback', id: string): void;
  (e: 'move', payload: { id: string; direction: 'up' | 'down' }): void;
  (e: 'reorder', payload: { fromId: string; toId: string }): void;
}>();

const dragId = ref<string>('');

const gaps = computed(() => findSeqGaps(props.items.map((it) => it.seq)));
const conflict = computed(() => gaps.value.length > 0);

function blockersOf(id: string): MeasureBlocker[] {
  return props.blockers?.get(id) ?? [];
}

function onDragStart(id: string) {
  dragId.value = id;
}
function onDrop(toId: string) {
  if (dragId.value && dragId.value !== toId) {
    emit('reorder', { fromId: dragId.value, toId });
  }
  dragId.value = '';
}
</script>

<template>
  <div class="seq-wrap" data-testid="step-sequence">
    <el-alert
      v-if="conflict"
      type="error"
      :closable="false"
      show-icon
      :title="`顺序号存在缺口：${gaps.join('、')}（不得跳号，请用上下移动补齐）`"
      style="margin-bottom: 10px"
    />
    <el-table :data="items" size="small" border>
      <el-table-column label="顺序" width="80">
        <template #default="{ row }">
          <span :class="{ gap: conflict && gaps.includes(row.seq) }">#{{ row.seq }}</span>
        </template>
      </el-table-column>
      <el-table-column label="步骤" width="110">
        <template #default="{ row }">{{ row.stepType }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <StateBadge :state="row.state" />
        </template>
      </el-table-column>
      <el-table-column label="清洗/润滑" min-width="200">
        <template #default="{ row }">
          <div v-if="row.cleanSolvent">清洗液：{{ row.cleanSolvent }}（{{ row.cleanMethod }}）</div>
          <div v-if="row.oilType">油脂：{{ row.oilType }} · 点位 {{ row.oilPoints }}</div>
          <div v-if="row.torque">力矩：{{ row.torque }} N·m</div>
          <div v-if="!row.cleanSolvent && !row.oilType && !row.torque">—</div>
        </template>
      </el-table-column>
      <el-table-column label="装配核查" min-width="240">
        <template #default="{ row }">
          <template v-if="blockersOf(row.id).length">
            <div v-for="b in blockersOf(row.id)" :key="b.part.id" class="blocker-line">
              <el-tag size="small" :type="b.status === '超差' ? 'danger' : 'warning'">{{ b.status }}</el-tag>
              <span>{{ blockerText(b) }}</span>
            </div>
          </template>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="异常说明" min-width="160">
        <template #default="{ row }">{{ row.troubleNote || '—' }}</template>
      </el-table-column>
      <el-table-column label="责任人" width="100">
        <template #default="{ row }">{{ row.operator }}</template>
      </el-table-column>
      <el-table-column label="操作" width="250">
        <template #default="{ row, $index }">
          <el-button
            v-if="row.state !== 'done'"
            size="small"
            type="primary"
            :disabled="blockersOf(row.id).length > 0"
            :title="blockersOf(row.id).length > 0 ? '装配核查未通过：先实测/处理关联零件' : ''"
            @click="emit('finish', row.id)"
          >
            完成
          </el-button>
          <el-button v-else size="small" type="warning" @click="emit('rollback', row.id)">回退</el-button>
          <template v-if="sortable">
            <el-button size="small" :disabled="$index === 0" @click="emit('move', { id: row.id, direction: 'up' })">
              上移
            </el-button>
            <el-button
              size="small"
              :disabled="$index === items.length - 1"
              @click="emit('move', { id: row.id, direction: 'down' })"
            >
              下移
            </el-button>
          </template>
          <span
            class="drag-handle"
            draggable="true"
            title="拖拽到目标行可交换顺序"
            @dragstart="onDragStart(row.id)"
            @dragover.prevent
            @drop="onDrop(row.id)"
            >⣿</span
          >
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="items.length === 0" description="暂无工序，请到「新建维修工序」登记" />
  </div>
</template>

<style scoped>
.gap {
  color: #d93025;
  font-weight: 700;
}
.blocker-line {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.6;
  color: #b3261e;
  font-size: 12px;
}
.drag-handle {
  margin-left: 8px;
  cursor: grab;
  color: #97a0ad;
  user-select: none;
}
</style>
