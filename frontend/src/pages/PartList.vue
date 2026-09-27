<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useClockStore } from '../stores/clockStore';
import { usePartStore } from '../stores/partStore';
import StateBadge from '../components/common/StateBadge.vue';
import {
  MEASURE_STATES,
  MEASURE_STATE_LABELS,
  PART_DECISIONS,
  PART_NAMES,
  WEAR_STATES,
  deviation,
  fmtMm,
  fmtSignedMm,
  measureState,
  overTolerance,
  type MeasureState,
  type MovementPart,
  type MovementPartDraft,
  type PartDecision,
  type WearState,
} from '../types/part';

const clockStore = useClockStore();
const partStore = usePartStore();

const wearFilter = ref<WearState | 'all'>('all');
const clockFilter = ref('all');
const onlyPending = ref(false);
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const error = ref('');

const blankForm = (): MovementPartDraft => ({
  clockId: '',
  name: '发条',
  qtyNeeded: 1,
  position: '',
  wearState: '磨损',
  decision: '修配',
  sourceLot: '',
  stdDimension: 1,
  tolerance: 0.05,
  measuredDimension: null,
});

const form = reactive<MovementPartDraft>(blankForm());

/** 实测录入草稿：未触碰时回退到已保存的实测值 */
const measureDraft = reactive<Record<string, number | null>>({});

const rows = computed(() =>
  partStore.items.filter((p) => {
    if (wearFilter.value !== 'all' && p.wearState !== wearFilter.value) return false;
    if (clockFilter.value !== 'all' && p.clockId !== clockFilter.value) return false;
    if (onlyPending.value && !(p.decision !== '保留' && p.wearState !== '完好')) return false;
    return true;
  }),
);

/** 按实测判定分组：待测（含老数据待补录）/ 合格 / 超差 */
const groups = computed(() =>
  MEASURE_STATES.map((state) => ({
    state,
    label: MEASURE_STATE_LABELS[state],
    rows: rows.value.filter((p) => measureState(p) === state),
  })),
);

const measureCounts = computed(() => {
  const counts: Record<MeasureState, number> = { pending: 0, ok: 0, out: 0 };
  for (const p of partStore.items) counts[measureState(p)] += 1;
  return counts;
});

const pendingCount = computed(
  () => partStore.items.filter((p) => p.decision !== '保留' && p.wearState !== '完好').length,
);

function clockNo(clockId: string): string {
  return clockStore.byId(clockId)?.clockNo ?? '未知钟表';
}

function draftValue(row: MovementPart): number | null {
  return row.id in measureDraft ? measureDraft[row.id] : row.measuredDimension;
}

function openDialog() {
  editingId.value = null;
  Object.assign(form, blankForm());
  form.clockId = clockFilter.value !== 'all' ? clockFilter.value : clockStore.items[0]?.id ?? '';
  dialogVisible.value = true;
  error.value = '';
}

/** 老零件补录 / 规格修订：保留原值带入表单 */
function openEdit(row: MovementPart) {
  editingId.value = row.id;
  Object.assign(form, {
    clockId: row.clockId,
    name: row.name,
    qtyNeeded: row.qtyNeeded,
    position: row.position,
    wearState: row.wearState,
    decision: row.decision,
    sourceLot: row.sourceLot,
    stdDimension: row.stdDimension,
    tolerance: row.tolerance,
    measuredDimension: row.measuredDimension,
  });
  dialogVisible.value = true;
  error.value = '';
}

async function submit() {
  if (!form.clockId) {
    error.value = '请选择所属钟表';
    return;
  }
  if (!form.position.trim()) {
    error.value = '装配位置必填';
    return;
  }
  if (form.tolerance < 0) {
    error.value = '允许误差不能为负';
    return;
  }
  const payload = { ...form, position: form.position.trim(), sourceLot: form.sourceLot.trim() };
  if (editingId.value) {
    await partStore.update(editingId.value, payload);
    ElMessage.success('零件规格已更新');
  } else {
    await partStore.add(payload);
    ElMessage.success('已登记零件');
  }
  dialogVisible.value = false;
}

/** 录入实测尺寸并自动判定合格/超差；清空则回到待测 */
async function saveMeasurement(row: MovementPart) {
  const value = draftValue(row);
  await partStore.recordMeasurement(row.id, value);
  delete measureDraft[row.id];
  if (value === null || value === undefined) {
    ElMessage.info(`「${row.name}」已清除实测值，回到待测`);
    return;
  }
  const updated = partStore.byId(row.id);
  if (!updated) return;
  const dev = deviation(updated);
  if (measureState(updated) === 'ok') {
    ElMessage.success(`「${row.name}」判定合格，偏差 ${fmtSignedMm(dev)}mm`);
  } else {
    ElMessage.error(
      `「${row.name}」超差：偏差 ${fmtSignedMm(dev)}mm，超出允许误差 ${fmtMm(overTolerance(updated))}mm`,
    );
  }
}

async function setDecision(id: string, decision: PartDecision) {
  await partStore.update(id, { decision });
  ElMessage.success(`处理决定已改为「${decision}」`);
}

onMounted(async () => {
  await clockStore.load();
  await partStore.load();
});
</script>

