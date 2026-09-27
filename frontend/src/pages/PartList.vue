<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useClockStore } from '../stores/clockStore';
import { usePartStore } from '../stores/partStore';
import StateBadge from '../components/common/StateBadge.vue';
import {
  PART_DECISIONS,
  PART_NAMES,
  WEAR_STATES,
  formatDim,
  formatSigned,
  measureDeviation,
  measureStatusOf,
  measureTone,
  type MeasureStatus,
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
const error = ref('');

const form = reactive<MovementPartDraft>({
  clockId: '',
  name: '发条',
  qtyNeeded: 1,
  position: '',
  wearState: '磨损',
  decision: '修配',
  sourceLot: '',
  specDimension: 1,
  tolerance: 0.02,
});

/** 实测录入对话框 */
const measureVisible = ref(false);
const measureError = ref('');
const measureTarget = ref<MovementPart | null>(null);
const measureForm = reactive({
  specDimension: 0,
  tolerance: 0,
  measuredDimension: 0,
});

const rows = computed(() =>
  partStore.items.filter((p) => {
    if (wearFilter.value !== 'all' && p.wearState !== wearFilter.value) return false;
    if (clockFilter.value !== 'all' && p.clockId !== clockFilter.value) return false;
    if (onlyPending.value && !(p.decision !== '保留' && p.wearState !== '完好')) return false;
    return true;
  }),
);

/** 清单按测量状态分组：待补录并入待测组（同样还没实测） */
const groups = computed(() => {
  const of = (s: MeasureStatus) => rows.value.filter((p) => measureStatusOf(p) === s);
  const todo = [...of('待补录'), ...of('待测')];
  return [
    { key: 'todo', title: '待测', rows: todo, pendingFill: of('待补录').length },
    { key: 'pass', title: '合格', rows: of('合格'), pendingFill: 0 },
    { key: 'fail', title: '超差', rows: of('超差'), pendingFill: 0 },
  ];
});

const pendingCount = computed(
  () => partStore.items.filter((p) => p.decision !== '保留' && p.wearState !== '完好').length,
);
const todoCount = computed(() => {
  const all = partStore.items.map(measureStatusOf);
  return all.filter((s) => s === '待测' || s === '待补录').length;
});
const failCount = computed(
  () => partStore.items.filter((p) => measureStatusOf(p) === '超差').length,
);

function clockNo(clockId: string): string {
  return clockStore.byId(clockId)?.clockNo ?? '未知钟表';
}

function openDialog() {
  dialogVisible.value = true;
  error.value = '';
  form.clockId = clockFilter.value !== 'all' ? clockFilter.value : clockStore.items[0]?.id ?? '';
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
  if (!form.specDimension || form.specDimension <= 0) {
    error.value = '标准尺寸必填且大于 0';
    return;
  }
  if (!form.tolerance || form.tolerance <= 0) {
    error.value = '允许误差必填且大于 0';
    return;
  }
  await partStore.add({
    ...form,
    position: form.position.trim(),
    sourceLot: form.sourceLot.trim(),
  });
  dialogVisible.value = false;
  ElMessage.success('已登记零件，来件后请录入实测尺寸');
  form.position = '';
  form.sourceLot = '';
}

async function setDecision(id: string, decision: PartDecision) {
  await partStore.update(id, { decision });
  ElMessage.success(`处理决定已改为「${decision}」`);
}

function openMeasure(part: MovementPart) {
  measureTarget.value = part;
  measureError.value = '';
  measureForm.specDimension = part.specDimension ?? 0;
  measureForm.tolerance = part.tolerance ?? 0;
  measureForm.measuredDimension = part.measuredDimension ?? part.specDimension ?? 0;
  measureVisible.value = true;
}

/** 对话框内实时预判：与保存后的判定口径一致 */
const measurePreview = computed<MeasureStatus | ''>(() => {
  if (!measureForm.specDimension || !measureForm.tolerance) return '';
  const dev = measureForm.measuredDimension - measureForm.specDimension;
  return Math.abs(dev) <= measureForm.tolerance + 1e-9 ? '合格' : '超差';
});

const measurePreviewText = computed(() => {
  if (!measurePreview.value) return '';
  const dev = measureForm.measuredDimension - measureForm.specDimension;
  const base = `偏差 ${formatSigned(dev)}mm`;
  if (measurePreview.value === '合格') return `${base}，在允差内`;
  return `${base}，超允差 ${(Math.abs(dev) - measureForm.tolerance).toFixed(3)}mm`;
});

async function submitMeasure() {
  const part = measureTarget.value;
  if (!part) return;
  if (!measureForm.specDimension || measureForm.specDimension <= 0) {
    measureError.value = '标准尺寸必填且大于 0';
    return;
  }
  if (!measureForm.tolerance || measureForm.tolerance <= 0) {
    measureError.value = '允许误差必填且大于 0';
    return;
  }
  await partStore.update(part.id, {
    specDimension: measureForm.specDimension,
    tolerance: measureForm.tolerance,
    measuredDimension: measureForm.measuredDimension,
    measuredAt: Date.now(),
  });
  measureVisible.value = false;
  const status = measurePreview.value || measureStatusOf({ ...part, ...measureForm });
  if (status === '超差') ElMessage.warning(`实测已录入，判定：${status}`);
  else ElMessage.success(`实测已录入，判定：${status}`);
}

async function clearMeasure() {
  const part = measureTarget.value;
  if (!part) return;
  await partStore.clearMeasurement(part.id);
  measureVisible.value = false;
  ElMessage.info('已撤销实测，零件回到待测');
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
      <el-tag type="warning">待修配 {{ pendingCount }} 项</el-tag>
      <el-tag type="warning" effect="plain">待测 {{ todoCount }} 项</el-tag>
      <el-tag type="danger" effect="plain">超差 {{ failCount }} 项</el-tag>
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

    <el-card v-for="group in groups" :key="group.key" shadow="never">
      <template #header>
        <div class="card-head">
          <strong>{{ group.title }}</strong>
          <el-tag size="small" type="info">{{ group.rows.length }} 项</el-tag>
          <el-tag v-if="group.pendingFill" size="small" type="danger">
            含待补录 {{ group.pendingFill }} 项
          </el-tag>
        </div>
      </template>
      <el-table :data="group.rows" size="small" border>
        <el-table-column label="钟表" width="140">
          <template #default="{ row }">{{ clockNo(row.clockId) }}</template>
        </el-table-column>
        <el-table-column prop="name" label="零件" width="100" />
        <el-table-column prop="qtyNeeded" label="数量" width="70" />
        <el-table-column prop="position" label="装配位置" min-width="130" />
        <el-table-column label="磨损" width="80">
          <template #default="{ row }">
            <StateBadge :label="row.wearState" :tone="row.wearState === '完好' ? 'success' : 'danger'" />
          </template>
        </el-table-column>
        <el-table-column label="处理决定" width="190">
          <template #default="{ row }">
            <el-radio-group :model-value="row.decision" size="small" @change="(v: unknown) => setDecision(row.id, String(v) as PartDecision)">
              <el-radio-button v-for="d in PART_DECISIONS" :key="d" :value="d">{{ d }}</el-radio-button>
            </el-radio-group>
          </template>
        </el-table-column>
        <el-table-column prop="sourceLot" label="来源批号" width="120" />
        <el-table-column label="标准 mm" width="100">
          <template #default="{ row }">{{ formatDim(row.specDimension) }}</template>
        </el-table-column>
        <el-table-column label="允差 mm" width="90">
          <template #default="{ row }">{{ formatDim(row.tolerance) }}</template>
        </el-table-column>
        <el-table-column label="实测 mm" width="100">
          <template #default="{ row }">{{ formatDim(row.measuredDimension) }}</template>
        </el-table-column>
        <el-table-column label="偏差 mm" width="100">
          <template #default="{ row }">
            <span v-if="measureDeviation(row) !== undefined">{{ formatSigned(measureDeviation(row)!) }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="判定" width="90">
          <template #default="{ row }">
            <StateBadge :label="measureStatusOf(row)" :tone="measureTone(measureStatusOf(row))" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button size="small" @click="openMeasure(row)">
              {{ measureStatusOf(row) === '待补录' ? '补录/实测' : '录入实测' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="group.rows.length === 0" :description="`暂无${group.title}零件`" :image-size="60" />
    </el-card>

    <el-dialog v-model="dialogVisible" title="登记零件" width="560px">
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
          <el-input-number v-model="form.specDimension" :min="0" :max="200" :step="0.01" :precision="3" />
        </el-form-item>
        <el-form-item label="允许误差 mm" required>
          <el-input-number v-model="form.tolerance" :min="0" :max="10" :step="0.01" :precision="3" />
          <span class="hint">± 允差，1 丝 = 0.01mm</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="measureVisible" title="实测尺寸录入" width="520px">
      <el-alert v-if="measureError" :title="measureError" type="error" :closable="false" style="margin-bottom: 10px" />
      <el-alert
        v-if="measureTarget && measureStatusOf(measureTarget) === '待补录'"
        title="该零件缺标准尺寸/允差（老档案升级），请一并补录"
        type="warning"
        :closable="false"
        style="margin-bottom: 10px"
      />
      <el-form label-width="110px">
        <el-form-item label="零件">
          <span>{{ measureTarget?.name }} · {{ measureTarget?.position }}</span>
        </el-form-item>
        <el-form-item label="标准尺寸 mm" required>
          <el-input-number v-model="measureForm.specDimension" :min="0" :max="200" :step="0.01" :precision="3" />
        </el-form-item>
        <el-form-item label="允许误差 mm" required>
          <el-input-number v-model="measureForm.tolerance" :min="0" :max="10" :step="0.01" :precision="3" />
        </el-form-item>
        <el-form-item label="实测尺寸 mm" required>
          <el-input-number v-model="measureForm.measuredDimension" :min="0" :max="200" :step="0.01" :precision="3" />
        </el-form-item>
        <el-form-item v-if="measurePreview" label="判定">
          <StateBadge :label="measurePreview" :tone="measureTone(measurePreview)" />
          <span class="hint">{{ measurePreviewText }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="measureTarget?.measuredDimension !== undefined" type="warning" plain @click="clearMeasure">
          撤销实测
        </el-button>
        <el-button @click="measureVisible = false">取消</el-button>
        <el-button type="primary" @click="submitMeasure">保存并判定</el-button>
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
.hint {
  margin-left: 10px;
  color: #7b8592;
  font-size: 13px;
}
</style>
