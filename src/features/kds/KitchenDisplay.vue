<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import type { OrderLineItem, KdsLineStatus, OrderAggregateState, TableDoc } from '@/core/order/types';
import { createOrderRepository } from '@/core/order/order-repository';

export type StationType = 'all' | 'kitchen' | 'bar' | 'cold';

export interface KdsTicket {
  sessionId: string;
  billId: string;
  billNumber: string;
  tableName: string;
  guestCount: number;
  createdAt: string;
  firstOrderAt?: string;
  elapsedMinutes: number;
  agingStage: 'fresh' | 'warning' | 'delayed';
  lines: OrderLineItem[];
}

export interface RecalledItem {
  sessionId: string;
  billId: string;
  billNumber: string;
  tableName: string;
  line: OrderLineItem;
}

const props = withDefaults(
  defineProps<{
    adapter: DbAdapter;
    branchId: string;
    pollInterval?: number;
    active?: boolean;
  }>(),
  {
    pollInterval: 2000,
    active: true,
  },
);

const { t } = useI18n();
const orderRepository = createOrderRepository(props.adapter);

const activeStation = ref<StationType>('all');
const activeSessions = ref<Record<string, OrderAggregateState>>({});
const floorTables = ref<TableDoc[]>([]);
const isRecallModalOpen = ref(false);
const autoRefresh = ref(true);
const currentTime = ref(Date.now());
const recentlyCompletedItems = ref<RecalledItem[]>([]);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeAdapter: (() => void) | null = null;

async function loadData() {
  try {
    const { tables } = await orderRepository.getAreasAndTables(props.branchId);
    floorTables.value = tables;
  } catch {
    floorTables.value = [];
  }

  try {
    const sessions = await orderRepository.getAllActiveSessions(props.branchId);
    activeSessions.value = sessions;
  } catch {
    activeSessions.value = {};
  }
}

function resolveTableName(sessionTableIds: string[]): string {
  if (!sessionTableIds || sessionTableIds.length === 0) {
    return t('kds.ticket.fastSale');
  }
  const tid = sessionTableIds[0];
  if (!tid) return t('kds.ticket.fastSale');

  const table = floorTables.value.find(
    (tbl) => tbl._id === tid || tbl._id.endsWith(`:${tid}`) || tbl.code === tid,
  );
  return table?.name || table?.code || tid.replace(/^table:[^:]+:/, '');
}

/** Tự động suy ra trạm chế biến dựa trên tên món hoặc stationId đã gán */
function inferStation(line: OrderLineItem): StationType {
  if (line.stationId === 'bar' || line.stationId === 'cold' || line.stationId === 'kitchen') {
    return line.stationId;
  }
  const name = (line.nameSnapshot?.vi || line.nameSnapshot?.en || '').toLowerCase();
  if (
    name.includes('trà') ||
    name.includes('cà phê') ||
    name.includes('cafe') ||
    name.includes('nước') ||
    name.includes('sinh tố') ||
    name.includes('bạc xỉu') ||
    name.includes('sữa chua') ||
    name.includes('tea') ||
    name.includes('coffee')
  ) {
    return 'bar';
  }
  if (
    name.includes('kem') ||
    name.includes('chè') ||
    name.includes('bánh') ||
    name.includes('tráng miệng') ||
    name.includes('salad') ||
    name.includes('gỏi')
  ) {
    return 'cold';
  }
  return 'kitchen';
}

/** Xác định món có phải được gọi thêm sau lượt gọi đầu tiên không */
function isLineAddedLater(ticket: KdsTicket, line: OrderLineItem): boolean {
  const baseTime = ticket.firstOrderAt || ticket.createdAt;
  if (!baseTime || !line.addedAt) return false;
  const initialTime = new Date(baseTime).getTime();
  const lineTime = new Date(line.addedAt).getTime();
  return lineTime - initialTime >= 60000;
}

