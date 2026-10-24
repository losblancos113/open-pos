<script setup lang="ts">
import { Button } from '@vuetify/v0';
import { useI18n } from 'vue-i18n';
import type { BillDoc } from '@/core/order/types';

defineProps<{
  bill: BillDoc;
}>();

const emit = defineEmits<{
  split: [];
  mergeBills: [];
  transferTable: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-row gap-2">
    <Button.Root
      data-test="split-btn"
      type="button"
      class="btn btn-ghost text-xs px-2 py-1"
      @click="emit('split')"
    >
      <Button.Content>{{ t('pos.split.byItem') }}</Button.Content>
    </Button.Root>

    <Button.Root
      data-test="merge-btn"
      type="button"
      class="btn btn-ghost text-xs px-2 py-1"
      @click="emit('mergeBills')"
    >
      <Button.Content>{{ t('pos.split.merge') }}</Button.Content>
    </Button.Root>

    <Button.Root
      data-test="transfer-btn"
      type="button"
      class="btn btn-ghost text-xs px-2 py-1"
      @click="emit('transferTable')"
    >
      <Button.Content>{{ t('pos.split.transfer') }}</Button.Content>
    </Button.Root>
  </div>
</template>
