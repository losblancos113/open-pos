<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Input, Select } from '@vuetify/v0';
import AppIcon from '@/components/AppIcon.vue';
import { ChevronDown } from '@vicons/ionicons5';
import type { DbAdapter } from '@/core/db/adapter';
import type { DatabaseConfig, CosmosDbConfig } from '@/core/db/config';
import { useDatabaseProvider } from '@/composables/useDatabaseProvider';
import { testCosmosConnection, ensureCosmosContainer } from '@/core/db/cosmos-provision';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    currentAdapter: DbAdapter;
  }>(),
  {
    open: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'adapter-changed', adapter: DbAdapter): void;
}>();

const { t } = useI18n();
const { activeConfig, switchProvider, migrateToCloud } = useDatabaseProvider();

// Form state
const selectedProvider = ref<'local' | 'cosmos'>('local');
const endpoint = ref('');
const key = ref('');
const databaseId = ref('openpos');
const containerId = ref('documents');

// Operational state
const isTesting = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const isProvisioning = ref(false);
const provisionResult = ref<{ success: boolean; message: string } | null>(null);

const isMigrating = ref(false);
const migrationProgress = ref<{ total: number; transferred: number; failed: number } | null>(null);

const errorMessage = ref('');
const isSaving = ref(false);

const providerOptions = computed(() => [
  { key: 'local', label: t('database.providers.local') },
  { key: 'cosmos', label: t('database.providers.cosmos') },
]);

const selectedProviderLabel = computed(() => {
  const found = providerOptions.value.find((p) => p.key === selectedProvider.value);
  return found ? found.label : selectedProvider.value;
});

function loadFormFromConfig(config: DatabaseConfig) {
  selectedProvider.value = config.provider === 'cosmos' ? 'cosmos' : 'local';
  if (config.provider === 'cosmos') {
    endpoint.value = config.endpoint || '';
    key.value = config.key || '';
    databaseId.value = config.databaseId || 'openpos';
    containerId.value = config.containerId || 'documents';
  } else {
    endpoint.value = '';
    key.value = '';
    databaseId.value = 'openpos';
    containerId.value = 'documents';
  }
  testResult.value = null;
  provisionResult.value = null;
  migrationProgress.value = null;
  errorMessage.value = '';
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadFormFromConfig(activeConfig.value);
    }
  },
  { immediate: true },
);

function onSelectProvider(val: string) {
  if (val === 'local' || val === 'cosmos') {
    selectedProvider.value = val;
    testResult.value = null;
    provisionResult.value = null;
    errorMessage.value = '';
  }
}

function buildCosmosConfig(): CosmosDbConfig {
  return {
    provider: 'cosmos',
    endpoint: endpoint.value.trim(),
    key: key.value.trim(),
    databaseId: databaseId.value.trim() || 'openpos',
    containerId: containerId.value.trim() || 'documents',
  };
}

async function handleTestConnection() {
  if (selectedProvider.value !== 'cosmos') return;
  isTesting.value = true;
  testResult.value = null;
  errorMessage.value = '';

  const cfg = buildCosmosConfig();
  const res = await testCosmosConnection(cfg);
  isTesting.value = false;

  if (res.success) {
    testResult.value = {
      success: true,
      message: t('database.testSuccess', { latencyMs: res.latencyMs ?? 0 }),
    };
  } else {
    testResult.value = {
      success: false,
      message: t('database.testFailed', { error: res.error || '' }),
    };
  }
}

async function handleAutoProvision() {
  if (selectedProvider.value !== 'cosmos') return;
  isProvisioning.value = true;
  provisionResult.value = null;
  errorMessage.value = '';

  try {
    const cfg = buildCosmosConfig();
    await ensureCosmosContainer(cfg);
    provisionResult.value = {
      success: true,
      message: t('database.provisionSuccess'),
    };
  } catch (err) {
    provisionResult.value = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    isProvisioning.value = false;
  }
}

async function handleMigrate() {
  if (selectedProvider.value !== 'cosmos') return;
  isMigrating.value = true;
  errorMessage.value = '';

  try {
    const cfg = buildCosmosConfig();
    const { createCosmosAdapter } = await import('@/core/db/cosmos-adapter');
    const cloudAdapter = await createCosmosAdapter(cfg);

    const progress = await migrateToCloud(props.currentAdapter, cloudAdapter, {
      batchSize: 10,
      delayBetweenBatchesMs: 100,
      onProgress: (p) => {
        migrationProgress.value = {
          total: p.total,
          transferred: p.transferred,
          failed: p.failed,
        };
      },
    });

    migrationProgress.value = {
      total: progress.total,
      transferred: progress.transferred,
      failed: progress.failed,
    };
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    isMigrating.value = false;
  }
}