/** Chuyển đổi các phiên đang hoạt động thành danh sách vé bếp (KDS Tickets) */
const activeTickets = computed<KdsTicket[]>(() => {
  const result: KdsTicket[] = [];
  const processedSessions = new Set<string>();

  for (const state of Object.values(activeSessions.value)) {
    if (!state.session || !state.bill) continue;
    if (processedSessions.has(state.session._id)) continue;
    processedSessions.add(state.session._id);

    // Lọc các món còn hoạt động (chưa huỷ) và ĐÃ XÁC NHẬN GỬI BẾP (loại bỏ món unconfirmed)
    let candidateLines = (state.bill.lines || []).filter(
      (l) => l.status !== 'voided' && l.kdsStatus !== 'unconfirmed',
    );

    // Lọc theo trạm chế biến nếu không phải 'all'
    if (activeStation.value !== 'all') {
      candidateLines = candidateLines.filter((l) => inferStation(l) === activeStation.value);
    }

    // Chỉ giữ lại các món chưa hoàn thành (kdsStatus !== 'ready')
    // Sắp xếp các món theo thời gian gọi (addedAt) tăng dần: món gọi ban đầu ở trước, món gọi thêm ở sau hàng chờ
    const activeLines = candidateLines
      .filter((l) => l.kdsStatus !== 'ready')
      .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
    if (activeLines.length === 0) continue;

    // Thời gian gọi món sớm nhất trong các món đang chờ/nấu
    const earliestTime = activeLines.reduce<string>((earliest, line) => {
      if (!earliest) return line.addedAt || state.session.openedAt;
      return new Date(line.addedAt).getTime() < new Date(earliest).getTime() ? line.addedAt : earliest;
    }, '');

    // Thời gian gọi món đầu tiên của cả đơn (để nhận biết món gọi thêm)
    const firstOrderAt = (state.bill.lines || [])
      .filter((l) => l.status !== 'voided' && l.kdsStatus !== 'unconfirmed')
      .reduce<string>((first, line) => {
        if (!first) return line.addedAt || state.session.openedAt;
        return new Date(line.addedAt).getTime() < new Date(first).getTime() ? line.addedAt : first;
      }, '') || state.session.openedAt || new Date().toISOString();

    const createdAt = earliestTime || state.session.openedAt || new Date().toISOString();
    const elapsedMinutes = Math.max(0, Math.floor((currentTime.value - new Date(createdAt).getTime()) / 60000));

    let agingStage: 'fresh' | 'warning' | 'delayed' = 'fresh';
    if (elapsedMinutes >= 20) {
      agingStage = 'delayed';
    } else if (elapsedMinutes >= 10) {
      agingStage = 'warning';
    }

    result.push({
      sessionId: state.session._id,
      billId: state.bill._id,
      billNumber: state.bill.billNumber || state.bill._id.replace(/^bill:[^:]+:/, ''),
      tableName: resolveTableName(state.session.tableIds),
      guestCount: state.session.guestCount ?? 1,
      createdAt,
      firstOrderAt,
      elapsedMinutes,
      agingStage,
      lines: activeLines,
    });
  }

  // Sắp xếp đơn: đơn chờ lâu nhất xếp lên đầu
  return result.sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);
});

/** Thống kê số lượng */
const stats = computed(() => {
  let pendingCount = 0;
  let preparingCount = 0;
  let delayedCount = 0;

  for (const ticket of activeTickets.value) {
    if (ticket.agingStage === 'delayed') delayedCount++;
    for (const line of ticket.lines) {
      if (line.kdsStatus === 'preparing') {
        preparingCount++;
      } else {
        pendingCount++;
      }
    }
  }

  return {
    totalTickets: activeTickets.value.length,
    pendingCount,
    preparingCount,
    delayedCount,
  };
});

/** Chuyển đổi trạng thái một món: pending -> preparing -> ready */
async function handleCycleLineStatus(ticket: KdsTicket, line: OrderLineItem) {
  const nextStatus: KdsLineStatus =
    line.kdsStatus === 'preparing' ? 'ready' : 'preparing';

  try {
    const updated = await orderRepository.updateLineKdsStatus(
      props.branchId,
      ticket.sessionId,
      ticket.billId,
      line.lineId,
      nextStatus,
      'Bếp',
      'KDS',
    );

    if (nextStatus === 'ready') {
      recentlyCompletedItems.value.unshift({
        sessionId: ticket.sessionId,
        billId: ticket.billId,
        billNumber: ticket.billNumber,
        tableName: ticket.tableName,
        line: {
          ...line,
          kdsStatus: 'ready',
          bumpedAt: new Date().toISOString(),
        },
      });
      // Giới hạn danh sách lịch sử 30 món gần nhất
      if (recentlyCompletedItems.value.length > 30) {
        recentlyCompletedItems.value.pop();
      }
    }

    // Cập nhật lại phiên trong state cục bộ
    for (const [key, s] of Object.entries(activeSessions.value)) {
      if (s.session._id === ticket.sessionId) {
        activeSessions.value[key] = updated;
      }
    }
  } catch (err) {
    console.error('Failed to cycle KDS status:', err);
  }
}

