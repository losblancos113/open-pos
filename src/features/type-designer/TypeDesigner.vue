<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, Progress, Select } from '@vuetify/v0';
import { SUPPORTED_LOCALES } from '@/i18n';
import type { SupportedLocale } from '@/i18n';
import type { DbAdapter } from '@/core/db/adapter';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { DATA_TYPES } from '@/core/types/definition';
import type {
  DataType,
  FieldDefinition,
  LocalizedText,
  TypeDefinition,
  TypeDefinitionDoc,
  TypeKind,
} from '@/core/types/definition';
import { validateTypeDefinition } from '@/core/types/definition-validation';
import type {
  DefinitionValidationCode,
  DefinitionValidationIssue,
} from '@/core/types/definition-validation';
import { migrateCollection } from '@/core/types/migration';
import type { BackgroundMigrationProgress, MigrationTransform } from '@/core/types/migration';
import { createRecordRepository } from '@/core/types/record-repository';
import type { RecordDocument, RecordRepository } from '@/core/types/record-repository';
import { createTypeRegistry } from '@/core/types/type-registry';
import type { TypeRegistry } from '@/core/types/type-registry';
import DynamicForm from './DynamicForm.vue';
import DynamicList from './DynamicList.vue';

const { t, locale } = useI18n();

/** M1 chưa có khái niệm chi nhánh — mọi type/record tạo từ UI thuộc chi nhánh mặc định. */
const BRANCH_ID = 'hq';

const KIND_OPTIONS: readonly TypeKind[] = ['entity', 'builtin_ext'];

const KIND_KEYS: Record<TypeKind, string> = {
  entity: 'type.kind.entity',
  builtin_ext: 'type.kind.builtinExt',
};

/** Dịch `DefinitionValidationCode` sang khoá i18n — phải phủ hết union. */
const ISSUE_KEYS: Record<DefinitionValidationCode, string> = {
  reserved_key: 'type.error.reservedKey',
  duplicate_key: 'type.error.duplicateKey',
  unknown_data_type: 'type.error.unknownDataType',
  missing_options: 'type.error.missingOptions',
  duplicate_option: 'type.error.duplicateOption',
  missing_reference_type: 'type.error.missingReferenceType',
  too_many_indexed: 'type.error.tooManyIndexed',
  unknown_list_field: 'type.error.unknownListField',
  unknown_field: 'type.error.unknownField',
  formula_cycle: 'type.error.formulaCycle',
  formula_unsupported_type: 'type.error.formulaUnsupportedType',
  formula_syntax: 'type.error.formulaSyntax',
};

/** `label` dùng `LocalizedText` để bản nháp có đúng hình dạng miền dữ liệu. */
interface DraftOption {
  value: string;
  label: LocalizedText;
}

interface DraftField {
  /** Key lúc nạp từ type đã lưu — rỗng nghĩa là field mới thêm. */
  originalKey: string;
  key: string;
  label: LocalizedText;
  dataType: DataType;
  required: boolean;
  indexed: boolean;
  formula: string;
  referenceType: string;
  options: DraftOption[];
}

interface DraftType {
  key: string;
  kind: TypeKind;
  baseType: string;
  name: LocalizedText;
}

const adapter = ref<DbAdapter | null>(null);
const registry = ref<TypeRegistry | null>(null);
const repo = ref<RecordRepository | null>(null);

const ready = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);

const types = ref<readonly TypeDefinitionDoc[]>([]);
const records = ref<readonly RecordDocument[]>([]);

const migrating = ref(false);
const progress = ref<BackgroundMigrationProgress | null>(null);

const selectedKey = ref<string | null>(null);
const draft = ref<DraftType>(blankDraft());
const rows = ref<DraftField[]>([]);
const record = ref<Record<string, unknown>>({});

function blankDraft(): DraftType {
  return { key: '', kind: 'entity', baseType: '', name: { vi: '', en: '' } };
}

const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

const isEditing = computed(() => selectedKey.value !== null);

const selectedType = computed<TypeDefinitionDoc | null>(() => {
  const key = selectedKey.value;
  if (key === null) return null;
  return types.value.find((type) => type.key === key) ?? null;
});