async function handleSave() {
  isSaving.value = true;
  errorMessage.value = '';

  try {
    let newConfig: DatabaseConfig;
    if (selectedProvider.value === 'cosmos') {
      newConfig = buildCosmosConfig();
    } else {
      newConfig = { provider: 'local' };
    }

    const newAdapter = await switchProvider(newConfig);
    emit('adapter-changed', newAdapter);
    emit('close');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <Dialog.Root :open="open">
    <Dialog.Content class="panel-card w-full max-w-lg p-6 shadow-xl space-y-4">
      <div class="flex items-center justify-between border-b border-border pb-3">
        <div>
          <Dialog.Title class="text-lg font-bold text-text">
            {{ t('database.title') }}
          </Dialog.Title>
          <Dialog.Description class="text-xs text-text-muted mt-1">
            {{ t('database.provider') }}
          </Dialog.Description>
        </div>
        <button
          type="button"
          data-test="database-modal-close"
          class="btn btn-ghost px-2 py-1 text-sm text-text-muted hover:text-text"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Error message banner -->
      <div
        v-if="errorMessage"
        class="p-3 bg-danger/10 border border-danger/30 rounded-md text-xs text-danger"
      >
        {{ errorMessage }}
      </div>

      <!-- Provider selector -->
      <div class="space-y-1.5">
        <label class="field-label text-xs font-semibold uppercase text-text-muted">
          {{ t('database.provider') }}
        </label>
        <Select.Root
          :model-value="selectedProvider"
          @update:model-value="onSelectProvider"
        >
          <Select.Activator class="field-input py-2 px-3 text-sm cursor-pointer w-full flex items-center justify-between">
            <span>{{ selectedProviderLabel }}</span>
            <span class="text-xs text-text-muted"><AppIcon><ChevronDown /></AppIcon></span>
          </Select.Activator>
          <Select.Content eager class="panel-card p-1 shadow-lg max-h-60 overflow-y-auto">
            <Select.Item
              v-for="prov in providerOptions"
              :key="prov.key"
              :value="prov.key"
              :data-value="prov.key"
              class="p-2 text-sm rounded cursor-pointer hover:bg-bg selected:(bg-primary/10 text-primary font-medium)"
              @click="onSelectProvider(prov.key)"
            >
              {{ prov.label }}
            </Select.Item>
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Azure Cosmos DB credentials form -->
      <div v-if="selectedProvider === 'cosmos'" class="space-y-3 pt-2">
        <div class="space-y-1">
          <label class="field-label text-xs text-text-muted font-medium">
            {{ t('database.endpoint') }}
          </label>
          <Input.Root v-model="endpoint">
            <Input.Control
              class="field-input w-full px-3 py-2 text-sm"
              placeholder="https://<account-name>.documents.azure.com:443/"
            />
          </Input.Root>
        </div>

        <div class="space-y-1">
          <label class="field-label text-xs text-text-muted font-medium">
            {{ t('database.key') }}
          </label>
          <Input.Root v-model="key">
            <Input.Control
              type="password"
              class="field-input w-full px-3 py-2 text-sm"
              placeholder="Primary / Secondary Master Key"
            />
          </Input.Root>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="field-label text-xs text-text-muted font-medium">
              {{ t('database.databaseId') }}
            </label>
            <Input.Root v-model="databaseId">
              <Input.Control class="field-input w-full px-3 py-2 text-sm" />
            </Input.Root>
          </div>

          <div class="space-y-1">
            <label class="field-label text-xs text-text-muted font-medium">
              {{ t('database.containerId') }}
            </label>
            <Input.Root v-model="containerId">
              <Input.Control class="field-input w-full px-3 py-2 text-sm" />
            </Input.Root>
          </div>
        </div>

        <!-- Connection Test & Auto-Provision Actions -->
        <div class="flex items-center gap-2 pt-2">
          <Button.Root
            class="btn btn-ghost text-xs px-3 py-1.5 border border-border"
            :disabled="isTesting || !endpoint || !key"
            @click="handleTestConnection"
          >
            {{ isTesting ? t('database.testing') : t('database.testConnection') }}
          </Button.Root>

          <Button.Root
            class="btn btn-ghost text-xs px-3 py-1.5 border border-border"
            :disabled="isProvisioning || !endpoint || !key"
            @click="handleAutoProvision"
          >
            {{ isProvisioning ? t('database.provisioning') : t('database.autoProvision') }}
          </Button.Root>

          <Button.Root
            class="btn btn-ghost text-xs px-3 py-1.5 border border-border"
            :disabled="isMigrating || !endpoint || !key"
            @click="handleMigrate"
          >
            {{ isMigrating ? t('database.migrating', { transferred: migrationProgress?.transferred ?? 0, total: migrationProgress?.total ?? 0 }) : t('database.migrate') }}
          </Button.Root>
        </div>

        <!-- Test result banner -->
        <div
          v-if="testResult"
          class="p-2.5 rounded text-xs"
          :class="testResult.success ? 'bg-success/10 text-success border border-success/30' : 'bg-danger/10 text-danger border border-danger/30'"
        >
          {{ testResult.message }}
        </div>

        <!-- Provision result banner -->
        <div
          v-if="provisionResult"
          class="p-2.5 rounded text-xs"
          :class="provisionResult.success ? 'bg-success/10 text-success border border-success/30' : 'bg-danger/10 text-danger border border-danger/30'"
        >
          {{ provisionResult.message }}
        </div>

        <!-- Migration progress banner -->
        <div
          v-if="migrationProgress"
          class="p-2.5 bg-primary/10 border border-primary/30 rounded text-xs text-primary"
        >
          {{ t('database.migrateSuccess', { transferred: migrationProgress.transferred, total: migrationProgress.total }) }}
          <span v-if="migrationProgress.failed > 0" class="text-danger ml-2">
            ({{ t('database.migrateFailed', { failed: migrationProgress.failed }) }})
          </span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center justify-end gap-2 pt-4 border-t border-border">
        <Button.Root
          class="btn btn-ghost px-4 py-2 text-sm"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </Button.Root>
        <Button.Root
          class="btn btn-primary px-4 py-2 text-sm font-medium"
          :disabled="isSaving"
          @click="handleSave"
        >
          {{ isSaving ? t('common.loading') : t('common.save') }}
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