/** Hoàn thành món ngay lập tức (Bump) */
async function handleBumpLine(ticket: KdsTicket, line: OrderLineItem) {
  try {
    const updated = await orderRepository.updateLineKdsStatus(
      props.branchId,
      ticket.sessionId,
      ticket.billId,
      line.lineId,
      'ready',
      'Bếp',
      'KDS',
    );

    recentlyCompletedItems.value.unshift({
      sessionId: ticket.sessionId,
      billId: ticket.billId,
      billNumber: ticket.billNumber,
      tableName: ticket.tableName,
      line: {
        ...line,
        kdsStatus: 'ready',
        bumpedAt: new Date().toISOString(),
      },
    });
    if (recentlyCompletedItems.value.length > 30) {
      recentlyCompletedItems.value.pop();
    }

    for (const [key, s] of Object.entries(activeSessions.value)) {
      if (s.session._id === ticket.sessionId) {
        activeSessions.value[key] = updated;
      }
    }
  } catch (err) {
    console.error('Failed to bump line:', err);
  }
}

/** Hoàn thành toàn bộ món của vé bếp (Bump All Ticket) */
async function handleBumpTicket(ticket: KdsTicket) {
  const lineIds = ticket.lines.map((l) => l.lineId);
  try {
    const updated = await orderRepository.bumpTicketLines(
      props.branchId,
      ticket.sessionId,
      ticket.billId,
      lineIds,
      'Bếp',
      'KDS',
    );

    for (const line of ticket.lines) {
      recentlyCompletedItems.value.unshift({
        sessionId: ticket.sessionId,
        billId: ticket.billId,
        billNumber: ticket.billNumber,
        tableName: ticket.tableName,
        line: {
          ...line,
          kdsStatus: 'ready',
          bumpedAt: new Date().toISOString(),
        },
      });
    }
    if (recentlyCompletedItems.value.length > 30) {
      recentlyCompletedItems.value = recentlyCompletedItems.value.slice(0, 30);
    }

    for (const [key, s] of Object.entries(activeSessions.value)) {
      if (s.session._id === ticket.sessionId) {
        activeSessions.value[key] = updated;
      }
    }
  } catch (err) {
    console.error('Failed to bump ticket:', err);
  }
}

/** Khôi phục món đã hoàn thành trở lại màn hình bếp */
async function handleRecallItem(item: RecalledItem, index: number) {
  try {
    const updated = await orderRepository.recallTicketLine(
      props.branchId,
      item.sessionId,
      item.billId,
      item.line.lineId,
      'Bếp',
      'KDS',
    );

    recentlyCompletedItems.value.splice(index, 1);

    for (const [key, s] of Object.entries(activeSessions.value)) {
      if (s.session._id === item.sessionId) {
        activeSessions.value[key] = updated;
      }
    }
  } catch (err) {
    console.error('Failed to recall item:', err);
  }
}

function onWindowFocusOrVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    loadData();
  }
}

onMounted(() => {
  loadData();

  if (typeof props.adapter.subscribe === 'function') {
    unsubscribeAdapter = props.adapter.subscribe(() => {
      if (autoRefresh.value) {
        loadData();
      }
    });
  }

  // Đồng hồ cập nhật thời gian trôi qua mỗi 15 giây
  clockTimer = setInterval(() => {
    currentTime.value = Date.now();
  }, 15000);

  // Auto-refresh nạp dữ liệu từ kho lưu trữ
  pollTimer = setInterval(() => {
    if (autoRefresh.value) {
      loadData();
    }
  }, props.pollInterval);

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onWindowFocusOrVisible);
    document.addEventListener('visibilitychange', onWindowFocusOrVisible);
  }
});

onUnmounted(() => {
  if (unsubscribeAdapter) unsubscribeAdapter();
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', onWindowFocusOrVisible);
    document.removeEventListener('visibilitychange', onWindowFocusOrVisible);
  }
});

watch(
  () => props.branchId,
  () => {
    loadData();
  },
);

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      loadData();
    }
  },
);

defineExpose({
  loadData,
  activeTickets,
  stats,
  handleBumpLine,
  handleBumpTicket,
  handleRecallItem,
});
</script>