/** Field bỏ trống key chưa phải field thật — không đẩy vào engine để tránh lỗi nhiễu. */
function buildFields(): readonly FieldDefinition[] {
  return rows.value.filter((row) => row.key.trim() !== '').map(toFieldDefinition);
}

function toFieldDefinition(row: DraftField): FieldDefinition {
  const definition: {
    key: string;
    label: LocalizedText;
    dataType: DataType;
    required: boolean;
    options?: readonly { value: string; label: LocalizedText }[];
    formula?: string;
    referenceType?: string;
    indexed?: boolean;
  } = {
    key: row.key.trim(),
    label: row.label,
    dataType: row.dataType,
    required: row.required,
  };

  if (row.indexed) definition.indexed = true;
  if (row.dataType === 'select' || row.dataType === 'multiselect') {
    definition.options = row.options
      .filter((option) => option.value.trim() !== '')
      .map((option) => ({ value: option.value.trim(), label: option.label }));
  }
  if (row.dataType === 'formula') definition.formula = row.formula;
  if (row.dataType === 'reference') definition.referenceType = row.referenceType.trim();

  return definition;
}

/** Bản type đang soạn — dùng chung cho validate, lưu và preview. */
const definition = computed<TypeDefinition>(() => {
  const saved = selectedType.value;
  return {
    key: draft.value.key.trim(),
    kind: draft.value.kind,
    baseType: draft.value.kind === 'builtin_ext' ? draft.value.baseType.trim() : null,
    name: draft.value.name,
    version: saved === null ? 1 : saved.version,
    fields: buildFields(),
    listView: [],
  };
});

const issues = computed<readonly DefinitionValidationIssue[]>(() =>
  validateTypeDefinition(definition.value),
);

/** Lỗi không gắn được với field nào (vd. cột list view) hiện ở cấp type. */
const typeIssues = computed(() =>
  issues.value.filter((issue) => !rows.value.some((row) => row.key.trim() === issue.path)),
);

function issuesForRow(row: DraftField): readonly DefinitionValidationIssue[] {
  const key = row.key.trim();
  if (key === '') return [];
  return issues.value.filter((issue) => issue.path === key);
}

function issueText(issue: DefinitionValidationIssue): string {
  return t(ISSUE_KEYS[issue.code]);
}

const canSave = computed(
  () => draft.value.key.trim() !== '' && draft.value.name.vi.trim() !== '' && issues.value.length === 0,
);

/** Chỉ mời chạy khi có bậc version thật sự có transform — bậc rỗng là no-op. */
const canMigrate = computed(() => {
  const saved = selectedType.value;
  if (saved === null) return false;
  return saved.migrations.some((step) => step.transforms.length > 0);
});

async function loadTypes(): Promise<void> {
  const current = registry.value;
  if (current === null) return;
  types.value = await current.listTypes();
}

async function loadRecords(): Promise<void> {
  const current = repo.value;
  const typeKey = selectedKey.value;
  if (current === null || typeKey === null) {
    records.value = [];
    return;
  }
  records.value = await current.list(typeKey);
}

onMounted(async () => {
  try {
    const created = await createMemoryAdapter();
    adapter.value = created;
    registry.value = createTypeRegistry(created);
    repo.value = createRecordRepository(created);
    await loadTypes();
    ready.value = true;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  }
});

function startNewType(): void {
  selectedKey.value = null;
  draft.value = blankDraft();
  rows.value = [];
  records.value = [];
  record.value = {};
  progress.value = null;
  saveError.value = null;
}

function selectType(type: TypeDefinitionDoc): void {
  selectedKey.value = type.key;
  draft.value = {
    key: type.key,
    kind: type.kind,
    baseType: type.baseType ?? '',
    name: { ...type.name },
  };
  rows.value = type.fields.map((field) => ({
    originalKey: field.key,
    key: field.key,
    label: { ...field.label },
    dataType: field.dataType,
    required: field.required,
    indexed: field.indexed === true,
    formula: field.formula ?? '',
    referenceType: field.referenceType ?? '',
    options: (field.options ?? []).map((option) => ({
      value: option.value,
      label: { ...option.label },
    })),
  }));
  record.value = {};
  progress.value = null;
  saveError.value = null;
  void loadRecords();
}