<template>
  <div class="page">
    <div class="header">
      <h2>零件与配换清单</h2>
      <el-tag>共 {{ partStore.items.length }} 项</el-tag>
      <el-tag type="warning">待测 {{ measureCounts.pending }} 项</el-tag>
      <el-tag type="success">合格 {{ measureCounts.ok }} 项</el-tag>
      <el-tag type="danger">超差 {{ measureCounts.out }} 项</el-tag>
      <el-tag type="warning" effect="plain">待修配 {{ pendingCount }} 项</el-tag>
      <div class="spacer" />
      <el-button type="primary" @click="openDialog">登记零件</el-button>
    </div>

    <el-card shadow="never">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="钟表">
          <el-select v-model="clockFilter" style="width: 220px">
            <el-option label="全部" value="all" />
            <el-option v-for="c in clockStore.items" :key="c.id" :label="c.clockNo" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="磨损状态">
          <el-select v-model="wearFilter" style="width: 140px">
            <el-option label="全部" value="all" />
            <el-option v-for="w in WEAR_STATES" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="onlyPending">只看待修配</el-checkbox>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-for="group in groups" :key="group.state" shadow="never">
      <template #header>
        <div class="card-head">
          <strong>{{ group.label }}<span v-if="group.state === 'pending'" class="muted">（含待补录）</span></strong>
          <el-tag
            size="small"
            :type="group.state === 'out' ? 'danger' : group.state === 'ok' ? 'success' : 'warning'"
            >{{ group.rows.length }} 项</el-tag
          >
        </div>
      </template>
      <el-table :data="group.rows" size="small" border>
        <el-table-column label="钟表" width="140">
          <template #default="{ row }">{{ clockNo(row.clockId) }}</template>
        </el-table-column>
        <el-table-column prop="name" label="零件" width="100" />
        <el-table-column prop="qtyNeeded" label="数量" width="70" />
        <el-table-column prop="position" label="装配位置" min-width="130" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StateBadge :label="row.wearState" :tone="row.wearState === '完好' ? 'success' : 'danger'" />
          </template>
        </el-table-column>
        <el-table-column label="处理决定" width="200">
          <template #default="{ row }">
            <el-radio-group :model-value="row.decision" size="small" @change="(v: unknown) => setDecision(row.id, String(v) as PartDecision)">
              <el-radio-button v-for="d in PART_DECISIONS" :key="d" :value="d">{{ d }}</el-radio-button>
            </el-radio-group>
          </template>
        </el-table-column>
        <el-table-column prop="sourceLot" label="来源批号" width="110" />
        <el-table-column label="标准尺寸 mm" width="100">
          <template #default="{ row }">{{ fmtMm(row.stdDimension) }}</template>
        </el-table-column>
        <el-table-column label="允许误差 mm" width="100">
          <template #default="{ row }">±{{ fmtMm(row.tolerance) }}</template>
        </el-table-column>
        <el-table-column label="实测录入 mm" width="210">
          <template #default="{ row }">
            <div class="measure-cell">
              <el-input-number
                :model-value="draftValue(row)"
                size="small"
                :min="0"
                :max="200"
                :step="0.01"
                :precision="3"
                placeholder="实测值"
                style="width: 120px"
                @update:model-value="(v: number | undefined) => (measureDraft[row.id] = v ?? null)"
              />
              <el-button size="small" type="primary" plain @click="saveMeasurement(row)">
                {{ row.measuredDimension === null ? '录入' : '重录' }}
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="判定 / 偏差" min-width="170">
          <template #default="{ row }">
            <template v-if="measureState(row) === 'pending'">
              <el-tag type="warning" size="small">待测</el-tag>
            </template>
            <template v-else-if="measureState(row) === 'ok'">
              <el-tag type="success" size="small">合格</el-tag>
              <span class="dev">偏差 {{ fmtSignedMm(deviation(row)) }}mm</span>
            </template>
            <template v-else>
              <el-tag type="danger" size="small">超差</el-tag>
              <span class="dev out">
                偏差 {{ fmtSignedMm(deviation(row)) }}mm，超 {{ fmtMm(overTolerance(row)) }}mm
              </span>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="待配" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.decision !== '保留' && row.wearState !== '完好'" type="warning" size="small">待修配</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="group.rows.length === 0" description="该分组暂无零件" :image-size="60" />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑零件（补录规格）' : '登记零件'" width="560px">
      <el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-bottom: 10px" />
      <el-form :model="form" label-width="110px">
        <el-form-item label="所属钟表">
          <el-select v-model="form.clockId" style="width: 100%">
            <el-option v-for="c in clockStore.items" :key="c.id" :label="c.clockNo" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="零件名称">
          <el-select v-model="form.name" style="width: 100%">
            <el-option v-for="n in PART_NAMES" :key="n" :label="n" :value="n" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="form.qtyNeeded" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="装配位置" required>
          <el-input v-model="form.position" placeholder="如 二轮上下轴孔" />
        </el-form-item>
        <el-form-item label="磨损状态">
          <el-select v-model="form.wearState" style="width: 100%">
            <el-option v-for="w in WEAR_STATES" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理决定">
          <el-select v-model="form.decision" style="width: 100%">
            <el-option v-for="d in PART_DECISIONS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源批号">
          <el-input v-model="form.sourceLot" placeholder="如 MS-2024-07" />
        </el-form-item>
        <el-form-item label="标准尺寸 mm" required>
          <el-input-number v-model="form.stdDimension" :min="0" :max="200" :step="0.01" :precision="3" />
        </el-form-item>
        <el-form-item label="允许误差 mm" required>
          <el-input-number v-model="form.tolerance" :min="0" :max="10" :step="0.01" :precision="3" />
          <span class="hint">± 公差，实测偏差超过即判超差</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.header h2 {
  margin: 0;
}
.spacer {
  flex: 1;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.muted {
  color: #7b8592;
  font-size: 13px;
  font-weight: 400;
}
.measure-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dev {
  margin-left: 8px;
  font-size: 12px;
  color: #7b8592;
}
.dev.out {
  color: #d93025;
  font-weight: 600;
}
.hint {
  margin-left: 10px;
  color: #7b8592;
  font-size: 13px;
}
</style>