<template>
  <div class="kds-dashboard flex flex-col h-[calc(100vh-4.5rem)] bg-bg p-3 sm:p-4 gap-3 select-none overflow-hidden" data-test="kds-screen">
    <!-- Top Bar: Trạm chế biến, Thống kê, Lịch sử, Làm mới -->
    <header class="panel-card flex flex-wrap items-center justify-between gap-3 p-3 shrink-0 shadow-sm">
      <!-- Bộ lọc trạm chế biến -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" data-test="station-filters">
        <Button.Root
          type="button"
          data-test="station-all"
          class="btn text-xs px-3 py-1.5 rounded-md cursor-pointer transition-all"
          :class="activeStation === 'all' ? 'btn-primary shadow-xs' : 'btn-ghost'"
          @click="activeStation = 'all'"
        >
          <Button.Content>🍽️ {{ t('kds.stations.all') }}</Button.Content>
        </Button.Root>
        <Button.Root
          type="button"
          data-test="station-kitchen"
          class="btn text-xs px-3 py-1.5 rounded-md cursor-pointer transition-all"
          :class="activeStation === 'kitchen' ? 'btn-primary shadow-xs' : 'btn-ghost'"
          @click="activeStation = 'kitchen'"
        >
          <Button.Content>🍳 {{ t('kds.stations.kitchen') }}</Button.Content>
        </Button.Root>
        <Button.Root
          type="button"
          data-test="station-bar"
          class="btn text-xs px-3 py-1.5 rounded-md cursor-pointer transition-all"
          :class="activeStation === 'bar' ? 'btn-primary shadow-xs' : 'btn-ghost'"
          @click="activeStation = 'bar'"
        >
          <Button.Content>☕ {{ t('kds.stations.bar') }}</Button.Content>
        </Button.Root>
        <Button.Root
          type="button"
          data-test="station-cold"
          class="btn text-xs px-3 py-1.5 rounded-md cursor-pointer transition-all"
          :class="activeStation === 'cold' ? 'btn-primary shadow-xs' : 'btn-ghost'"
          @click="activeStation = 'cold'"
        >
          <Button.Content>🥗 {{ t('kds.stations.cold') }}</Button.Content>
        </Button.Root>
      </div>

      <!-- Thống kê nhanh & Nút thao tác -->
      <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div class="flex items-center gap-2 text-xs font-medium" data-test="kds-stats">
          <span class="px-2.5 py-1 rounded bg-surface border border-border text-text">
            {{ t('kds.ticket.order') }}: <strong class="text-primary font-bold">{{ stats.totalTickets }}</strong>
          </span>
          <span class="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600">
            {{ t('kds.status.preparing') }}: <strong>{{ stats.preparingCount }}</strong>
          </span>
          <span
            v-if="stats.delayedCount > 0"
            class="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 animate-pulse font-bold"
          >
            ⚠️ {{ t('kds.aging.delayed') }}: {{ stats.delayedCount }}
          </span>
        </div>

        <!-- Nút Lịch sử / Khôi phục (Recall) -->
        <Button.Root
          type="button"
          data-test="recall-modal-btn"
          class="btn btn-ghost text-xs px-2.5 py-1.5 rounded border border-border cursor-pointer flex items-center gap-1.5 hover:bg-surface"
          @click="isRecallModalOpen = true"
        >
          <Button.Content>
            <span>↩️</span>
            <span>{{ t('kds.ticket.recall') }} ({{ recentlyCompletedItems.length }})</span>
          </Button.Content>
        </Button.Root>

        <!-- Nút Làm mới -->
        <Button.Root
          type="button"
          data-test="refresh-btn"
          class="btn btn-ghost text-xs p-1.5 h-8 w-8 rounded-full border border-border cursor-pointer flex items-center justify-center hover:bg-surface"
          :title="t('kds.refresh')"
          @click="loadData"
        >
          <Button.Content>🔄</Button.Content>
        </Button.Root>
      </div>
    </header>

    <!-- Main Board: Danh sách vé bếp KDS -->
    <main class="flex-1 min-h-0 overflow-y-auto pr-1">
      <!-- Empty state khi không có đơn -->
      <div
        v-if="activeTickets.length === 0"
        class="h-full flex flex-col items-center justify-center text-center p-8 panel-card border-dashed border-2 border-border/80"
        data-test="kds-empty-state"
      >
        <div class="text-5xl sm:text-6xl mb-3">🍳✨</div>
        <h3 class="text-base sm:text-lg font-bold text-text">{{ t('kds.empty.title') }}</h3>
        <p class="text-xs sm:text-sm text-text-muted mt-1 max-w-md">
          {{ t('kds.empty.subtitle') }}
        </p>
      </div>

      <!-- Grid các thẻ vé bếp (Ticket Cards) -->
      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pb-4"
        data-test="ticket-grid"
      >
        <div
          v-for="ticket in activeTickets"
          :key="ticket.sessionId"
          class="panel-card p-0 flex flex-col border overflow-hidden transition-all shadow-sm"
          :class="{
            'border-emerald-500/40 bg-emerald-500/5': ticket.agingStage === 'fresh',
            'border-amber-500/50 bg-amber-500/5': ticket.agingStage === 'warning',
            'border-rose-500/60 bg-rose-500/5 ring-1 ring-rose-500/40': ticket.agingStage === 'delayed',
          }"
          data-test="kds-ticket-card"
        >
          <!-- Header vé: Tên bàn, số đơn, bộ đếm thời gian -->
          <div
            class="p-3 border-b flex items-start justify-between gap-2"
            :class="{
              'border-emerald-500/20 bg-emerald-500/10': ticket.agingStage === 'fresh',
              'border-amber-500/20 bg-amber-500/10': ticket.agingStage === 'warning',
              'border-rose-500/20 bg-rose-500/10': ticket.agingStage === 'delayed',
            }"
          >
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base sm:text-lg font-black text-text tracking-tight">
                  {{ ticket.tableName }}
                </span>
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-surface/80 text-text-muted border border-border/60 font-mono">
                  #{{ ticket.billNumber.slice(-4) }}
                </span>
              </div>
              <div class="text-[11px] text-text-muted mt-0.5">
                {{ t('kds.ticket.guests', { count: ticket.guestCount }) }}
              </div>
            </div>

            <!-- Ticket Aging Timer Badge -->
            <div
              class="flex flex-col items-end shrink-0"
              data-test="ticket-aging-badge"
            >
              <span
                class="px-2 py-0.5 rounded text-xs font-black font-mono tracking-wide"
                :class="{
                  'bg-emerald-600 text-white': ticket.agingStage === 'fresh',
                  'bg-amber-500 text-white': ticket.agingStage === 'warning',
                  'bg-rose-600 text-white animate-pulse': ticket.agingStage === 'delayed',
                }"
              >
                ⏱️ {{ ticket.elapsedMinutes }}'
              </span>
              <span class="text-[10px] font-semibold text-text-muted mt-0.5">
                {{ t(`kds.aging.${ticket.agingStage}`) }}
              </span>
            </div>
          </div>

          <!-- Danh sách món ăn trong vé -->
          <div class="p-2.5 flex-1 space-y-2 overflow-y-auto max-h-72">
            <div
              v-for="line in ticket.lines"
              :key="line.lineId"
              class="p-2 rounded-md border flex items-start justify-between gap-2 transition-all cursor-pointer"
              :class="{
                'bg-surface border-border hover:border-primary/50': line.kdsStatus !== 'preparing',
                'bg-amber-500/10 border-amber-500/30 text-amber-900': line.kdsStatus === 'preparing',
              }"
              data-test="kds-line-item"
              @click="handleCycleLineStatus(ticket, line)"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                    {{ line.qty }}
                  </span>
                  <span class="font-bold text-xs sm:text-sm text-text">
                    {{ line.nameSnapshot?.vi || line.nameSnapshot?.en }}
                  </span>
                  <span
                    v-if="line.variantNameSnapshot"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-bg text-text-muted border border-border"
                  >
                    {{ line.variantNameSnapshot }}
                  </span>
                  <span
                    v-if="isLineAddedLater(ticket, line)"
                    data-test="line-added-later-badge"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold border border-purple-500/30"
                  >
                    ➕ {{ t('kds.ticket.addedLater') }}
                  </span>
                </div>

                <!-- Tuỳ chọn / Topping -->
                <div
                  v-if="line.modifiers && line.modifiers.length > 0"
                  class="text-[11px] text-text-muted mt-0.5 pl-6"
                >
                  + {{ line.modifiers.map((m) => m.optionNameSnapshot).join(', ') }}
                </div>

                <!-- Ghi chú món (hiển thị nổi bật) -->
                <div
                  v-if="line.note"
                  class="mt-1 pl-6 flex items-center gap-1 text-[11px] font-semibold text-rose-600"
                  data-test="line-note"
                >
                  <span>📝</span>
                  <span class="italic bg-rose-500/10 px-1.5 py-0.5 rounded">{{ line.note }}</span>
                </div>
              </div>

              <!-- Nút trạng thái món / Bump -->
              <div class="flex items-center gap-1 shrink-0" @click.stop>
                <button
                  type="button"
                  data-test="line-status-btn"
                  class="text-[11px] font-bold px-2 py-1 rounded transition-all cursor-pointer"
                  :class="{
                    'bg-surface border border-border text-text hover:bg-bg': line.kdsStatus !== 'preparing',
                    'bg-amber-500 text-white': line.kdsStatus === 'preparing',
                  }"
                  @click="handleCycleLineStatus(ticket, line)"
                >
                  {{ t(`kds.status.${line.kdsStatus || 'pending'}`) }}
                </button>
                <button
                  type="button"
                  data-test="bump-line-btn"
                  class="btn btn-primary text-xs px-2 py-1 rounded cursor-pointer font-bold"
                  :title="t('kds.ticket.bump')"
                  @click="handleBumpLine(ticket, line)"
                >
                  ✓
                </button>
              </div>
            </div>
          </div>

          <!-- Chân thẻ: Nút Hoàn thành toàn bộ (Bump Ticket) -->
          <div class="p-2.5 border-t border-border/80 bg-surface/50 flex items-center justify-between gap-2">
            <span class="text-xs text-text-muted">
              {{ t('kds.ticket.itemsCount', { count: ticket.lines.length }) }}
            </span>
            <Button.Root
              type="button"
              data-test="bump-ticket-btn"
              class="btn btn-primary text-xs px-3 py-1.5 rounded-md font-bold cursor-pointer shadow-xs flex items-center gap-1"
              @click="handleBumpTicket(ticket)"
            >
              <Button.Content>
                <span>✓</span>
                <span>{{ t('kds.ticket.bumpAll') }}</span>
              </Button.Content>
            </Button.Root>
          </div>
        </div>
      </div>
    </main>

    <!-- Modal Lịch sử hoàn thành / Khôi phục (Recall Modal) -->
    <Dialog.Root v-model="isRecallModalOpen">
      <Dialog.Content
        class="panel-card fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-lg w-[92vw] p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        data-test="recall-modal"
      >
        <div class="flex items-center justify-between border-b border-border pb-3 shrink-0">
          <Dialog.Title class="text-base font-bold text-text flex items-center gap-2">
            <span>↩️</span>
            <span>{{ t('kds.history.title') }}</span>
          </Dialog.Title>
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs p-1 h-7 w-7 rounded-full flex items-center justify-center text-text-muted hover:text-text cursor-pointer"
            @click="isRecallModalOpen = false"
          >
            ✕
          </Button.Root>
        </div>

        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
          <div
            v-if="recentlyCompletedItems.length === 0"
            class="p-6 text-center text-xs text-text-muted"
            data-test="recall-empty"
          >
            {{ t('kds.history.empty') }}
          </div>

          <div
            v-for="(item, idx) in recentlyCompletedItems"
            :key="item.line.lineId + idx"
            class="p-2.5 rounded-md border border-border bg-surface flex items-center justify-between gap-3 text-xs"
            data-test="recalled-row"
          >
            <div class="flex-1 min-w-0">
              <div class="font-bold text-text truncate">
                {{ item.tableName }} — {{ item.line.qty }}x {{ item.line.nameSnapshot?.vi || item.line.nameSnapshot?.en }}
              </div>
              <div class="text-[11px] text-text-muted mt-0.5">
                #{{ item.billNumber.slice(-4) }} · Hoàn thành lúc: {{ item.line.bumpedAt ? new Date(item.line.bumpedAt).toLocaleTimeString() : '' }}
              </div>
            </div>

            <Button.Root
              type="button"
              data-test="recall-btn"
              class="btn btn-ghost text-xs px-2.5 py-1 rounded border border-border text-primary hover:bg-primary/10 cursor-pointer font-bold shrink-0"
              @click="handleRecallItem(item, idx)"
            >
              <Button.Content>↩️ {{ t('kds.ticket.recall') }}</Button.Content>
            </Button.Root>
          </div>
        </div>

        <div class="pt-3 border-t border-border flex justify-end shrink-0">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1.5 rounded cursor-pointer"
            @click="isRecallModalOpen = false"
          >
            <Button.Content>{{ t('common.close') }}</Button.Content>
          </Button.Root>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  </div>
</template>