function setKind(value: unknown): void {
  draft.value.kind = value === 'builtin_ext' ? 'builtin_ext' : 'entity';
}

function setDataType(row: DraftField, value: unknown): void {
  if (typeof value === 'string' && (DATA_TYPES as readonly string[]).includes(value)) {
    row.dataType = value as DataType;
  }
}

function setFlag(row: DraftField, flag: 'required' | 'indexed', value: boolean | undefined): void {
  row[flag] = value === true;
}

function addRow(): void {
  rows.value.push({
    originalKey: '',
    key: '',
    label: { vi: '', en: '' },
    dataType: 'text',
    required: false,
    indexed: false,
    formula: '',
    referenceType: '',
    options: [],
  });
}

function removeRow(index: number): void {
  rows.value.splice(index, 1);
}

function addOption(row: DraftField): void {
  row.options.push({ value: '', label: { vi: '', en: '' } });
}

function removeOption(row: DraftField, index: number): void {
  row.options.splice(index, 1);
}

/**
 * Transform cho bậc version mới, suy ra từ bản nháp.
 *
 * Đổi `key` của một field chính là rename — dữ liệu cũ phải theo key mới, nếu không
 * record cũ mất giá trị.
 *
 * Field bị xoá khỏi bản nháp **cố ý không** sinh `removeField`. Xoá field là sửa
 * *schema*, còn `removeField` là xoá *dữ liệu đã ghi* — hai việc khác nhau, và không
 * có undo. Nếu admin xoá nhầm một field thì giá trị cũ vẫn nằm nguyên trong record;
 * nó chỉ đơn giản là không còn field nào khai báo nên không hiện trên UI. Dọn dữ liệu
 * phải là một bước riêng, có chủ đích.
 *
 * Vì bậc version mới có `transforms` rỗng, `migrateRecordOnRead` thấy `applied` rỗng
 * nên không ghi gì — record giữ nguyên `schemaVersion` cũ và không mất dữ liệu.
 * `canMigrate` cũng lọc theo transform thật, nên UI không mời admin chạy no-op.
 */
function buildTransforms(): readonly MigrationTransform[] {
  if (selectedType.value === null) return [];

  const transforms: MigrationTransform[] = [];

  for (const row of rows.value) {
    const key = row.key.trim();
    if (row.originalKey === '' || key === '' || row.originalKey === key) continue;
    transforms.push({ kind: 'rename', from: row.originalKey, to: key });
  }

  return transforms;
}

async function save(): Promise<void> {
  const current = registry.value;
  if (current === null || !canSave.value) return;
  saveError.value = null;

  const next = definition.value;
  const key = selectedKey.value;

  try {
    if (key === null) {
      await current.createType({
        key: next.key,
        kind: next.kind,
        baseType: next.baseType,
        name: next.name,
        branchId: BRANCH_ID,
        fields: next.fields,
        listView: next.listView,
      });
      await loadTypes();
      const created = types.value.find((type) => type.key === next.key);
      if (created !== undefined) selectType(created);
      return;
    }

    await current.updateType(key, {
      name: next.name,
      fields: next.fields,
      listView: next.listView,
      migration: buildTransforms(),
    });
    await loadTypes();
    const saved = types.value.find((type) => type.key === key);
    if (saved !== undefined) selectType(saved);
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  }
}

async function saveRecord(value: Record<string, unknown>): Promise<void> {
  const current = repo.value;
  const typeKey = selectedKey.value;
  if (current === null || typeKey === null) return;
  saveError.value = null;

  try {
    await current.create({ typeKey, branchId: BRANCH_ID, data: value });
    record.value = {};
    await loadRecords();
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  }
}

async function runMigration(): Promise<void> {
  const currentAdapter = adapter.value;
  const type = selectedType.value;
  if (currentAdapter === null || type === null || migrating.value) return;

  migrating.value = true;
  saveError.value = null;
  progress.value = { scanned: 0, migrated: 0, failed: 0, total: 0 };

  try {
    progress.value = await migrateCollection(currentAdapter, type, type.migrations, (update) => {
      progress.value = update;
    });
    await loadRecords();
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  } finally {
    migrating.value = false;
  }
}
</script>

