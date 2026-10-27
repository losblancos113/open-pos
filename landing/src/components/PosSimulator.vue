<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from '../i18n';

const { t, locale } = useI18n();

interface MenuItem {
  id: string;
  nameKey: 'item1' | 'item2' | 'item3' | 'item4' | 'item5' | 'item6';
  descKey: 'item1Desc' | 'item2Desc' | 'item3Desc' | 'item4Desc' | 'item5Desc' | 'item6Desc';
  category: 'coffee' | 'food' | 'dessert';
  price: number; // integer minor units in VND
  icon: string;
}

const menuItems: MenuItem[] = [
  { id: 'prod_1', nameKey: 'item1', descKey: 'item1Desc', category: 'coffee', price: 25000, icon: '☕' },
  { id: 'prod_2', nameKey: 'item2', descKey: 'item2Desc', category: 'food', price: 65000, icon: '🍜' },
  { id: 'prod_3', nameKey: 'item3', descKey: 'item3Desc', category: 'food', price: 45000, icon: '🍳' },
  { id: 'prod_4', nameKey: 'item4', descKey: 'item4Desc', category: 'coffee', price: 35000, icon: '🍑' },
  { id: 'prod_5', nameKey: 'item5', descKey: 'item5Desc', category: 'coffee', price: 30000, icon: '🧊' },
  { id: 'prod_6', nameKey: 'item6', descKey: 'item6Desc', category: 'dessert', price: 38000, icon: '🥐' },
];

interface CartLine {
  item: MenuItem;
  quantity: number;
}

const selectedCategory = ref<'all' | 'coffee' | 'food' | 'dessert'>('all');
const cart = ref<CartLine[]>([
  { item: menuItems[0]!, quantity: 2 },
  { item: menuItems[1]!, quantity: 1 },
]);

const applyDiscount = ref(true);
const splitWays = ref(3);
const showQrModal = ref(false);
const paymentSuccess = ref(false);

const filteredMenu = computed(() => {
  if (selectedCategory.value === 'all') return menuItems;
  return menuItems.filter((i) => i.category === selectedCategory.value);
});

function addToCart(item: MenuItem) {
  paymentSuccess.value = false;
  const existing = cart.value.find((c) => c.item.id === item.id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.value.push({ item, quantity: 1 });
  }
}

function updateQuantity(item: MenuItem, delta: number) {
  paymentSuccess.value = false;
  const existing = cart.value.find((c) => c.item.id === item.id);
  if (!existing) return;
  existing.quantity += delta;
  if (existing.quantity <= 0) {
    cart.value = cart.value.filter((c) => c.item.id !== item.id);
  }
}

function clearCart() {
  cart.value = [];
  paymentSuccess.value = false;
}

const subtotal = computed(() => {
  return cart.value.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
});

const discountAmount = computed(() => {
  if (!applyDiscount.value) return 0;
  // 10% integer calculation
  return Math.floor(subtotal.value * 0.1);
});

const totalAmount = computed(() => {
  return Math.max(0, subtotal.value - discountAmount.value);
});

/**
 * Deterministic Largest-Remainder Allocation for bill splitting
 * Enforces Open POS Non-Negotiable Invariant §4.3:
 * The sum of allocated parts ALWAYS equals the exact total, zero minor units lost.
 */
const splitAllocation = computed(() => {
  const total = totalAmount.value;
  const n = splitWays.value;
  if (total <= 0 || n <= 1) return [];

  const base = Math.floor(total / n);
  const remainder = total % n;

  // ascending-index tie-break: the first `remainder` people pay (base + 1), remainder pay base
  const parts: number[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(i < remainder ? base + 1 : base);
  }
  return parts;
});

function formatMoney(amount: number): string {
  return new Intl.NumberFormat(locale.value === 'vi' ? 'vi-VN' : 'en-US').format(amount) + ' ₫';
}

function openQrPayment() {
  if (totalAmount.value <= 0) return;
  showQrModal.value = true;
}

function completePayment() {
  showQrModal.value = false;
  paymentSuccess.value = true;
}
</script>