<template>
  <section class="grid gap-4">
    <h2 class="text-xl font-semibold">{{ t('type.designer.title') }}</h2>

    <p v-if="loadError !== null" class="error-text" role="alert">{{ loadError }}</p>

<div v-else-if="ready" class="grid gap-4 md:grid-cols-3">
        <aside class="panel-card grid gap-2">
          <Button.Root type="button" class="btn" @click="startNewType">
            {{ t('type.designer.newType') }}
          </Button.Root>

          <p v-if="types.length === 0" class="text-sm text-text-muted">{{ t('type.designer.empty') }}</p>
          <ul v-else class="grid gap-2">
            <li v-for="type in types" :key="type.key">
            <Button.Root
              type="button"
              class="btn w-full justify-start"
              :data-type-key="type.key"
              :aria-label="`${t('type.designer.editType')}: ${type.name[activeLocale]}`"
              @click="selectType(type)"
            >
              {{ type.name[activeLocale] }} (v{{ type.version }})
            </Button.Root>
          </li>
        </ul>
      </aside>

      <div class="panel-card grid gap-4">
        <h3 class="text-lg font-semibold">{{ isEditing ? t('type.designer.editType') : t('type.designer.newType') }}</h3>

        <Input.Root v-model="draft.key" type="text" :label="t('type.field.key')" :disabled="isEditing">
          <Input.Control class="field-input" />
        </Input.Root>

        <Input.Root
          v-for="code in SUPPORTED_LOCALES"
          :key="code"
          v-model="draft.name[code]"
          type="text"
          :label="`${t('type.designer.typeName')} (${code})`"
        >
          <Input.Control class="field-input" />
        </Input.Root>

        <Select.Root :model-value="draft.kind" :disabled="isEditing" @update:model-value="setKind">
          <Select.Activator class="field-input" :label="t('type.designer.kind')">{{ t(KIND_KEYS[draft.kind]) }}</Select.Activator>
          <Select.Content eager>
            <Select.Item v-for="kind in KIND_OPTIONS" :key="kind" :value="kind">
              {{ t(KIND_KEYS[kind]) }}
            </Select.Item>
          </Select.Content>
        </Select.Root>

        <Input.Root
          v-if="draft.kind === 'builtin_ext'"
          v-model="draft.baseType"
          type="text"
          :label="t('type.designer.baseType')"
          :disabled="isEditing"
        >
          <Input.Control class="field-input" />
        </Input.Root>

        <p v-if="isEditing" class="text-sm text-text-muted" role="alert">
          {{ t('type.designer.versionWarning') }}
        </p>

        <ul v-if="typeIssues.length > 0" class="error-text" role="alert">
          <li v-for="issue in typeIssues" :key="`${issue.path}:${issue.code}`">{{ issueText(issue) }}</li>
        </ul>

        <h4 class="text-lg font-medium">{{ t('type.designer.fields') }}</h4>

        <ul class="grid gap-4">
          <li
            v-for="(row, index) in rows"
            :key="index"
            class="grid gap-2 rounded-md border border-solid border-text/15 p-3"
            :data-field-row="row.key"
          >
            <Input.Root v-model="row.key" type="text" :label="t('type.field.key')">
              <Input.Control class="field-input" />
            </Input.Root>

            <Input.Root
              v-for="code in SUPPORTED_LOCALES"
              :key="code"
              v-model="row.label[code]"
              type="text"
              :label="`${t('type.field.label')} (${code})`"
            >
              <Input.Control class="field-input" />
            </Input.Root>

            <Select.Root
              :model-value="row.dataType"
              @update:model-value="(value: unknown) => setDataType(row, value)"
            >
              <Select.Activator class="field-input" :label="t('type.field.dataType')">
                {{ t(`type.dataType.${row.dataType}`) }}
              </Select.Activator>
              <Select.Content eager>
                <Select.Item v-for="dataType in DATA_TYPES" :key="dataType" :value="dataType">
                  {{ t(`type.dataType.${dataType}`) }}
                </Select.Item>
              </Select.Content>
            </Select.Root>

            <Checkbox.Root
              class="inline-flex cursor-pointer items-center gap-2"
              :model-value="row.required"
              @update:model-value="(value: boolean | undefined) => setFlag(row, 'required', value)"
            >
              {{ t('type.field.required') }}
            </Checkbox.Root>

            <Checkbox.Root
              class="inline-flex cursor-pointer items-center gap-2"
              :model-value="row.indexed"
              @update:model-value="(value: boolean | undefined) => setFlag(row, 'indexed', value)"
            >
              {{ t('type.field.indexed') }}
            </Checkbox.Root>

            <Input.Root
              v-if="row.dataType === 'reference'"
              v-model="row.referenceType"
              type="text"
              :label="t('type.field.referenceType')"
            >
              <Input.Control class="field-input" />
            </Input.Root>

            <Input.Root
              v-if="row.dataType === 'formula'"
              v-model="row.formula"
              type="text"
              :label="t('type.field.formula')"
            >
              <Input.Control class="field-input" />
            </Input.Root>

            <div
              v-if="row.dataType === 'select' || row.dataType === 'multiselect'"
              class="grid gap-2"
            >
              <span>{{ t('type.field.options') }}</span>

              <div
                  v-for="(option, optionIndex) in row.options"
                  :key="optionIndex"
                  class="type-designer__option grid gap-2 rounded-sm border border-solid border-text/15 p-2"
                >
                <Input.Root v-model="option.value" type="text" :label="t('type.field.options')">
                  <Input.Control class="field-input" />
                </Input.Root>

                <Input.Root
                  v-for="code in SUPPORTED_LOCALES"
                  :key="code"
                  v-model="option.label[code]"
                  type="text"
                  :label="`${t('type.field.label')} (${code})`"
                >
                  <Input.Control class="field-input" />
                </Input.Root>

                <Button.Root type="button" class="btn-danger" @click="removeOption(row, optionIndex)">
                  {{ t('type.field.removeOption') }}
                </Button.Root>
              </div>

              <Button.Root type="button" class="btn-ghost" @click="addOption(row)">
                {{ t('type.field.addOption') }}
              </Button.Root>
            </div>

            <Button.Root type="button" class="btn-danger" @click="removeRow(index)">
              {{ t('type.field.remove') }}
            </Button.Root>

            <ul v-if="issuesForRow(row).length > 0" class="error-text" role="alert">
              <li v-for="issue in issuesForRow(row)" :key="issue.code">{{ issueText(issue) }}</li>
            </ul>
          </li>
        </ul>

        <Button.Root type="button" class="btn-ghost" @click="addRow">{{ t('type.field.add') }}</Button.Root>

        <p v-if="saveError !== null" class="error-text" role="alert">{{ saveError }}</p>

        <Button.Root type="button" class="btn-primary" :disabled="!canSave" @click="save">
          {{ t('type.form.save') }}
        </Button.Root>

        <div class="flex flex-wrap items-center gap-2">
          <Button.Root
            type="button"
            class="btn"
            :disabled="!canMigrate || migrating"
            :loading="migrating"
            @click="runMigration"
          >
            {{ t('type.migration.run') }}
          </Button.Root>

          <template v-if="progress !== null">
            <p role="status">{{ migrating ? t('type.migration.running') : t('type.migration.done') }}</p>
            <Progress.Root
              :model-value="progress.scanned"
              :max="progress.total > 0 ? progress.total : 1"
              :aria-label="t('type.migration.running')"
            >
              <span>{{ progress.scanned }} / {{ progress.total }}</span>
            </Progress.Root>
          </template>
        </div>

        <h4 class="text-lg font-medium">{{ t('type.designer.record') }}</h4>

        <template v-if="canSave">
          <DynamicForm
            v-if="isEditing"
            :definition="definition"
            :model-value="record"
            :locale="activeLocale"
            @update:model-value="(value: Record<string, unknown>) => (record = value)"
            @submit="saveRecord"
          />
          <DynamicList :definition="definition" :records="records" :locale="activeLocale" />
        </template>
      </div>
    </div>
  </section>
</template>