<template>
  <section id="demo" class="py-16 md:py-24 bg-bg-subtle border-y border-border">
    <div class="section-container">
      <!-- Section Header -->
      <div class="mx-auto max-w-3xl text-center mb-12">
        <div class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary mb-3">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {{ t.simulator.badge }}
        </div>
        <h2 class="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
          {{ t.simulator.title }}
        </h2>
        <p class="mt-4 text-base text-text-muted">
          {{ t.simulator.subtitle }}
        </p>
      </div>

      <!-- Mockup Window Shell -->
      <div class="mx-auto max-w-5xl rounded-2xl border border-border bg-surface shadow-elevated overflow-hidden">
        <!-- POS Window Titlebar -->
        <div class="flex items-center justify-between border-b border-border bg-bg-subtle px-4 py-3 text-xs">
          <div class="flex items-center gap-2">
            <span class="h-3 w-3 rounded-full bg-danger/80"></span>
            <span class="h-3 w-3 rounded-full bg-warning/80"></span>
            <span class="h-3 w-3 rounded-full bg-success/80"></span>
            <div class="ml-2 flex items-center gap-1.5 hidden sm:flex">
              <img src="/logo-mark.svg" class="h-4 w-4 rounded" alt="Open POS" />
              <span class="font-mono font-medium text-text-muted">
                Open POS v0.1.0 • Branch: Sài Gòn Central • Terminal #01
              </span>
            </div>
          </div>

          <!-- Offline Hub Status Indicator -->
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2 py-0.5 font-medium text-success text-[11px]">
              <span class="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
              PouchDB Hub: 127.0.0.1:5984 (LAN Sync Active)
            </span>
          </div>
        </div>

        <!-- POS Interactive Body -->
        <div class="grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
          <!-- Left: Menu Items (7 Cols) -->
          <div class="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-border p-5 flex flex-col justify-between">
            <div>
              <!-- Category Filter Buttons -->
              <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs font-semibold">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 transition-all"
                  :class="selectedCategory === 'all' ? 'bg-primary text-primary-contrast shadow-soft' : 'bg-bg-subtle text-text-muted hover:text-text'"
                  @click="selectedCategory = 'all'"
                >
                  {{ t.simulator.categories.all }}
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 transition-all"
                  :class="selectedCategory === 'coffee' ? 'bg-primary text-primary-contrast shadow-soft' : 'bg-bg-subtle text-text-muted hover:text-text'"
                  @click="selectedCategory = 'coffee'"
                >
                  {{ t.simulator.categories.coffee }}
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 transition-all"
                  :class="selectedCategory === 'food' ? 'bg-primary text-primary-contrast shadow-soft' : 'bg-bg-subtle text-text-muted hover:text-text'"
                  @click="selectedCategory = 'food'"
                >
                  {{ t.simulator.categories.food }}
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 transition-all"
                  :class="selectedCategory === 'dessert' ? 'bg-primary text-primary-contrast shadow-soft' : 'bg-bg-subtle text-text-muted hover:text-text'"
                  @click="selectedCategory = 'dessert'"
                >
                  {{ t.simulator.categories.dessert }}
                </button>
              </div>

              <!-- Menu Grid -->
              <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  v-for="item in filteredMenu"
                  :key="item.id"
                  class="group relative flex flex-col justify-between rounded-xl border border-border bg-surface p-3.5 shadow-soft transition-all duration-150 hover:border-primary/50 hover:shadow-card cursor-pointer select-none"
                  @click="addToCart(item)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span class="text-2xl">{{ item.icon }}</span>
                      <div>
                        <h4 class="font-bold text-sm text-text group-hover:text-primary transition-colors">
                          {{ t.simulator.menu[item.nameKey] }}
                        </h4>
                        <p class="text-[11px] text-text-muted line-clamp-1 mt-0.5">
                          {{ t.simulator.menu[item.descKey] }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="mt-3 flex items-center justify-between pt-2 border-t border-border/60">
                    <span class="font-mono font-bold text-sm text-primary">
                      {{ formatMoney(item.price) }}
                    </span>
                    <span class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary-subtle text-primary group-hover:bg-primary group-hover:text-primary-contrast transition-colors text-xs font-bold">
                      +
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Hint footer -->
            <div class="mt-6 flex items-center justify-between text-[11px] text-text-muted pt-3 border-t border-border">
              <span>💡 Nhấp vào món để thêm vào giỏ hàng</span>
              <button
                v-if="cart.length > 0"
                type="button"
                class="text-danger hover:underline font-medium"
                @click="clearCart"
              >
                Xóa toàn bộ giỏ
              </button>
            </div>
          </div>

          <!-- Right: Order Ticket & Checkout (5 Cols) -->
          <div class="lg:col-span-5 bg-surface p-5 flex flex-col justify-between">
            <!-- Header Ticket -->
            <div>
              <div class="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <h3 class="font-bold text-base text-text">{{ t.simulator.orderPanel.title }}</h3>
                  <p class="text-xs text-text-muted">{{ t.simulator.orderPanel.table }}</p>
                </div>
                <span class="rounded bg-bg-subtle px-2 py-1 font-mono text-[11px] text-text-muted">#HD-8921</span>
              </div>

              <!-- Cart List -->
              <div v-if="cart.length === 0" class="py-12 text-center text-xs text-text-muted">
                {{ t.simulator.orderPanel.empty }}
              </div>

              <div v-else class="divide-y divide-border/60 max-h-[220px] overflow-y-auto pr-1">
                <div v-for="line in cart" :key="line.item.id" class="py-2.5 flex items-center justify-between">
                  <div class="flex-1 pr-2">
                    <div class="font-semibold text-xs text-text">{{ t.simulator.menu[line.item.nameKey] }}</div>
                    <div class="font-mono text-[11px] text-text-muted">{{ formatMoney(line.item.price) }} × {{ line.quantity }}</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="flex items-center rounded-lg border border-border bg-bg-subtle p-0.5">
                      <button
                        type="button"
                        class="h-5 w-5 flex items-center justify-center rounded text-xs font-bold text-text-muted hover:bg-surface hover:text-text"
                        @click="updateQuantity(line.item, -1)"
                      >
                        -
                      </button>
                      <span class="w-6 text-center font-mono text-xs font-bold">{{ line.quantity }}</span>
                      <button
                        type="button"
                        class="h-5 w-5 flex items-center justify-center rounded text-xs font-bold text-text-muted hover:bg-surface hover:text-text"
                        @click="updateQuantity(line.item, 1)"
                      >
                        +
                      </button>
                    </div>

                    <span class="w-18 text-right font-mono font-bold text-xs text-text">
                      {{ formatMoney(line.item.price * line.quantity) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Calculation & Actions -->
            <div class="mt-4 pt-3 border-t border-border space-y-2">
              <div class="flex justify-between text-xs text-text-muted">
                <span>{{ t.simulator.orderPanel.subtotal }}</span>
                <span class="font-mono font-medium">{{ formatMoney(subtotal) }}</span>
              </div>

              <div class="flex items-center justify-between text-xs text-text-muted">
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" v-model="applyDiscount" class="rounded text-primary focus:ring-primary" />
                  <span>{{ t.simulator.orderPanel.discount }}</span>
                </label>
                <span class="font-mono text-success font-medium">-{{ formatMoney(discountAmount) }}</span>
              </div>

              <div class="flex justify-between items-baseline pt-2 border-t border-border">
                <span class="font-bold text-sm text-text">{{ t.simulator.orderPanel.total }}</span>
                <span class="font-mono font-extrabold text-lg text-primary">{{ formatMoney(totalAmount) }}</span>
              </div>

              <!-- Bill Split Demonstration (Largest Remainder) -->
              <div class="rounded-lg bg-bg-subtle p-2.5 border border-border text-xs">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="font-semibold text-text flex items-center gap-1">
                    <svg class="h-3.5 w-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="2" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                    </svg>
                    {{ t.simulator.orderPanel.btnSplit }}
                  </span>
                  <div class="flex items-center gap-1">
                    <button
                      v-for="n in [2, 3, 4]"
                      :key="n"
                      type="button"
                      class="px-2 py-0.5 rounded text-[11px] font-bold"
                      :class="splitWays === n ? 'bg-primary text-primary-contrast' : 'bg-surface border border-border text-text-muted'"
                      @click="splitWays = n"
                    >
                      {{ n }}P
                    </button>
                  </div>
                </div>

                <div v-if="splitAllocation.length > 0" class="font-mono text-[11px] text-text-muted leading-tight">
                  <div class="flex flex-wrap gap-1 mt-1">
                    <span v-for="(part, idx) in splitAllocation" :key="idx" class="rounded bg-surface px-1.5 py-0.5 border border-border">
                      P{{ idx + 1 }}: <strong>{{ formatMoney(part) }}</strong>
                    </span>
                  </div>
                  <div class="text-[10px] text-success mt-1">
                    ✓ Tổng: {{ formatMoney(splitAllocation.reduce((a, b) => a + b, 0)) }} (Bảo toàn số nguyên, 0 xu sai lệch)
                  </div>
                </div>
              </div>

              <!-- Payment Action Buttons -->
              <div class="pt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="btn btn-primary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
                  :disabled="totalAmount <= 0"
                  @click="openQrPayment"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  {{ t.simulator.orderPanel.btnVietQr }}
                </button>

                <button
                  type="button"
                  class="btn btn-secondary py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                  :disabled="totalAmount <= 0"
                  @click="completePayment"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  {{ t.simulator.orderPanel.btnCash }}
                </button>
              </div>

              <!-- Success Alert -->
              <div v-if="paymentSuccess" class="rounded-lg bg-success-subtle border border-success/30 p-2 text-center text-xs font-bold text-success animate-fade-in">
                {{ t.simulator.orderPanel.paidSuccess }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- VietQR Dynamic Payment Modal Simulator -->
    <div v-if="showQrModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl border border-border animate-scale-in">
        <div class="flex items-center justify-between pb-3 border-b border-border">
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-primary-subtle p-1.5 text-primary">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </span>
            <h3 class="font-bold text-base text-text">{{ t.simulator.qrModal.title }}</h3>
          </div>
          <button type="button" class="text-text-muted hover:text-text" @click="showQrModal = false">✕</button>
        </div>

        <div class="mt-4 text-center">
          <p class="text-xs text-text-muted">{{ t.simulator.qrModal.desc }}</p>

          <!-- SVG Simulated VietQR Code -->
          <div class="mt-4 mx-auto w-48 h-48 rounded-xl border-2 border-primary/30 p-2 bg-white shadow-soft flex flex-col items-center justify-center relative">
            <svg class="w-40 h-40" viewBox="0 0 100 100" fill="none">
              <!-- Corner Finder Patterns -->
              <rect x="5" y="5" width="28" height="28" fill="#111827" rx="2" />
              <rect x="9" y="9" width="20" height="20" fill="white" rx="1" />
              <rect x="13" y="13" width="12" height="12" fill="#c2410c" rx="1" />

              <rect x="67" y="5" width="28" height="28" fill="#111827" rx="2" />
              <rect x="71" y="9" width="20" height="20" fill="white" rx="1" />
              <rect x="75" y="13" width="12" height="12" fill="#c2410c" rx="1" />

              <rect x="5" y="67" width="28" height="28" fill="#111827" rx="2" />
              <rect x="9" y="71" width="20" height="20" fill="white" rx="1" />
              <rect x="13" y="75" width="12" height="12" fill="#c2410c" rx="1" />

              <!-- Data Matrix Dots -->
              <rect x="38" y="10" width="8" height="8" fill="#111827" />
              <rect x="50" y="14" width="8" height="8" fill="#111827" />
              <rect x="38" y="26" width="6" height="6" fill="#111827" />
              <rect x="52" y="28" width="6" height="6" fill="#111827" />
              <rect x="14" y="42" width="8" height="8" fill="#111827" />
              <rect x="28" y="46" width="6" height="6" fill="#111827" />
              <rect x="42" y="42" width="16" height="16" fill="#c2410c" rx="3" />
              <text x="50" y="53" font-size="8" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">POS</text>
              <rect x="64" y="42" width="8" height="8" fill="#111827" />
              <rect x="78" y="46" width="8" height="8" fill="#111827" />
              <rect x="38" y="66" width="8" height="8" fill="#111827" />
              <rect x="50" y="72" width="6" height="6" fill="#111827" />
              <rect x="64" y="68" width="8" height="8" fill="#111827" />
              <rect x="78" y="76" width="8" height="8" fill="#111827" />
              <rect x="42" y="86" width="16" height="6" fill="#111827" />
            </svg>
            <span class="absolute bottom-1 text-[9px] font-mono font-bold tracking-widest text-primary">VIETQR • NAPAS 247</span>
          </div>

          <!-- Bank Account Info -->
          <div class="mt-4 rounded-xl bg-bg-subtle p-3 text-left font-mono text-xs space-y-1 border border-border">
            <div class="flex justify-between">
              <span class="text-text-muted">Ngân hàng:</span>
              <span class="font-bold text-text">{{ t.simulator.qrModal.bank }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Chủ tài khoản:</span>
              <span class="font-bold text-text">{{ t.simulator.qrModal.accountName }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Số tiền:</span>
              <span class="font-bold text-primary text-sm">{{ formatMoney(totalAmount) }}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-text-muted">Nội dung:</span>
              <span class="font-bold text-accent">{{ t.simulator.qrModal.transferContent }}</span>
            </div>
          </div>

          <div class="mt-5 flex gap-2">
            <button type="button" class="btn btn-secondary flex-1 py-2 text-xs" @click="showQrModal = false">
              {{ t.simulator.qrModal.btnClose }}
            </button>
            <button type="button" class="btn btn-primary flex-1 py-2 text-xs font-bold" @click="completePayment">
              {{ t.simulator.qrModal.btnDone }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
